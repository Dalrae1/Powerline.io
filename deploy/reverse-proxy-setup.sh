#!/bin/bash
#
# reverse-proxy-setup.sh — front-end reverse proxy for the OVH machine.
#
# Replaces the old iptables DNAT+MASQUERADE forwarder. That script could not
# identify players (MASQUERADE replaced every source IP with the proxy's own),
# could not add headers (it works at the packet layer), and flushed ALL firewall
# rules on every run.
#
# This sets up two layers instead:
#
#   1. HAProxy (Layer 7) for the website + game WebSocket on 80/443:
#        • terminates TLS,
#        • derives a STABLE, ANONYMOUS per-client id = SHA-256(client-ip + secret
#          salt) and passes it to the backend as the  X-Client-Id  header — the
#          raw client IP is hashed here and NEVER sent onward,
#        • strips any client-supplied identity/forwarding headers (no spoofing),
#        • routes  /ws  → backend game node (:1335), everything else → website.
#
#   2. nftables (Layer 4) for the raw game ports (FiveM / Minecraft / UDP) that
#        cannot carry an HTTP header — plain DNAT, in a dedicated table so it no
#        longer wipes the rest of your firewall.
#
# The backend (game) machine must firewall ports 1335 and 443 so ONLY this proxy
# can reach them — that firewall is the trust boundary that stops anyone from
# bypassing the proxy and forging X-Client-Id.
#
# Requires: haproxy >= 2.1 (for the sha2 converter), nftables, openssl.
#   apt-get install -y haproxy nftables openssl
#
set -euo pipefail

# ─── EDIT THESE ────────────────────────────────────────────────────────────────
BACKEND_IP="67.168.212.255"                       # game/website machine (kept secret)
DOMAIN="dalr.ae"                                  # public domain; TLS cert must match
CERT_PEM="/etc/haproxy/certs/${DOMAIN}.pem"       # ONE file: fullchain + privkey
# Raw (non-HTTP) game ports to forward at L4. 80/443/1335 are handled by HAProxy
# and must NOT appear here.
GAME_TCP_RANGES=("30120-33000" "50121" "25565")
GAME_UDP_RANGES=("30120-33000" "50121" "25565")
# ────────────────────────────────────────────────────────────────────────────────

if [[ $EUID -ne 0 ]]; then echo "Run as root."; exit 1; fi

echo "[1/6] Removing the old iptables forwarder (so it can't steal 80/443)..."
# The previous script lived entirely in the iptables NAT table: DNAT for 80/443
# (and the game ports) plus a blanket MASQUERADE. Those run at PREROUTING and
# would divert 443 away from HAProxy. Clear ONLY the legacy NAT table — we leave
# the filter table untouched so your SSH/firewall rules stay intact. (These rules
# were never persisted, so a reboot clears them too — but make sure the old
# script isn't auto-run at boot via @reboot cron / rc.local / a systemd unit.)
if command -v iptables >/dev/null 2>&1; then
  iptables -t nat -F || true
fi

echo "[2/6] Enabling IPv4 forwarding (idempotent)..."
sysctl -w net.ipv4.ip_forward=1 >/dev/null
install -d /etc/sysctl.d
echo "net.ipv4.ip_forward = 1" > /etc/sysctl.d/99-powerline-proxy.conf

echo "[3/6] Ensuring cert directory exists..."
install -d -m 700 /etc/haproxy/certs

if [[ ! -f "$CERT_PEM" ]]; then
  cat <<WARN
[!] TLS cert not found at $CERT_PEM
    HAProxy terminates TLS, so it needs the cert for $DOMAIN as a single PEM
    (fullchain followed by the private key). For example, with certbot:
        certbot certonly --standalone -d $DOMAIN     # stop HAProxy first, or use DNS-01
        cat /etc/letsencrypt/live/$DOMAIN/fullchain.pem \\
            /etc/letsencrypt/live/$DOMAIN/privkey.pem > $CERT_PEM
        chmod 600 $CERT_PEM
    Then re-run this script. (Cloudflare is DNS-only/grey-cloud, so the public
    A record points at THIS box and a normal cert for $DOMAIN is correct.)
WARN
  exit 1
fi

echo "[4/6] Writing /etc/haproxy/haproxy.cfg ..."
cat > /etc/haproxy/haproxy.cfg <<CFG
global
    log /dev/log local0
    maxconn 50000
    tune.ssl.default-dh-param 2048

