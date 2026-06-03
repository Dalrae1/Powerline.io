// ─────────────────────────────────────────────────────────────────────────────
//  AdminPanel — in-game moderation / admin console
//
//  Toggled with the Backslash ( \ ) key. Shows controls appropriate to the
//  player's effective permission level for the CURRENT server, which the server
//  sends via OPCODE_PERMISSIONS:
//
//     0 Player     — cannot open the panel (shows a denial message)
//     1 Moderator  — Players tab: mute / kick / ban / kill / freeze / warn …
//     2 Admin      — + My Snake, Arena tabs (full arena + any-snake control)
//     3 Developer  — + server-structural controls (lifetime, owner, barriers …)
//
//  The player list comes from the server (OPCODE_ADMIN_PLAYERS) so it shows ALL
//  players on the server, not just the ones streamed to this client.
//
//  Every action is sent as a normal command (network.sendCommand) and
//  RE-VALIDATED server-side, so a tampered client cannot gain privileges.
//
//  Theme matches the game: dark teal (#003a3a) panels, cyan (#05ffff) accents.
// ─────────────────────────────────────────────────────────────────────────────

var AdminPanel = function () {
    var level = 0, isOwner = false, isDev = false, isEphemeral = false, isDevServer = false;
    var visible = false;
    var activeTab = 'players';
    var root, panel, header, tabsBar, body;
    var requestTimer = null;

    var players = [];          // latest full list from the server
    var haveServerData = false;
    var filterText = '';       // current name filter
    var listContainer = null;  // rebuilt on refresh (toolbar/filter are NOT)

    var TEAL = '#003a3a', TEAL_DK = '#002a2a', CYAN = '#05ffff', DANGER = '#ff5b5b';
    var ROLE = ['Player', 'Moderator', 'Admin', 'Developer'];
    var ROLE_SHORT = ['P', 'MOD', 'ADM', 'DEV'];

    // ── tiny DOM helpers ───────────────────────────────────────────────────────
    function el(tag, css, text) {
        var e = document.createElement(tag);
        if (css) e.style.cssText = css;
        if (text != null) e.textContent = text;
        return e;
    }
    // opts: { danger, disabled, title, small }
    function button(label, onClick, opts) {
        opts = opts || {};
        var pad = opts.small ? '3px 7px' : '5px 10px';
        var bg = opts.danger ? '#7a2222' : '#077';
        var b = el('button',
            'display:inline-block;margin:2px;padding:' + pad + ';border:none;border-radius:5px;' +
            "font-family:'Arial Black',sans-serif;font-size:12px;color:" + (opts.danger ? '#fff' : '#0ff') + ';' +
            'background-color:' + bg + ';' + (opts.disabled ? 'opacity:0.35;cursor:not-allowed;' : 'cursor:pointer;'));
        b.textContent = label;
        if (opts.disabled) {
            b.disabled = true;
            b.title = opts.title || 'You do not have permission for this action.';
        } else {
            b.onmouseenter = function () { b.style.backgroundColor = opts.danger ? '#a83232' : '#0aa'; };
            b.onmouseleave = function () { b.style.backgroundColor = bg; };
            b.onclick = onClick;
        }
        return b;
    }
    function field(placeholder, width, type) {
        var i = el('input',
            'margin:2px;padding:5px;width:' + (width || 70) + 'px;background-color:' + TEAL + ';' +
            'border:2px solid ' + CYAN + ';border-radius:5px;color:' + CYAN + ';box-shadow:0 0 6px ' + CYAN + ';');
        i.type = type || 'number';
        if (placeholder) i.placeholder = placeholder;
        i.className = 'clickable';
        return i;
    }
    function sectionTitle(t) {
        return el('div',
            'margin:14px 0 6px;font-family:"Arial Black",sans-serif;font-size:14px;color:' + CYAN +
            ';text-shadow:0 0 6px ' + CYAN + ';border-bottom:1px solid ' + CYAN + ';padding-bottom:3px;', t);
    }
    function row() { return el('div', 'display:flex;align-items:center;flex-wrap:wrap;margin:4px 0;'); }

    function send(command) {
        if (typeof network === 'object' && network && network.sendCommand) network.sendCommand(command);
    }

    // Transient themed toast (used for the no-permission message).
    function toast(message) {
        var t = el('div',
            'position:fixed;left:50%;top:14%;transform:translateX(-50%);z-index:1003;' +
            'background-color:' + TEAL + ';border:2px solid ' + CYAN + ';border-radius:8px;' +
            'box-shadow:0 0 16px ' + CYAN + ';color:' + CYAN + ';padding:12px 18px;' +
            'font-family:"Arial Black",sans-serif;font-size:14px;', message);
        document.body.appendChild(t);
        setTimeout(function () { t.style.transition = 'opacity 0.4s'; t.style.opacity = '0'; }, 1800);
        setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 2300);
    }

    // A labelled numeric control with a SLIDER + live value + Set button.
    // onApply(value) is called with the slider's value.
    function sliderRow(label, min, max, value, onApply, step) {
        var r = row();
        r.appendChild(el('span', 'flex:1;min-width:120px;color:' + CYAN + ';font-size:13px;', label));
        var rng = el('input', 'flex:2;min-width:120px;margin:0 8px;');
        rng.type = 'range'; rng.min = min; rng.max = max; rng.step = step || 1; rng.value = value;
        rng.className = 'clickable'; rng.style.accentColor = CYAN;
        var out = el('span', 'width:62px;text-align:right;font-size:12px;color:' + CYAN + ';', String(value));
        rng.oninput = function () { out.textContent = rng.value; };
        r.appendChild(rng);
        r.appendChild(out);
        r.appendChild(button('Set', function () { onApply(rng.value); }));
        return r;
    }

    // Hue slider with a LIVE colour swatch that previews hsl(hue,100%,50%) as the
    // slider moves, before the value is applied.
    function hueRow(label, value, onApply) {
        var r = row();
        r.appendChild(el('span', 'flex:1;min-width:90px;color:' + CYAN + ';font-size:13px;', label));
        var rng = el('input', 'flex:2;min-width:100px;margin:0 8px;');
        rng.type = 'range'; rng.min = 0; rng.max = 360; rng.step = 1; rng.value = value;
        rng.className = 'clickable'; rng.style.accentColor = CYAN;
        var out = el('span', 'width:34px;text-align:right;font-size:12px;color:' + CYAN + ';margin-right:6px;', String(value));
        var sw = el('span', 'display:inline-block;width:22px;height:22px;border-radius:50%;border:1px solid ' + CYAN + ';vertical-align:middle;margin-right:6px;');
        function paint() { out.textContent = rng.value; sw.style.backgroundColor = 'hsl(' + rng.value + ',100%,50%)'; }
        paint();
        rng.oninput = paint;
        r.appendChild(rng);
        r.appendChild(out);
        r.appendChild(sw);
        r.appendChild(button('Set', function () { onApply(rng.value); }));
        return r;
    }

    // A labelled numeric control with a typed input + Set button (for arena cfg).
    function numControl(label, cmd, ph, disabled) {
        var r = row();
        r.appendChild(el('span', 'flex:1;min-width:150px;color:' + CYAN + ';font-size:13px;', label));
        var inp = field(ph, 90);
        if (disabled) inp.disabled = true;
        r.appendChild(inp);
        r.appendChild(button('Set', function () { if (inp.value !== '') send(cmd + ' ' + inp.value); }, { disabled: disabled }));
        return r;
    }

    // ── player list (server-sourced, falls back to streamed entities) ───────────
    function getPlayers() {
        var list = [];
        if (haveServerData) {
            list = players.map(function (p) {
                return {
                    id: p.id, nick: (p.nick && p.nick.trim()) ? p.nick : '<unnamed>',
                    level: p.level | 0, muted: !!p.muted, frozen: !!p.frozen, isBot: !!p.isBot,
                    length: p.length || 0, hue: (typeof p.hue === 'number' ? p.hue : 180),
                    isSelf: (typeof localPlayerID !== 'undefined' && p.id === localPlayerID),
                };
            });
        } else if (typeof entities === 'object' && entities) {
            for (var id in entities) {
                var e = entities[id];
                if (e && e.snake === true) {
                    var nick = (typeof getPlayerName === 'function') ? getPlayerName(e.nick) : (e.nick || '');
                    list.push({ id: e.id, nick: (nick && nick.trim()) ? nick : '<unnamed>',
                        level: 0, muted: false, frozen: false, isBot: false, length: 0,
                        hue: (typeof e.hue === 'number' ? e.hue : 180),
                        isSelf: (typeof localPlayerID !== 'undefined' && e.id === localPlayerID) });
                }
            }
        }
        var f = filterText.trim().toLowerCase();
        if (f) list = list.filter(function (p) { return p.nick.toLowerCase().indexOf(f) !== -1; });
        list.sort(function (a, b) { return (b.isSelf - a.isSelf) || a.nick.localeCompare(b.nick); });
        return list;
    }

    function requestList() {
        if (typeof network === 'object' && network && network.sendAdminListRequest) network.sendAdminListRequest();
    }

    // ── build the panel shell once ───────────────────────────────────────────────
    function build() {
        root = el('div',
            'display:none;position:fixed;left:0;top:0;width:100%;height:100%;z-index:1002;background-color:rgba(0,0,0,0.8);');
        root.addEventListener('mousedown', function (e) { if (e.target === root) hide(); });

        panel = el('div',
            'position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:92%;max-width:680px;' +
            'max-height:84vh;overflow-y:auto;background-color:' + TEAL + ';border:2px solid ' + CYAN + ';' +
            'border-radius:10px;box-shadow:0 0 22px ' + CYAN + ';padding:16px 20px;color:' + CYAN + ';');

        header = el('div', 'display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;');
        panel.appendChild(header);
        tabsBar = el('div', 'display:flex;gap:6px;margin-bottom:10px;flex-wrap:wrap;');
        panel.appendChild(tabsBar);
        body = el('div', '');
        panel.appendChild(body);

        root.appendChild(panel);
        document.body.appendChild(root);
        root.addEventListener('keydown', function (e) { if (e.keyCode === 27) hide(); });
        updateHeader();
    }

    function updateHeader() {
        if (!header) return;
        header.innerHTML = '';
        var title = el('div',
            'font-family:"Arial Black",sans-serif;font-size:20px;color:' + CYAN + ';text-shadow:0 0 8px ' + CYAN + ';',
            'Admin Panel');
        var badge = el('span',
            'margin-left:10px;font-size:12px;padding:2px 8px;border:1px solid ' + CYAN + ';border-radius:10px;',
            ROLE[level] + (isDevServer ? ' · Dev Mode' : (isOwner ? ' · Owner' : '') + (isDev ? ' · Dev' : '')));
        title.appendChild(badge);
        header.appendChild(title);
        header.appendChild(button('✕ Close', hide));
    }

    function tabButton(label, name) {
        var active = activeTab === name;
        var b = el('div',
            'padding:8px 14px;border:2px solid ' + CYAN + ';border-radius:5px 5px 0 0;cursor:pointer;' +
            'font-family:"Arial Black",sans-serif;font-size:13px;' +
            (active ? ('background-color:' + CYAN + ';color:' + TEAL + ';font-weight:bold;')
                    : ('background-color:' + TEAL + ';color:' + CYAN + ';')), label);
        b.onclick = function () {
            activeTab = name;
            render();
            if (name === 'players') requestList();
        };
        return b;
    }

    // ── full render (on open / tab switch) ─────────────────────────────────────
    function render() {
        if (!root) return;
        updateHeader();
        tabsBar.innerHTML = '';
        body.innerHTML = '';
        listContainer = null;

        if (level < 1) {
            body.appendChild(el('div', 'padding:20px;text-align:center;font-size:14px;',
                'You do not have permission to access the admin panel.'));
            return;
        }

        var tabs = [['players', 'Players']];
        if (level >= 2) { tabs.push(['snake', 'My Snake']); tabs.push(['arena', 'Arena']); }
        if (level >= 2 || isOwner || isDev) tabs.push(['server', 'Server']);
        if (!tabs.some(function (t) { return t[0] === activeTab; })) activeTab = 'players';
        tabs.forEach(function (t) { tabsBar.appendChild(tabButton(t[1], t[0])); });

        if (activeTab === 'players') renderPlayers();
        else if (activeTab === 'snake') renderSnake();
        else if (activeTab === 'arena') renderArena();
        else if (activeTab === 'server') renderServer();
    }

    // ── Players tab ──────────────────────────────────────────────────────────────
    function renderPlayers() {
        // Persistent toolbar (filter + global actions + refresh) — NOT rebuilt by
        // the periodic refresh, so the filter textbox keeps focus while typing.
        var toolbar = el('div', 'margin-bottom:8px;');

        var filterRow = row();
        filterRow.appendChild(el('span', 'font-size:13px;margin-right:6px;', '🔍'));
        var filterInput = field('Filter players by name…', 220, 'text');
        filterInput.value = filterText;
        filterInput.oninput = function () { filterText = filterInput.value; renderPlayerCards(); };
        filterRow.appendChild(filterInput);
        filterRow.appendChild(button('⟳ Refresh', requestList));
        toolbar.appendChild(filterRow);

        // Global moderation actions
        var glob = row();
        glob.appendChild(button('📢 Announce', function () {
            var m = window.prompt('Announce to everyone:'); if (m) send('announce ' + m);
        }));
        glob.appendChild(button('Mute All', function () { send('muteall'); }));
        glob.appendChild(button('Unmute All', function () { send('unmuteall'); }));
        glob.appendChild(button('Clear Chat', function () { send('clearchat'); }));
        if (level >= 2) {
            glob.appendChild(button('Kill All', function () { if (confirm('Kill all players you outrank?')) send('killall'); }, { danger: true }));
            glob.appendChild(button('Freeze All', function () { send('freezeall'); }));
            glob.appendChild(button('Unfreeze All', function () { send('unfreezeall'); }));
        }
        toolbar.appendChild(glob);
        body.appendChild(toolbar);

        listContainer = el('div', 'margin-top:4px;');
        body.appendChild(listContainer);
        renderPlayerCards();
    }

    // Rebuilds ONLY the player cards (cheap, focus-aware).
    function renderPlayerCards() {
        if (!listContainer) return;
        listContainer.innerHTML = '';
        var list = getPlayers();
        if (list.length === 0) {
            listContainer.appendChild(el('div', 'padding:14px;text-align:center;',
                haveServerData ? 'No players match.' : 'Loading players…'));
            return;
        }
        list.forEach(function (p) { listContainer.appendChild(playerCard(p)); });
    }

    function badge(text, color) {
        return el('span', 'margin-left:6px;font-size:10px;padding:1px 6px;border-radius:8px;border:1px solid ' + color + ';color:' + color + ';', text);
    }

    function playerCard(p) {
        // Can act on lower-ranked players. On a dev server everyone is level 3
        // and may act on anyone (sandbox), so targeting is always allowed.
        var canTarget = isDevServer || level > p.level;
        var card = el('div',
            'border:1px solid ' + CYAN + ';border-radius:6px;padding:8px;margin-bottom:8px;background-color:' + TEAL_DK + ';');

        var head = row();
        var name = el('span', 'flex:1;font-family:"Arial Black",sans-serif;font-size:13px;color:' + CYAN + ';',
            p.nick + (p.isSelf ? '  (you)' : '') + '  #' + p.id);
        name.appendChild(badge(ROLE_SHORT[p.level] || 'P', CYAN));
        if (p.isBot)  name.appendChild(badge('BOT', '#9fdede'));
        if (p.muted)  name.appendChild(badge('MUTED', DANGER));
        if (p.frozen) name.appendChild(badge('FROZEN', '#7fd0ff'));
        if (p.length) name.appendChild(badge('len ' + p.length, '#9fdede'));
        head.appendChild(name);
        card.appendChild(head);

        // Moderation (level >= 1)
        var mod = row();
        mod.appendChild(button('Kill', function () { send('kill ' + p.id); },
            { danger: true, disabled: !(canTarget || p.isSelf) }));
        mod.appendChild(button('Kick', function () { send('kick ' + p.id); },
            { danger: true, disabled: !canTarget || p.isSelf, title: p.isSelf ? "You can't kick yourself." : undefined }));
        mod.appendChild(button('Ban', function () { if (confirm('Ban ' + p.nick + '?')) send('ban ' + p.id); },
            { danger: true, disabled: !canTarget || p.isSelf }));
        mod.appendChild(button(p.muted ? 'Unmute' : 'Mute', function () { send((p.muted ? 'unmute ' : 'mute ') + p.id); },
            { disabled: !canTarget || p.isSelf }));
        mod.appendChild(button(p.frozen ? 'Unfreeze' : 'Freeze', function () { send((p.frozen ? 'unfreeze ' : 'freeze ') + p.id); },
            { disabled: !canTarget || p.isSelf }));
        mod.appendChild(button('Warn', function () { var m = window.prompt('Warn ' + p.nick + ':'); if (m) send('warn ' + p.id + ' ' + m); },
            { disabled: !canTarget }));
        mod.appendChild(button('Strip Speed', function () { send('stripspeed ' + p.id); }, { disabled: !canTarget }));
        mod.appendChild(button('Clear Streak', function () { send('clearstreak ' + p.id); }, { disabled: !canTarget }));
        card.appendChild(mod);

        // Snake control (level >= 2) — advanced actions use sliders.
        if (level >= 2) {
            var allow = canTarget || p.isSelf;
            if (allow) {
                card.appendChild(sliderRow('Length', 1, 5000, Math.min(5000, p.length || 10),
                    function (v) { send('setlength ' + p.id + ' ' + v); }));
                card.appendChild(sliderRow('Extra speed', 0, 500, 0,
                    function (v) { send('setspeed ' + p.id + ' ' + v); }));
                card.appendChild(hueRow('Hue', (typeof p.hue === 'number' ? p.hue : 180),
                    function (v) { send('sethue ' + p.id + ' ' + v); }));
                var extra = row();
                extra.appendChild(button('Grow +500', function () { send('grow ' + p.id + ' 500'); }));
                extra.appendChild(button('Shrink -500', function () { send('shrink ' + p.id + ' 500'); }));
                extra.appendChild(button('Invinc On', function () { send('invincible ' + p.id + ' 1'); }));
                extra.appendChild(button('Invinc Off', function () { send('invincible ' + p.id + ' 0'); }));
                if (!p.isSelf) {
                    extra.appendChild(button('TP → me', function () { send('bring ' + p.id); }));
                    extra.appendChild(button('Go to', function () { send('tpto ' + p.id); }));
                }
                extra.appendChild(button('Rename', function () { var n = window.prompt('New name for ' + p.nick + ':'); if (n) send('rename ' + p.id + ' ' + n); }));
                card.appendChild(extra);
            } else {
                card.appendChild(el('div', 'font-size:11px;color:#9fdede;margin-top:4px;',
                    'Snake controls disabled — target is equal or higher rank.'));
            }
        }
        return card;
    }

    // ── My Snake tab (level >= 2) ──────────────────────────────────────────────
    function renderSnake() {
        body.appendChild(sectionTitle('My Snake'));
        var inGame = (typeof localPlayerID !== 'undefined' && localPlayerID);
        if (!inGame) { body.appendChild(el('div', 'padding:10px;', 'Join the game to control your own snake.')); return; }
        var id = localPlayerID;
        body.appendChild(sliderRow('Length', 1, 10000, 100, function (v) { send('setlength ' + id + ' ' + v); }));
        body.appendChild(sliderRow('Extra speed', 0, 500, 0, function (v) { send('setspeed ' + id + ' ' + v); }));
        body.appendChild(hueRow('Hue', 180, function (v) { send('sethue ' + id + ' ' + v); }));

        var r = row();
        r.appendChild(el('span', 'flex:1;min-width:150px;font-size:13px;', 'Lock speed (blank input = unlock)'));
        var lock = field('value', 90);
        r.appendChild(lock);
        r.appendChild(button('Apply', function () { send('speedlock' + (lock.value !== '' ? ' ' + lock.value : '')); }));
        body.appendChild(r);

        var r2 = row();
        r2.appendChild(el('span', 'flex:1;min-width:150px;font-size:13px;', 'Teleport to (x, y)'));
        var tx = field('x', 70), ty = field('y', 70);
        r2.appendChild(tx); r2.appendChild(ty);
        r2.appendChild(button('Go', function () { if (tx.value !== '' && ty.value !== '') send('teleport ' + tx.value + ' ' + ty.value); }));
        body.appendChild(r2);

        var r3 = row();
        r3.appendChild(el('span', 'flex:1;min-width:150px;font-size:13px;', 'Invincibility (also toggles with P)'));
        r3.appendChild(button('On', function () { if (network.sendInvincible) network.sendInvincible(true); }));
        r3.appendChild(button('Off', function () { if (network.sendInvincible) network.sendInvincible(false); }));
        body.appendChild(r3);
    }

    // ── Arena tab (level >= 2) ─────────────────────────────────────────────────
    function renderArena() {
        body.appendChild(sectionTitle('Arena Size & Speed'));
        body.appendChild(sliderRow('Arena size', 50, 4000, 300, function (v) { send('arenasize ' + v); }));
        body.appendChild(sliderRow('Max boost speed', 1, 1000, 255, function (v) { send('maxboostspeed ' + v); }));
        body.appendChild(sliderRow('Max rub speed', 1, 1000, 200, function (v) { send('maxrubspeed ' + v); }));
        body.appendChild(sliderRow('Update interval (ms)', 20, 500, 100, function (v) { send('updateinterval ' + v); }));
        body.appendChild(sliderRow('Default length', 1, 500, 10, function (v) { send('defaultlength ' + v); }));

        body.appendChild(sectionTitle('Food'));
        body.appendChild(sliderRow('Food value', 1, 1000, 10, function (v) { send('foodvalue ' + v); }));
        body.appendChild(sliderRow('Food multiplier', 1, 10, 1, function (v) { send('foodmultiplier ' + v); }));
        body.appendChild(sliderRow('Max food', 1, 60000, 60000, function (v) { send('maxfood ' + v); }));
        body.appendChild(sliderRow('Max natural food', 1, 10000, 1500, function (v) { send('maxnaturalfood ' + v); }));
        body.appendChild(sliderRow('Food spawn %', 1, 1000, 100, function (v) { send('foodspawnpercent ' + v); }));

        var r = row();
        r.appendChild(el('span', 'flex:1;min-width:150px;font-size:13px;', 'Spawn food'));
        var cnt = field('count', 80);
        r.appendChild(cnt);
        r.appendChild(button('Random', function () { send('randomfood ' + (cnt.value || 50)); }));
        r.appendChild(button('Near me', function () { send('createfood ' + (cnt.value || 50)); }));
        body.appendChild(r);

        var r2 = row();
        r2.appendChild(el('span', 'flex:1;min-width:150px;font-size:13px;', 'Spawn food at (x, y)'));
        var fx = field('x', 60), fy = field('y', 60), fn = field('count', 60);
        r2.appendChild(fx); r2.appendChild(fy); r2.appendChild(fn);
        r2.appendChild(button('Go', function () { if (fx.value !== '' && fy.value !== '') send('createfoodat ' + fx.value + ' ' + fy.value + ' ' + (fn.value || 20)); }));
        body.appendChild(r2);

        var r3 = row();
        r3.appendChild(el('span', 'flex:1;min-width:150px;font-size:13px;', 'Remove all food'));
        r3.appendChild(button('Clear Food', function () { send('clearfood'); }, { danger: true }));
        body.appendChild(r3);
    }

    // ── Server tab (admins see it; dev-only items are greyed for non-devs) ──────
    function renderServer() {
        var canManage = isOwner || isDev;   // add/remove admin, delete
        var devOnly = !isDev;               // structural items require developer

        body.appendChild(sectionTitle('Admins'));
        var note = el('div', 'font-size:12px;color:#9fdede;margin-bottom:6px;');
        if (isDev) note.textContent = 'Developer: full control of this server regardless of ownership.';
        else if (isOwner) note.textContent = 'Owner: you can manage admins and delete this server.';
        else note.textContent = 'Admin: server management is limited to the owner or a developer.';
        body.appendChild(note);

        var a1 = row();
        a1.appendChild(el('span', 'flex:1;min-width:150px;font-size:13px;', 'Add admin (user id)'));
        var addInp = field('userid', 110); if (!canManage) addInp.disabled = true;
        a1.appendChild(addInp);
        a1.appendChild(button('Add', function () { if (addInp.value !== '') send('addadmin ' + addInp.value); }, { disabled: !canManage }));
        body.appendChild(a1);

        var a2 = row();
        a2.appendChild(el('span', 'flex:1;min-width:150px;font-size:13px;', 'Remove admin (user id)'));
        var remInp = field('userid', 110); if (!canManage) remInp.disabled = true;
        a2.appendChild(remInp);
        a2.appendChild(button('Remove', function () { if (remInp.value !== '') send('removeadmin ' + remInp.value); }, { disabled: !canManage }));
        body.appendChild(a2);

        body.appendChild(sectionTitle('Ephemeral Server'));
        var e1 = row();
        e1.appendChild(el('span', 'flex:1;min-width:150px;font-size:13px;', 'Time left until idle delete'));
        e1.appendChild(button('Check', function () { send('timeleft'); }));
        e1.appendChild(button('Extend (reset timer)', function () { send('extendserver'); }));
        body.appendChild(e1);

        var e2 = row();
        e2.appendChild(el('span', 'flex:1;min-width:150px;font-size:13px;', 'Idle lifetime (minutes) — dev'));
        var lifeInp = field('minutes', 90); if (devOnly) lifeInp.disabled = true;
        e2.appendChild(lifeInp);
        e2.appendChild(button('Set', function () { if (lifeInp.value !== '') send('setservertime ' + lifeInp.value); }, { disabled: devOnly }));
        body.appendChild(e2);

        body.appendChild(sectionTitle('Server Stats (Developer)'));
        body.appendChild(numControl('Max players', 'setmaxplayers', '1-1000', devOnly));
        body.appendChild(numControl('Artificial ping (ms)', 'setping', '0-5000', devOnly));
        var s1 = row();
        s1.appendChild(el('span', 'flex:1;min-width:150px;font-size:13px;', 'Server name'));
        var nameInp = field('name', 140, 'text'); if (devOnly) nameInp.disabled = true;
        s1.appendChild(nameInp);
        s1.appendChild(button('Set', function () { if (nameInp.value !== '') send('setservername ' + nameInp.value); }, { disabled: devOnly }));
        body.appendChild(s1);
        var s2 = row();
        s2.appendChild(el('span', 'flex:1;min-width:150px;font-size:13px;', 'Transfer ownership (user id)'));
        var ownInp = field('userid', 110); if (devOnly) ownInp.disabled = true;
        s2.appendChild(ownInp);
        s2.appendChild(button('Set Owner', function () { if (ownInp.value !== '') send('setowner ' + ownInp.value); }, { disabled: devOnly }));
        body.appendChild(s2);

        body.appendChild(sectionTitle('Barriers & Bans (Developer)'));
        var b1 = row();
        b1.appendChild(el('span', 'flex:1;min-width:120px;font-size:13px;', 'Spawn barrier (x,y,w,h)'));
        var bx = field('x', 55), by = field('y', 55), bw = field('w', 55), bh = field('h', 55);
        [bx, by, bw, bh].forEach(function (i) { if (devOnly) i.disabled = true; b1.appendChild(i); });
        b1.appendChild(button('Add', function () {
            if (bx.value !== '' && by.value !== '' && bw.value !== '' && bh.value !== '')
                send('spawnbarrier ' + bx.value + ' ' + by.value + ' ' + bw.value + ' ' + bh.value);
        }, { disabled: devOnly }));
        body.appendChild(b1);
        var b2 = row();
        b2.appendChild(button('Clear Barriers', function () { send('clearbarriers'); }, { danger: true, disabled: devOnly }));
        b2.appendChild(button('Reset All Bans', function () { send('resetbans'); }, { danger: true, disabled: devOnly }));
        body.appendChild(b2);

        body.appendChild(sectionTitle('Danger Zone'));
        var d = row();
        d.appendChild(el('span', 'flex:1;min-width:150px;font-size:13px;color:' + DANGER + ';', 'Delete this server'));
        d.appendChild(button('Delete Server', function () {
            if (confirm('Delete this server? This cannot be undone.')) send('deleteserver');
        }, { danger: true, disabled: !canManage }));
        body.appendChild(d);
    }

    // ── show / hide ───────────────────────────────────────────────────────────────
    function show() {
        if (level < 1) { toast('You do not have permission to access the admin panel.'); return; }
        visible = true;
        render();
        root.style.display = 'block';
        requestList();
        if (requestTimer) clearInterval(requestTimer);
        // Periodically ask the server for a fresh list. The response handler
        // (onPlayers) rebuilds ONLY the cards, and skips when an input/slider in
        // the list is focused — so it never steals focus from the filter box.
        requestTimer = setInterval(function () { if (visible && activeTab === 'players') requestList(); }, 2000);
    }
    function hide() {
        visible = false;
        if (root) root.style.display = 'none';
        if (requestTimer) { clearInterval(requestTimer); requestTimer = null; }
    }

    // Server pushed a fresh player list.
    function onPlayers(list) {
        players = list || [];
        haveServerData = true;
        if (!visible || activeTab !== 'players' || !listContainer) return;
        // Don't disrupt a control the user is actively using inside the list.
        var ae = document.activeElement;
        if (ae && listContainer.contains(ae)) return;
        renderPlayerCards();
    }

    // ── public API ─────────────────────────────────────────────────────────────────
    this.toggle = function () { if (visible) hide(); else show(); };
    this.isVisible = function () { return visible; };
    this.onPlayers = onPlayers;
    this.onPermissions = function (l, o, d, e, ds) {
        isDevServer = !!ds;
        level = l | 0; isOwner = !!o; isDev = (!!d) || isDevServer; isEphemeral = !!e;
        if (visible && level < 1) { hide(); toast('Your permissions changed — panel access revoked.'); return; }
        if (visible) render(); else updateHeader();
    };

    build();
};

if (typeof module === 'object') {
    module.exports = AdminPanel;
}
