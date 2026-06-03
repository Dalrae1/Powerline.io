// ─────────────────────────────────────────────────────────────────────────────
//  AdminPanel — in-game moderation / admin console
//
//  Toggled with the Backslash ( \ ) key. Shows controls appropriate to the
//  player's effective permission level for the CURRENT server, which the server
//  sends via OPCODE_PERMISSIONS:
//
//     0 Player     — no controls (informational panel only)
//     1 Moderator  — Players tab: mute / kick / ban / kill
//     2 Admin      — + My Snake, Arena, and Server tabs (full arena control)
//     3 Developer  — same as Admin everywhere + delete/own any server
//
//  This is purely a UI convenience: every action is sent as a normal command
//  (network.sendCommand) and RE-VALIDATED server-side, so a tampered client
//  cannot gain privileges it wasn't granted.
//
//  Theme matches the game: dark teal (#003a3a) panels, cyan (#05ffff) accents
//  with a glow, reusing the look of the existing modals.
// ─────────────────────────────────────────────────────────────────────────────

var AdminPanel = function () {
    var level = 0, isOwner = false, isDev = false, isEphemeral = false;
    var visible = false;
    var activeTab = 'players';
    var root, panel, header, tabsBar, body;
    var refreshTimer = null;

    var TEAL = '#003a3a', TEAL_DK = '#002a2a', CYAN = '#05ffff', DANGER = '#ff5b5b';
    var ROLE = ['Player', 'Moderator', 'Admin', 'Developer'];

    // ── tiny DOM helpers ───────────────────────────────────────────────────────
    function el(tag, css, text) {
        var e = document.createElement(tag);
        if (css) e.style.cssText = css;
        if (text != null) e.textContent = text;
        return e;
    }
    function button(label, onClick, danger) {
        var b = el('button',
            'display:inline-block;margin:2px;padding:5px 10px;border:none;border-radius:5px;cursor:pointer;' +
            "font-family:'Arial Black',sans-serif;font-size:12px;color:" + (danger ? '#fff' : '#0ff') + ';' +
            'background-color:' + (danger ? '#7a2222' : '#077') + ';');
        b.textContent = label;
        b.onmouseenter = function () { b.style.backgroundColor = danger ? '#a83232' : '#0aa'; };
        b.onmouseleave = function () { b.style.backgroundColor = danger ? '#7a2222' : '#077'; };
        b.onclick = onClick;
        return b;
    }
    function field(placeholder, width) {
        var i = el('input',
            'margin:2px;padding:5px;width:' + (width || 70) + 'px;background-color:' + TEAL + ';' +
            'border:2px solid ' + CYAN + ';border-radius:5px;color:' + CYAN + ';box-shadow:0 0 6px ' + CYAN + ';');
        i.type = 'number';
        if (placeholder) i.placeholder = placeholder;
        i.className = 'clickable';
        return i;
    }
    function sectionTitle(t) {
        return el('div',
            'margin:14px 0 6px;font-family:"Arial Black",sans-serif;font-size:14px;color:' + CYAN +
            ';text-shadow:0 0 6px ' + CYAN + ';border-bottom:1px solid ' + CYAN + ';padding-bottom:3px;', t);
    }
    function row() {
        return el('div', 'display:flex;align-items:center;flex-wrap:wrap;margin:4px 0;');
    }

    // ── command dispatch ─────────────────────────────────────────────────────────
    function send(command) {
        if (typeof network === 'object' && network && network.sendCommand) network.sendCommand(command);
    }

    // A labelled numeric control: "<label> [input] [Set]" → sends "cmd <value>".
    function numControl(label, cmd, ph) {
        var r = row();
        r.appendChild(el('span', 'flex:1;min-width:150px;color:' + CYAN + ';font-size:13px;', label));
        var inp = field(ph, 90);
        var set = button('Set', function () {
            if (inp.value === '') return;
            send(cmd + ' ' + inp.value);
        });
        r.appendChild(inp);
        r.appendChild(set);
        return r;
    }

    // ── current player list (from streamed entities) ────────────────────────────
    function getPlayers() {
        var out = [];
        if (typeof entities !== 'object' || !entities) return out;
        for (var id in entities) {
            var e = entities[id];
            if (e && e.snake === true) {
                var nick = (typeof getPlayerName === 'function') ? getPlayerName(e.nick) : (e.nick || '');
                out.push({
                    id: e.id,
                    nick: (nick && nick.trim()) ? nick : '<unnamed>',
                    isSelf: (typeof localPlayerID !== 'undefined' && e.id === localPlayerID),
                });
            }
        }
        out.sort(function (a, b) { return (b.isSelf - a.isSelf) || a.nick.localeCompare(b.nick); });
        return out;
    }

    // ── build the panel DOM once ─────────────────────────────────────────────────
    function build() {
        root = el('div',
            'display:none;position:fixed;left:0;top:0;width:100%;height:100%;z-index:1002;' +
            'background-color:rgba(0,0,0,0.8);');
        // Click on the dark backdrop (outside the panel) closes it.
        root.addEventListener('mousedown', function (e) { if (e.target === root) hide(); });

        panel = el('div',
            'position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:90%;max-width:620px;' +
            'max-height:82vh;overflow-y:auto;background-color:' + TEAL + ';border:2px solid ' + CYAN + ';' +
            'border-radius:10px;box-shadow:0 0 22px ' + CYAN + ';padding:16px 20px;color:' + CYAN + ';');

        header = el('div', 'display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;');
        panel.appendChild(header);

        tabsBar = el('div', 'display:flex;gap:6px;margin-bottom:10px;flex-wrap:wrap;');
        panel.appendChild(tabsBar);

        body = el('div', '');
        panel.appendChild(body);

        root.appendChild(panel);
        document.body.appendChild(root);

        // Escape closes the panel even when focus is inside one of its inputs.
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
            ROLE[level] + (isOwner ? ' · Owner' : '') + (isDev ? ' · Dev' : ''));
        title.appendChild(badge);
        var close = button('✕ Close', hide);
        header.appendChild(title);
        header.appendChild(close);
    }

    function tabButton(label, name) {
        var active = activeTab === name;
        var b = el('div',
            'padding:8px 14px;border:2px solid ' + CYAN + ';border-radius:5px 5px 0 0;cursor:pointer;' +
            'font-family:"Arial Black",sans-serif;font-size:13px;' +
            (active ? ('background-color:' + CYAN + ';color:' + TEAL + ';font-weight:bold;')
                    : ('background-color:' + TEAL + ';color:' + CYAN + ';')), label);
        b.onclick = function () { activeTab = name; render(); };
        return b;
    }

    // ── render ───────────────────────────────────────────────────────────────────
    function render() {
        if (!root) return;
        updateHeader();
        tabsBar.innerHTML = '';
        body.innerHTML = '';

        if (level < 1) {
            body.appendChild(el('div', 'padding:20px;text-align:center;font-size:14px;color:' + CYAN + ';',
                'You do not have any admin permissions on this server.'));
            return;
        }

        // Tabs available per level
        var tabs = [['players', 'Players']];
        if (level >= 2) { tabs.push(['snake', 'My Snake']); tabs.push(['arena', 'Arena']); tabs.push(['server', 'Server']); }
        // Ensure the active tab is actually available
        if (!tabs.some(function (t) { return t[0] === activeTab; })) activeTab = 'players';
        tabs.forEach(function (t) { tabsBar.appendChild(tabButton(t[1], t[0])); });

        if (activeTab === 'players') renderPlayers();
        else if (activeTab === 'snake') renderSnake();
        else if (activeTab === 'arena') renderArena();
        else if (activeTab === 'server') renderServer();
    }

    function renderPlayers() {
        var top = row();
        top.appendChild(el('span', 'flex:1;font-size:13px;color:' + CYAN + ';',
            'Players in this arena. Actions are validated by the server.'));
        top.appendChild(button('⟳ Refresh', render));
        body.appendChild(top);

        var players = getPlayers();
        if (players.length === 0) {
            body.appendChild(el('div', 'padding:14px;text-align:center;', 'No players currently visible.'));
            return;
        }

        var list = el('div', 'margin-top:8px;');
        players.forEach(function (p) {
            var card = el('div',
                'border:1px solid ' + CYAN + ';border-radius:6px;padding:8px;margin-bottom:8px;background-color:' + TEAL_DK + ';');

            var head = row();
            head.appendChild(el('span', 'flex:1;font-family:"Arial Black",sans-serif;font-size:13px;color:' + CYAN + ';',
                p.nick + (p.isSelf ? '  (you)' : '') + '   #' + p.id));
            card.appendChild(head);

            // Moderation (level >= 1)
            var mod = row();
            mod.appendChild(button('Kill', function () { send('kill ' + p.id); }, true));
            if (!p.isSelf) {
                mod.appendChild(button('Kick', function () { send('kick ' + p.id); }, true));
                mod.appendChild(button('Ban',  function () { send('ban ' + p.id); }, true));
                mod.appendChild(button('Mute', function () { send('mute ' + p.id); }));
                mod.appendChild(button('Unmute', function () { send('unmute ' + p.id); }));
            }
            card.appendChild(mod);

            // Snake control (level >= 2)
            if (level >= 2) {
                var ctl = row();
                var lenInp = field('length', 80);
                ctl.appendChild(lenInp);
                ctl.appendChild(button('Set Length', function () {
                    if (lenInp.value !== '') send('setlength ' + p.id + ' ' + lenInp.value);
                }));
                var spdInp = field('speed', 80);
                ctl.appendChild(spdInp);
                ctl.appendChild(button('Set Speed', function () {
                    if (spdInp.value !== '') send('setspeed ' + p.id + ' ' + spdInp.value);
                }));
                card.appendChild(ctl);
            }

            list.appendChild(card);
        });
        body.appendChild(list);
    }

    function renderSnake() {
        body.appendChild(sectionTitle('My Snake'));
        var inGame = (typeof localPlayerID !== 'undefined' && localPlayerID);
        if (!inGame) {
            body.appendChild(el('div', 'padding:10px;', 'Join the game to control your own snake.'));
            return;
        }
        var id = localPlayerID;

        var r1 = row();
        var lenInp = field('length', 110);
        r1.appendChild(el('span', 'flex:1;min-width:150px;font-size:13px;', 'Set my length'));
        r1.appendChild(lenInp);
        r1.appendChild(button('Set', function () { if (lenInp.value !== '') send('setlength ' + id + ' ' + lenInp.value); }));
        body.appendChild(r1);

        var r2 = row();
        var spdInp = field('extra speed', 110);
        r2.appendChild(el('span', 'flex:1;min-width:150px;font-size:13px;', 'Set my extra speed'));
        r2.appendChild(spdInp);
        r2.appendChild(button('Set', function () { if (spdInp.value !== '') send('setspeed ' + id + ' ' + spdInp.value); }));
        body.appendChild(r2);

        var r3 = row();
        r3.appendChild(el('span', 'flex:1;min-width:150px;font-size:13px;', 'Lock speed at value (blank = unlock)'));
        var lockInp = field('value', 110);
        r3.appendChild(lockInp);
        r3.appendChild(button('Apply', function () { send('speedlock' + (lockInp.value !== '' ? ' ' + lockInp.value : '')); }));
        body.appendChild(r3);

        var r4 = row();
        r4.appendChild(el('span', 'flex:1;min-width:150px;font-size:13px;', 'Teleport to (x, y)'));
        var tx = field('x', 70), ty = field('y', 70);
        r4.appendChild(tx); r4.appendChild(ty);
        r4.appendChild(button('Go', function () { if (tx.value !== '' && ty.value !== '') send('teleport ' + tx.value + ' ' + ty.value); }));
        body.appendChild(r4);

        var r5 = row();
        r5.appendChild(el('span', 'flex:1;min-width:150px;font-size:13px;', 'Invincibility (also toggles with P)'));
        r5.appendChild(button('On', function () { if (network.sendInvincible) network.sendInvincible(true); }));
        r5.appendChild(button('Off', function () { if (network.sendInvincible) network.sendInvincible(false); }));
        body.appendChild(r5);
    }

    function renderArena() {
        body.appendChild(sectionTitle('Arena Size & Speed'));
        body.appendChild(numControl('Arena size', 'arenasize', '0-10000'));
        body.appendChild(numControl('Max boost speed', 'maxboostspeed', '0-1000'));
        body.appendChild(numControl('Max rub speed', 'maxrubspeed', '0-1000'));
        body.appendChild(numControl('Update interval (ms)', 'updateinterval', '20-10000'));
        body.appendChild(numControl('Default length', 'defaultlength', '1+'));

        body.appendChild(sectionTitle('Food'));
        body.appendChild(numControl('Food value', 'foodvalue', '1-10000'));
        body.appendChild(numControl('Food multiplier', 'foodmultiplier', '1-10'));
        body.appendChild(numControl('Max food', 'maxfood', '1-60000'));
        body.appendChild(numControl('Max natural food', 'maxnaturalfood', '1-10000'));
        body.appendChild(numControl('Food spawn %', 'foodspawnpercent', '1+'));
        body.appendChild(numControl('Spawn random food (count)', 'randomfood', '1-1000'));
        body.appendChild(numControl('Spawn food near me (count)', 'createfood', '1-1000'));

        var r = row();
        r.appendChild(el('span', 'flex:1;min-width:150px;font-size:13px;', 'Remove all food'));
        r.appendChild(button('Clear Food', function () { send('clearfood'); }, true));
        body.appendChild(r);
    }

    function renderServer() {
        body.appendChild(sectionTitle('Server Administration'));

        var note = el('div', 'font-size:12px;color:#9fdede;margin-bottom:8px;');
        if (isDev) note.textContent = 'Developer: you can manage and delete this server regardless of ownership.';
        else if (isOwner) note.textContent = 'Owner: you can manage admins and delete your custom server.';
        else note.textContent = 'Admin: server management (add/remove admin, delete) is limited to the owner or a developer.';
        body.appendChild(note);

        var r1 = row();
        r1.appendChild(el('span', 'flex:1;min-width:150px;font-size:13px;', 'Add admin (user id)'));
        var addInp = field('userid', 110);
        r1.appendChild(addInp);
        r1.appendChild(button('Add', function () { if (addInp.value !== '') send('addadmin ' + addInp.value); }));
        body.appendChild(r1);

        var r2 = row();
        r2.appendChild(el('span', 'flex:1;min-width:150px;font-size:13px;', 'Remove admin (user id)'));
        var remInp = field('userid', 110);
        r2.appendChild(remInp);
        r2.appendChild(button('Remove', function () { if (remInp.value !== '') send('removeadmin ' + remInp.value); }));
        body.appendChild(r2);

        body.appendChild(sectionTitle('Danger Zone'));
        var r3 = row();
        r3.appendChild(el('span', 'flex:1;min-width:150px;font-size:13px;color:' + DANGER + ';', 'Delete this server'));
        r3.appendChild(button('Delete Server', function () {
            if (window.confirm('Delete this server? This cannot be undone.')) send('deleteserver');
        }, true));
        body.appendChild(r3);

        var r4 = row();
        r4.appendChild(el('span', 'flex:1;min-width:150px;font-size:13px;', 'Time left (ephemeral servers)'));
        r4.appendChild(button('Check', function () { send('timeleft'); }));
        body.appendChild(r4);
    }

    // ── show / hide ───────────────────────────────────────────────────────────────
    function show() {
        visible = true;
        render();
        root.style.display = 'block';
        // Live-refresh the player list while open (kills/joins change it).
        if (refreshTimer) clearInterval(refreshTimer);
        refreshTimer = setInterval(function () { if (visible && activeTab === 'players') renderPlayers_inPlace(); }, 2000);
    }
    function hide() {
        visible = false;
        if (root) root.style.display = 'none';
        if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null; }
    }
    // Re-render just the players tab body without resetting tab state.
    function renderPlayers_inPlace() {
        if (activeTab !== 'players') return;
        body.innerHTML = '';
        renderPlayers();
    }

    // ── public API ─────────────────────────────────────────────────────────────────
    this.toggle = function () { if (visible) hide(); else show(); };
    this.isVisible = function () { return visible; };
    this.onPermissions = function (l, o, d, e) {
        level = l | 0; isOwner = !!o; isDev = !!d; isEphemeral = !!e;
        if (visible) render(); else updateHeader();
    };

    build();
};

if (typeof module === 'object') {
    module.exports = AdminPanel;
}