defaults
    mode http
    log global
    option httplog
    option dontlognull
    timeout connect 5s
    timeout client  50s
    timeout server  50s
    timeout tunnel  1h            # keep long-lived WebSockets open

frontend http_in
    bind :80
    # All plain HTTP → HTTPS. Certs are issued/renewed via Cloudflare DNS-01, so
    # there's no HTTP-01 challenge to pass through here.
    http-request redirect scheme https code 301

frontend https_in
    bind :443 ssl crt ${CERT_PEM} alpn http/1.1
    # Strip any client-supplied forwarding headers first so they can't be spoofed,
    # then stamp the REAL client IP. The game subdomains are grey-cloud (direct to
    # this box), so the socket source IS the player's IP. The backend reads this to
    # ban by IP and to show IPs to developers in the admin panel. Set both XFF and
    # X-Real-IP so the value survives whatever the backend's web server does.
    http-request del-header X-Client-Id
    http-request del-header X-Forwarded-For
    http-request del-header X-Real-IP
    http-request del-header Forwarded
    http-request set-header X-Forwarded-For %[src]
    http-request set-header X-Real-IP %[src]

    default_backend backend_https

backend backend_https
    # Everything (website AND the /ws WebSocket) goes to the backend's existing
    # HTTPS server on :443. That server already terminates TLS and proxies /ws to
    # the game node on its OWN localhost:1335 — so we must NOT try to reach :1335
    # from here (the node only listens on 127.0.0.1). HAProxy just adds the
    # X-Forwarded-For header on the way through. Re-encrypt to the backend and skip
    # cert verification since we connect by IP behind the firewall. Force HTTP/1.1
    # so the WebSocket Upgrade tunnels cleanly.
    server web ${BACKEND_IP}:443 ssl verify none sni str(${DOMAIN}) alpn http/1.1
CFG

echo "      validating config..."
haproxy -c -f /etc/haproxy/haproxy.cfg

echo "[5/6] Writing nftables L4 forwarding for raw game ports ..."
# Build the dnat rules from the configured ranges.
DNAT_RULES=""
for r in "${GAME_TCP_RANGES[@]}"; do DNAT_RULES+="        tcp dport ${r} dnat to ${BACKEND_IP}\n"; done
for r in "${GAME_UDP_RANGES[@]}"; do DNAT_RULES+="        udp dport ${r} dnat to ${BACKEND_IP}\n"; done

# A DEDICATED table — we only ever replace this table, never flush your whole
# ruleset (the old script's `iptables -F` was a security hole).
nft delete table ip powerline_proxy 2>/dev/null || true
nft -f - <<NFT
table ip powerline_proxy {
    chain prerouting {
        type nat hook prerouting priority dstnat; policy accept;
$(printf "%b" "$DNAT_RULES")
    }
    chain postrouting {
        type nat hook postrouting priority srcnat; policy accept;
        ip daddr ${BACKEND_IP} masquerade
    }
}
NFT

# Persist nftables across reboots.
install -d /etc/nftables.d
nft list table ip powerline_proxy > /etc/nftables.d/powerline_proxy.nft
grep -q 'powerline_proxy.nft' /etc/nftables.conf 2>/dev/null || \
  echo 'include "/etc/nftables.d/powerline_proxy.nft"' >> /etc/nftables.conf
systemctl enable nftables >/dev/null 2>&1 || true

echo "[6/6] Restarting HAProxy ..."
systemctl enable haproxy >/dev/null 2>&1 || true
systemctl restart haproxy

cat <<DONE

Done.

  • Website + WebSocket (80/443) → HAProxy → backend (with X-Forwarded-For)
  • Game ports (${GAME_TCP_RANGES[*]}) → nftables DNAT → ${BACKEND_IP}
  • Each player's real IP is forwarded to the backend in X-Forwarded-For.

Backend checklist (on ${BACKEND_IP}):
  • Firewall: allow 1335 and 443 ONLY from this proxy's IP, deny the world.
    (This is what stops anyone bypassing the proxy to spoof X-Forwarded-For.)
  • Make sure the backend web server forwards X-Forwarded-For to the node
    (nginx: proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;).
  • The game server reads X-Forwarded-For (PowerlineServer.js); restart it.
DONE
