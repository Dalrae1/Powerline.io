// ─────────────────────────────────────────────────────────────────────────────
//  TouchControls — in-browser mobile controls (no native app).
//
//  Only active on touch devices (global `isTouchDevice`). Two schemes, chosen on
//  the start screen and remembered in localStorage as `controlScheme`:
//
//    'swipe'  — camera stays north-up; swiping up/down/left/right turns the snake
//               to that ABSOLUTE direction.
//    'local'  — the camera rotates so the snake always points up (handled in
//               Camera.js); tapping the LEFT half of the screen turns left,
//               the RIGHT half turns right (RELATIVE to the snake's heading).
//
//  A held on-screen BOOST button works in both schemes. Desktop is untouched.
//
//  Directions: UP=1, LEFT=2, DOWN=3, RIGHT=4 (opposite = ±2). So a relative
//  left turn is dir%4+1 and a right turn is dir-1 (wrapping 1→4).
// ─────────────────────────────────────────────────────────────────────────────

var TouchControls = function () {
    var enabled = (typeof isTouchDevice !== 'undefined') && isTouchDevice;

    var boostBtn, leftHint, rightHint;
    var cogBtn, settingsPopup, serverSelect, chatToggle, rotateNotice;
    var startX = 0, startY = 0, activeId = null;
    var boosting = false;
    var SWIPE_MIN = 26;   // px of travel before a swipe registers

    function scheme() { return (typeof controlScheme !== 'undefined') ? controlScheme : 'local'; }
    function inGame() { return !UIVisible && isInGame && !!localPlayer; }

    // Ignore touches that land on real UI (buttons, the admin panel, the start
    // menu, form fields) so they don't also steer the snake.
    function isUIEl(t) {
        return !!(t && t.closest && t.closest(
            '#boostBtn,#adminMobileBtn,#adminPanelRoot,#overlay,#chat,#chatToggle,button,input,select,textarea,a'));
    }

    // ── steering ────────────────────────────────────────────────────────────────
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

    // ── touch handlers (on document; guarded so they only act in-game) ───────────
    function onStart(e) {
        if (!enabled || !inGame() || isUIEl(e.target)) return;
        var t = e.changedTouches[0];
        activeId = t.identifier; startX = t.clientX; startY = t.clientY;
        if (scheme() === 'local') {
            turnRelative(t.clientX < window.innerWidth / 2);   // tap side = relative turn
            e.preventDefault();
        }
    }
    function onMove(e) {
        if (!enabled || !inGame() || isUIEl(e.target)) return;
        e.preventDefault();   // stop the page scrolling while playing (admin panel excluded above)
        if (scheme() !== 'swipe') return;
        var t = byId(e.changedTouches, activeId); if (!t) return;
        var dx = t.clientX - startX, dy = t.clientY - startY;
        if (Math.abs(dx) >= SWIPE_MIN || Math.abs(dy) >= SWIPE_MIN) {
            fireSwipe(dx, dy);
            startX = t.clientX; startY = t.clientY;   // reset origin so a drag can chain turns
        }
    }
    function onEnd() { activeId = null; }
    function byId(list, id) {
        for (var i = 0; i < list.length; i++) if (list[i].identifier === id) return list[i];
        return null;
    }

    // ── boost ─────────────────────────────────────────────────────────────────
    function startBoost() {
        if (boosting) return;
        boosting = true;
        (function loop() {
            if (!boosting) { if (network.sendBoost) network.sendBoost(false); return; }
            if (network.sendBoost) network.sendBoost(true);
            setTimeout(loop, 100);
        })();
    }
    function stopBoost() { boosting = false; if (network.sendBoost) network.sendBoost(false); }

    // ── scheme selection ─────────────────────────────────────────────────────────
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

    // ── start-screen mobile UI: compact server picker, Play, controls cog ─────────
    function buildStartUI() {
        var host = document.getElementById('topGui');
        if (!host) return;

        // Compact server picker — replaces the wide desktop table on mobile.
        // loadServerList() (main.js) fills this; selecting connects immediately.
        var wrap = document.createElement('div');
        wrap.id = 'mobileServerWrap';
        serverSelect = document.createElement('select');
        serverSelect.id = 'mobileServerSelect';
        serverSelect.innerHTML = '<option value="" disabled selected>Loading servers…</option>';
        serverSelect.onchange = function () {
            var o = serverSelect.options[serverSelect.selectedIndex];
            if (!o) return;
            if (o.getAttribute('data-kind') === 'remote') {
                if (typeof joinRemoteServer === 'function') joinRemoteServer(o.getAttribute('data-host'));
            } else if (typeof selectServer === 'function') {
                selectServer(Number(o.getAttribute('data-id')));
            }
        };
        wrap.appendChild(serverSelect);
        host.appendChild(wrap);

        // Play button (no visible Enter key on phones without the keyboard open).
        var playBtn = document.createElement('button');
        playBtn.type = 'button';
        playBtn.id = 'mobilePlayBtn';
        playBtn.textContent = 'PLAY';
        playBtn.onclick = function () {
            var n = document.getElementById('nick');
            if (typeof clickPlay === 'function') clickPlay(n ? n.value : '');
        };
        host.appendChild(playBtn);

        // Controls settings cog + popup (default scheme is Local Turn).
        cogBtn = document.createElement('button');
        cogBtn.type = 'button';
        cogBtn.id = 'controlSettingsBtn';
        cogBtn.innerHTML = '⚙';
        cogBtn.title = 'Controls';
        cogBtn.onclick = function () {
            settingsPopup.style.display = (settingsPopup.style.display === 'block') ? 'none' : 'block';
        };
        host.appendChild(cogBtn);

        settingsPopup = document.createElement('div');
        settingsPopup.id = 'controlSettingsPopup';
        settingsPopup.style.display = 'none';
        var t = document.createElement('div');
        t.className = 'ctrlSchemeTitle';
        t.textContent = 'Controls';
        settingsPopup.appendChild(t);
        settingsPopup.appendChild(mkSchemeBtn('Local Turn', 'local', 'View follows the snake — tap left/right to turn.'));
        settingsPopup.appendChild(mkSchemeBtn('Swipe Control', 'swipe', 'Camera stays fixed — swipe to steer.'));
        host.appendChild(settingsPopup);
        paintSchemeButtons();
    }

    // ── fixed overlays outside the menu: chat toggle + portrait notice ───────────
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

    // ── in-game control overlays ────────────────────────────────────────────────
    function buildGameControls() {
        boostBtn = document.createElement('div');
        boostBtn.id = 'boostBtn';
        boostBtn.textContent = 'BOOST';
        document.body.appendChild(boostBtn);
        boostBtn.addEventListener('touchstart', function (e) { e.preventDefault(); e.stopPropagation(); startBoost(); }, { passive: false });
        boostBtn.addEventListener('touchend',   function (e) { e.preventDefault(); e.stopPropagation(); stopBoost(); },  { passive: false });
        boostBtn.addEventListener('touchcancel', stopBoost);

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

    // Toggle overlay visibility based on game state (cheap; runs each frame).
    function tick() {
        requestAnimationFrame(tick);
        if (!enabled) return;
        var show = inGame();
        var disp = show ? 'flex' : 'none';
        if (boostBtn && boostBtn.style.display !== disp) boostBtn.style.display = disp;
        // Left/right tap hints only make sense in 'local' mode.
        var hintDisp = (show && scheme() === 'local') ? 'flex' : 'none';
        if (leftHint  && leftHint.style.display  !== hintDisp) leftHint.style.display  = hintDisp;
        if (rightHint && rightHint.style.display !== hintDisp) rightHint.style.display = hintDisp;
        if (!show && boosting) stopBoost();
    }

    // ── init ────────────────────────────────────────────────────────────────────
    (function () {
        if (!enabled) return;
        document.body.classList.add('touch-device');
        buildStartUI();
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
