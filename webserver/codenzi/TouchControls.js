var TouchControls = function () {
    var enabled = (typeof isTouchDevice !== 'undefined') && isTouchDevice;

    var leftHint, rightHint;
    var cogBtn, settingsPopup, serverSelect, chatToggle, rotateNotice;
    var startX = 0, startY = 0, activeId = null;
    var SWIPE_MIN = 26;

    function scheme() { return (typeof controlScheme !== 'undefined') ? controlScheme : 'local'; }
    function inGame() { return !UIVisible && isInGame && !!localPlayer; }

    function isUIEl(t) {
        return !!(t && t.closest && t.closest(
            '#boostBtn,#adminMobileBtn,#adminPanelRoot,#overlay,#chat,#chatToggle,' +
            '#mobileBottomBar,#mobileServerScreen,#controlSettingsPopup,button,input,select,textarea,a'));
    }

    function turnAbsolute(dir) {
        if (!localPlayer) return;
        var cur = input.direction;
        if (cur !== DIRECTION_NONE && dir !== cur && Math.abs(cur - dir) !== 2)
            input.turn(dir, globalWebLag);
    }
    function turnRelative(left) {
        if (!localPlayer) return;
        var cur = input.direction;
        if (cur === DIRECTION_NONE) return;
        var nd = left ? (cur % 4) + 1 : (cur - 1 || 4);
        input.turn(nd, globalWebLag);
    }
    function fireSwipe(dx, dy) {
        if (Math.abs(dx) > Math.abs(dy)) turnAbsolute(dx > 0 ? DIRECTION_RIGHT : DIRECTION_LEFT);
        else                              turnAbsolute(dy > 0 ? DIRECTION_DOWN  : DIRECTION_UP);
    }

    function onStart(e) {
        if (!enabled || !inGame() || isUIEl(e.target)) return;
        var t = e.changedTouches[0];
        activeId = t.identifier; startX = t.clientX; startY = t.clientY;
        if (scheme() === 'local') {
            turnRelative(t.clientX < window.innerWidth / 2);
            e.preventDefault();
        }
    }
    function onMove(e) {
        if (!enabled || !inGame() || isUIEl(e.target)) return;
        e.preventDefault();
        if (scheme() !== 'swipe') return;
        var t = byId(e.changedTouches, activeId); if (!t) return;
        var dx = t.clientX - startX, dy = t.clientY - startY;
        if (Math.abs(dx) >= SWIPE_MIN || Math.abs(dy) >= SWIPE_MIN) {
            fireSwipe(dx, dy);
            startX = t.clientX; startY = t.clientY;
        }
    }
    function onEnd() { activeId = null; }
    function byId(list, id) {
        for (var i = 0; i < list.length; i++) if (list[i].identifier === id) return list[i];
        return null;
    }

    function setScheme(s) {
        controlScheme = s;
        try { localStorage.setItem('controlScheme', s); } catch (_) {}
        paintSchemeButtons();
    }
    function paintSchemeButtons() {
        if (!settingsPopup) return;
        var btns = settingsPopup.querySelectorAll('.ctrlSchemeBtn');
        for (var i = 0; i < btns.length; i++)
            btns[i].classList.toggle('selected', btns[i].getAttribute('data-val') === scheme());
    }
    function mkSchemeBtn(label, val, sub) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'ctrlSchemeBtn';
        b.setAttribute('data-val', val);
        b.innerHTML = '<span class="cs-label">' + label + '</span><span class="cs-sub">' + sub + '</span>';
        b.onclick = function () { setScheme(val); settingsPopup.style.display = 'none'; };
        return b;
    }

    function buildStartUI() {
        function play() {
            var n = document.getElementById('nick');
            var nick = (n && n.value) || (function () { try { return localStorage.nick; } catch (_) { return ''; } })() || '';
            if (typeof clickPlay === 'function') clickPlay(nick);
        }
        var host = document.getElementById('topGui');
        if (host) {
            var playBtn = document.createElement('button');
            playBtn.type = 'button'; playBtn.id = 'mobilePlayBtn'; playBtn.textContent = 'PLAY';
            playBtn.onclick = play;
            host.appendChild(playBtn);
        }
        var stats = document.getElementById('statsPanel');
        if (stats) {
            var again = document.createElement('button');
            again.type = 'button'; again.id = 'mobilePlayAgainBtn'; again.textContent = 'PLAY AGAIN';
            again.onclick = play;
            stats.appendChild(again);
        }
    }

    function buildBottomBar() {
        var bar = document.createElement('div');
        bar.id = 'mobileBottomBar';

        var serversBtn = document.createElement('button');
        serversBtn.type = 'button'; serversBtn.id = 'mobileServersBtn';
        serversBtn.innerHTML = '🌐<span>Servers</span>';
        serversBtn.onclick = openServerScreen;
        bar.appendChild(serversBtn);

        cogBtn = document.createElement('button');
        cogBtn.type = 'button'; cogBtn.id = 'controlSettingsBtn';
        cogBtn.innerHTML = '⚙<span>Controls</span>';
        cogBtn.onclick = function () {
            settingsPopup.style.display = (settingsPopup.style.display === 'block') ? 'none' : 'block';
        };
        bar.appendChild(cogBtn);

        var mute = document.getElementById('muteButton');
        if (mute) { mute.classList.add('barBtn'); bar.appendChild(mute); }

        document.body.appendChild(bar);
        buildControlsPopup();
    }

    function buildControlsPopup() {
        settingsPopup = document.createElement('div');
        settingsPopup.id = 'controlSettingsPopup';
        settingsPopup.style.display = 'none';
        var t = document.createElement('div');
        t.className = 'ctrlSchemeTitle'; t.textContent = 'Controls';
        settingsPopup.appendChild(t);
        settingsPopup.appendChild(mkSchemeBtn('Local Turn', 'local', 'View follows the snake — tap left/right to turn.'));
        settingsPopup.appendChild(mkSchemeBtn('Swipe Control', 'swipe', 'Camera stays fixed — swipe to steer.'));
        document.body.appendChild(settingsPopup);
        paintSchemeButtons();
    }

    function buildServerScreen() {
        var scr = document.createElement('div');
        scr.id = 'mobileServerScreen'; scr.style.display = 'none';

        var head = document.createElement('div');
        head.id = 'mobileServerHead';
        var title = document.createElement('span'); title.textContent = 'Select a Server';
        var close = document.createElement('button');
        close.type = 'button'; close.id = 'mobileServerClose'; close.innerHTML = '✕';
        close.onclick = closeServerScreen;
        head.appendChild(title); head.appendChild(close);
        scr.appendChild(head);

        var list = document.createElement('div');
        list.id = 'mobileServerList';
        list.innerHTML = '<div class="msr-empty">Loading servers…</div>';
        scr.appendChild(list);

        document.body.appendChild(scr);
    }
    function openServerScreen()  { var s = document.getElementById('mobileServerScreen'); if (s) s.style.display = 'flex'; }
    function closeServerScreen() { var s = document.getElementById('mobileServerScreen'); if (s) s.style.display = 'none'; }

    function buildOverlays() {
        chatToggle = document.createElement('div');
        chatToggle.id = 'chatToggle';
        chatToggle.textContent = '💬';
        chatToggle.onclick = function () { document.body.classList.toggle('chat-open'); };
        document.body.appendChild(chatToggle);

        rotateNotice = document.createElement('div');
        rotateNotice.id = 'rotateNotice';
        rotateNotice.innerHTML = '<div>⟳<br>Rotate your device to landscape to play.</div>';
        document.body.appendChild(rotateNotice);
    }

    function buildGameControls() {
        leftHint  = mkHint('left',  '‹');
        rightHint = mkHint('right', '›');
        document.body.appendChild(leftHint);
        document.body.appendChild(rightHint);
    }
    function mkHint(side, glyph) {
        var d = document.createElement('div');
        d.className = 'turnHint ' + side;
        d.textContent = glyph;
        return d;
    }

    function tick() {
        requestAnimationFrame(tick);
        if (!enabled) return;
        var playing = inGame();
        var hintDisp = (playing && scheme() === 'local') ? 'flex' : 'none';
        if (leftHint  && leftHint.style.display  !== hintDisp) leftHint.style.display  = hintDisp;
        if (rightHint && rightHint.style.display !== hintDisp) rightHint.style.display = hintDisp;
        var bar = document.getElementById('mobileBottomBar');
        var barDisp = (!playing && UIVisible) ? 'flex' : 'none';
        if (bar && bar.style.display !== barDisp) bar.style.display = barDisp;
    }

    (function () {
        if (!enabled) return;
        document.body.classList.add('touch-device');
        buildStartUI();
        buildBottomBar();
        buildServerScreen();
        buildOverlays();
        buildGameControls();
        document.addEventListener('touchstart', onStart, { passive: false });
        document.addEventListener('touchmove',  onMove,  { passive: false });
        document.addEventListener('touchend',   onEnd,   { passive: false });
        document.addEventListener('touchcancel', onEnd,  { passive: false });
        requestAnimationFrame(tick);
    })();
};

if (typeof module === 'object') {
    module.exports = TouchControls;
}
