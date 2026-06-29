var BarrierEditor = function () {
    var ed = this;

    var TEAL = '#003a3a', CYAN = '#05ffff', DANGER = '#ff5b5b';
    var BARRIER_FILL = '#023139', ARENA_LINE = '#0555FF', ARENA_GLOW = '#AAFFFF';

    var MIN_WORLD  = GAME_SCALE * 1;
    var NEW_WORLD  = GAME_SCALE * 15;
    var HANDLE_PX  = 7;
    var HIT_PX     = 11;

    var built = false;
    var active = false;
    var overlay, canvas, ctx, sidePanel, listEl, hintEl, selBox, fileInput;

    var cam = { x: 0, y: 0, zoom: 1 };
    var selected = -1;
    var placing = false;
    var mouse = { x: 0, y: 0, world: { x: 0, y: 0 } };

    var draft = null;
    var pendingVersion = null;
    var selectLastAfterUpdate = false;

    var drag = null;
    var moved = false;
    var downSX = 0, downSY = 0;
    var frozenId = 0;
    var lastVersionSeen = -1;
    var needListRebuild = false;
    var raf = null;

    var HANDLES = [
        [-1, -1], [0, -1], [1, -1],
        [-1,  0],          [1,  0],
        [-1,  1], [0,  1], [1,  1]
    ];

    function send(cmd) {
        if (typeof network === 'object' && network && network.sendCommand) network.sendCommand(cmd);
    }
    function r2(v) { return Math.round(v * 100) / 100; }

    function worldToScreen(wx, wy) {
        return { x: (wx - cam.x) * cam.zoom + canvas.width / 2,
                 y: (wy - cam.y) * cam.zoom + canvas.height / 2 };
    }
    function screenToWorld(sx, sy) {
        return { x: (sx - canvas.width / 2) / cam.zoom + cam.x,
                 y: (sy - canvas.height / 2) / cam.zoom + cam.y };
    }
    function toServer(b) {
        return { x: r2(b.x / GAME_SCALE), y: r2(-b.y / GAME_SCALE),
                 w: r2(b.width / GAME_SCALE), h: r2(b.height / GAME_SCALE) };
    }

    function barriers() { return (typeof map === 'object' && map && map.getBarriers) ? map.getBarriers() : []; }
    function dispBarrier(i) {
        if (draft && draft.index === i) return draft;
        return barriers()[i];
    }

    function elm(tag, css, text) {
        var e = document.createElement(tag);
        if (css) e.style.cssText = css;
        if (text != null) e.textContent = text;
        return e;
    }
    function btn(label, onClick, opts) {
        opts = opts || {};
        var b = elm('button',
            'display:block;width:100%;margin:4px 0;padding:7px 10px;border:none;border-radius:6px;' +
            "font-family:'Arial Black',sans-serif;font-size:12px;cursor:pointer;" +
            'color:' + (opts.danger ? '#fff' : '#0ff') + ';' +
            'background-color:' + (opts.danger ? '#7a2222' : '#077') + ';', label);
        b.onclick = onClick;
        return b;
    }
    function smallBtn(label, onClick, danger) {
        var b = elm('button',
            'margin-left:4px;padding:3px 7px;border:none;border-radius:4px;font-size:11px;cursor:pointer;' +
            "font-family:'Arial Black',sans-serif;color:" + (danger ? '#fff' : '#0ff') + ';' +
            'background-color:' + (danger ? '#7a2222' : '#077') + ';', label);
        b.onclick = onClick;
        return b;
    }

    function build() {
        if (built) return;
        built = true;

        overlay = elm('div',
            'display:none;position:fixed;left:0;top:0;width:100%;height:100%;z-index:1400;background-color:#01211f;');

        canvas = elm('canvas', 'position:absolute;left:0;top:0;width:100%;height:100%;cursor:default;');
        overlay.appendChild(canvas);
        ctx = canvas.getContext('2d');

        sidePanel = elm('div',
            'position:absolute;left:0;top:0;width:300px;height:100%;box-sizing:border-box;overflow-y:auto;' +
            'background-color:' + TEAL + ';border-right:2px solid ' + CYAN + ';box-shadow:0 0 18px ' + CYAN + ';' +
            'padding:14px 14px 30px;color:' + CYAN + ";font-family:Arial,sans-serif;");
        overlay.appendChild(sidePanel);

        var titleRow = elm('div', 'display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;');
        titleRow.appendChild(elm('div',
            'font-family:"Arial Black",sans-serif;font-size:18px;text-shadow:0 0 8px ' + CYAN + ';', 'Barrier Editor'));
        var closeX = smallBtn('✕ Close', function () { ed.close(); });
        titleRow.appendChild(closeX);
        sidePanel.appendChild(titleRow);

        sidePanel.appendChild(btn('➕ Create New Barrier', function () { startPlacing(); }));

        var io = elm('div', 'display:flex;gap:6px;');
        var impBtn = btn('⬆ Import', function () { fileInput.click(); });
        var expBtn = btn('⬇ Export', function () { exportBarriers(); });
        impBtn.style.width = 'auto'; impBtn.style.flex = '1';
        expBtn.style.width = 'auto'; expBtn.style.flex = '1';
        io.appendChild(impBtn); io.appendChild(expBtn);
        sidePanel.appendChild(io);

        fileInput = elm('input', 'display:none;');
        fileInput.type = 'file';
        fileInput.accept = '.json,application/json';
        fileInput.onchange = function () {
            if (fileInput.files && fileInput.files[0]) importBarriers(fileInput.files[0]);
            fileInput.value = '';
        };
        sidePanel.appendChild(fileInput);

        hintEl = elm('div', 'font-size:11px;color:#9fdede;line-height:1.5;margin:6px 0 10px;');
        sidePanel.appendChild(hintEl);

        selBox = elm('div', 'margin-bottom:10px;');
        sidePanel.appendChild(selBox);

        sidePanel.appendChild(elm('div',
            'margin:6px 0 4px;font-family:"Arial Black",sans-serif;font-size:13px;border-bottom:1px solid ' + CYAN + ';padding-bottom:3px;',
            'All Barriers'));
        listEl = elm('div', '');
        sidePanel.appendChild(listEl);

        canvas.addEventListener('mousedown', onMouseDown, false);
        window.addEventListener('mousemove', onMouseMove, false);
        window.addEventListener('mouseup', onMouseUp, false);
        canvas.addEventListener('wheel', onWheel, { passive: false });
        canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });
        window.addEventListener('resize', resize, false);
        document.body.appendChild(overlay);
    }

    function resize() {
        if (!active) return;
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    }

    function setHint(msg) {
        hintEl.textContent = msg || 'Drag empty space to pan · scroll to zoom · click a barrier to select · drag its handles to resize.';
    }

    this.open = function () {
        build();
        active = true;
        overlay.style.display = 'block';
        resize();
        cam.x = arenaCenterX; cam.y = arenaCenterY;
        var zx = canvas.width / (arenaWidth + GAME_SCALE * 40);
        var zy = canvas.height / (arenaHeight + GAME_SCALE * 40);
        cam.zoom = Math.max(0.02, Math.min(zx, zy));
        selected = -1; draft = null; drag = null; placing = false;
        lastVersionSeen = -1; needListRebuild = true;
        setHint();

        frozenId = (typeof localPlayerID !== 'undefined' && localPlayerID) ? localPlayerID : 0;
        if (frozenId) send('freeze ' + frozenId);

        document.addEventListener('keydown', onKeyDown, true);
        if (!raf) loop();
    };

    this.close = function () {
        if (!active) return;
        active = false;
        overlay.style.display = 'none';
        if (frozenId) { send('unfreeze ' + frozenId); frozenId = 0; }
        document.removeEventListener('keydown', onKeyDown, true);
        if (raf) { cancelAnimationFrame(raf); raf = null; }
        if (typeof adminPanel === 'object' && adminPanel && adminPanel.show) adminPanel.show();
    };

    this.isOpen = function () { return active; };

    function startPlacing() {
        placing = true;
        canvas.style.cursor = 'crosshair';
        setHint('Click anywhere in the arena to drop the new barrier\'s centre.');
    }
    function placeAt(world) {
        var b = { x: world.x, y: world.y, width: NEW_WORLD, height: NEW_WORLD };
        var s = toServer(b);
        send('spawnbarrier ' + s.x + ' ' + s.y + ' ' + s.w + ' ' + s.h);
        selectLastAfterUpdate = true;
        pendingVersion = map.barrierVersion;
        placing = false;
        canvas.style.cursor = 'default';
        setHint('Barrier created — drag the handles to size it.');
    }

    function exportBarriers() {
        var arr = barriers().map(function (b) { var s = toServer(b); return { x: s.x, y: s.y, width: s.w, height: s.h }; });
        var data = { type: 'powerline-barriers', version: 1, count: arr.length, barriers: arr };
        var json = JSON.stringify(data, null, 2);
        var blob = new Blob([json], { type: 'application/json' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = 'barriers-' + arr.length + '-' + Date.now() + '.json';
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
        setHint('Exported ' + arr.length + ' barrier(s) to a .json file.');
    }

    function importBarriers(file) {
        var reader = new FileReader();
        reader.onload = function () {
            var parsed, arr;
            try { parsed = JSON.parse(reader.result); }
            catch (e) { setHint('Import failed: that file is not valid JSON.'); return; }
            arr = Array.isArray(parsed) ? parsed
                : (parsed && Array.isArray(parsed.barriers) ? parsed.barriers : null);
            if (!arr) { setHint('Import failed: no barrier list found in the file.'); return; }

            var clean = [];
            for (var i = 0; i < arr.length; i++) {
                var b = arr[i]; if (!b) continue;
                var x = Number(b.x), y = Number(b.y), w = Number(b.width), h = Number(b.height);
                if (!isFinite(x) || !isFinite(y) || !isFinite(w) || !isFinite(h)) continue;
                if (w <= 0 || h <= 0) continue;
                clean.push({ x: x, y: y, width: w, height: h });
            }
            if (!clean.length) { setHint('Import failed: no valid barriers in the file.'); return; }
            if (!confirm('Replace all current barriers with ' + clean.length + ' imported barrier(s)? This cannot be undone.')) return;

            send('setbarriers ' + JSON.stringify(clean));
            pendingVersion = map.barrierVersion;
            selected = -1; draft = null; needListRebuild = true;
            setHint('Imported ' + clean.length + ' barrier(s).');
        };
        reader.readAsText(file);
    }

    function barrierAt(world) {
        var list = barriers();
        for (var i = list.length - 1; i >= 0; i--) {
            var b = dispBarrier(i);
            if (Math.abs(world.x - b.x) <= b.width / 2 && Math.abs(world.y - b.y) <= b.height / 2) return i;
        }
        return -1;
    }
    function handleAt(screen) {
        if (selected < 0) return null;
        var b = dispBarrier(selected);
        if (!b) return null;
        var best = null, bestD = HIT_PX * HIT_PX;
        for (var k = 0; k < HANDLES.length; k++) {
            var hx = HANDLES[k][0], hy = HANDLES[k][1];
            var p = worldToScreen(b.x + hx * b.width / 2, b.y + hy * b.height / 2);
            var dx = p.x - screen.x, dy = p.y - screen.y;
            var d = dx * dx + dy * dy;
            var bias = (hx !== 0 && hy !== 0) ? 4 : 0;
            if (d - bias <= bestD) { bestD = d; best = [hx, hy]; }
        }
        return best;
    }
    function selectBarrier(i, recenter) {
        selected = i;
        needListRebuild = true;
        if (recenter && i >= 0) { var b = barriers()[i]; if (b) { cam.x = b.x; cam.y = b.y; } }
    }

    function localPos(e) {
        var r = canvas.getBoundingClientRect();
        return { x: e.clientX - r.left, y: e.clientY - r.top };
    }
    function onMouseDown(e) {
        if (!active) return;
        if (e.button === 2) e.preventDefault();
        e.stopPropagation();
        var s = localPos(e);
        var w = screenToWorld(s.x, s.y);
        mouse.x = s.x; mouse.y = s.y; mouse.world = w;
        moved = false; downSX = s.x; downSY = s.y;

        if (placing) { placeAt(w); return; }

        if (e.button === 1 || e.button === 2) { drag = { type: 'pan', sx: s.x, sy: s.y }; return; }

        var h = handleAt(s);
        if (h && (h[0] !== 0 || h[1] !== 0)) { beginResize(h, w); return; }

        var i = barrierAt(w);
        if (i >= 0) {
            if (i !== selected) selectBarrier(i, false);
            var b = barriers()[i];
            drag = { type: 'move', index: i, ox: w.x - b.x, oy: w.y - b.y };
            return;
        }

        drag = { type: 'pan', sx: s.x, sy: s.y, fromEmpty: true };
    }

    function beginResize(h, w) {
        var b = barriers()[selected];
        var fx = h[0] > 0 ? b.x - b.width / 2 : (h[0] < 0 ? b.x + b.width / 2 : null);
        var fy = h[1] > 0 ? b.y - b.height / 2 : (h[1] < 0 ? b.y + b.height / 2 : null);
        drag = { type: 'resize', index: selected, hx: h[0], hy: h[1], fx: fx, fy: fy,
                 x0: b.x, y0: b.y, w0: b.width, h0: b.height };
        canvas.style.cursor = 'nwse-resize';
    }

    function onMouseMove(e) {
        if (!active) return;
        var s = localPos(e);
        var w = screenToWorld(s.x, s.y);
        mouse.x = s.x; mouse.y = s.y; mouse.world = w;
        if (!drag) { updateCursor(s); return; }
        if (Math.abs(s.x - downSX) > 3 || Math.abs(s.y - downSY) > 3) moved = true;

        if (drag.type === 'pan') {
            cam.x -= (s.x - drag.sx) / cam.zoom;
            cam.y -= (s.y - drag.sy) / cam.zoom;
            drag.sx = s.x; drag.sy = s.y;
            moved = true;
        } else if (drag.type === 'move') {
            var b = barriers()[drag.index];
            draft = { index: drag.index, x: w.x - drag.ox, y: w.y - drag.oy, width: b.width, height: b.height };
        } else if (drag.type === 'resize') {
            var nx = drag.x0, ny = drag.y0, nw = drag.w0, nh = drag.h0;
            if (drag.hx > 0) { nw = Math.max(MIN_WORLD, w.x - drag.fx); nx = drag.fx + nw / 2; }
            else if (drag.hx < 0) { nw = Math.max(MIN_WORLD, drag.fx - w.x); nx = drag.fx - nw / 2; }
            if (drag.hy > 0) { nh = Math.max(MIN_WORLD, w.y - drag.fy); ny = drag.fy + nh / 2; }
            else if (drag.hy < 0) { nh = Math.max(MIN_WORLD, drag.fy - w.y); ny = drag.fy - nh / 2; }
            draft = { index: drag.index, x: nx, y: ny, width: nw, height: nh };
        }
    }

    function onMouseUp(e) {
        if (!active || !drag) { drag = null; return; }
        var d = drag; drag = null;
        canvas.style.cursor = placing ? 'crosshair' : 'default';

        if (d.type === 'pan') {
            if (!moved && d.fromEmpty) selectBarrier(-1, false);
            return;
        }
        if ((d.type === 'move' || d.type === 'resize') && draft) {
            if (moved) commitDraft(d.index);
            else draft = null;
        }
    }

    function commitDraft(i) {
        var s = toServer(draft);
        send('editbarrier ' + i + ' ' + s.x + ' ' + s.y + ' ' + s.w + ' ' + s.h);
        pendingVersion = map.barrierVersion;
        needListRebuild = true;
    }

    function updateCursor(s) {
        if (placing) { canvas.style.cursor = 'crosshair'; return; }
        var h = handleAt(s);
        if (h && (h[0] !== 0 || h[1] !== 0)) {
            var diag = (h[0] !== 0 && h[1] !== 0);
            canvas.style.cursor = diag ? (h[0] === h[1] ? 'nwse-resize' : 'nesw-resize')
                                       : (h[0] !== 0 ? 'ew-resize' : 'ns-resize');
        } else if (barrierAt(mouse.world) >= 0) {
            canvas.style.cursor = 'move';
        } else {
            canvas.style.cursor = 'grab';
        }
    }

    function onWheel(e) {
        if (!active) return;
        e.preventDefault(); e.stopPropagation();
        var s = localPos(e);
        var before = screenToWorld(s.x, s.y);
        var factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
        cam.zoom = Math.max(0.01, Math.min(12, cam.zoom * factor));
        var after = screenToWorld(s.x, s.y);
        cam.x += before.x - after.x;
        cam.y += before.y - after.y;
    }

    function onKeyDown(e) {
        if (!active) return;
        var tag = document.activeElement && document.activeElement.tagName;
        var typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
        var panStep = 60 / cam.zoom;
        var k = e.keyCode;
        e.stopPropagation();
        if (k === 27) { e.preventDefault(); ed.close(); return; }
        if (typing) return;
        if (k === 87 || k === 38) cam.y -= panStep;
        else if (k === 83 || k === 40) cam.y += panStep;
        else if (k === 65 || k === 37) cam.x -= panStep;
        else if (k === 68 || k === 39) cam.x += panStep;
        else if (k === 187 || k === 107) cam.zoom = Math.min(12, cam.zoom * 1.12);
        else if (k === 189 || k === 109) cam.zoom = Math.max(0.01, cam.zoom / 1.12);
        else if ((k === 46 || k === 8) && selected >= 0) deleteSelected();
        else e.preventDefault();
    }

    function deleteSelected() {
        if (selected < 0) return;
        send('deletebarrier ' + selected);
        pendingVersion = map.barrierVersion;
        selected = -1; draft = null; needListRebuild = true;
    }

    function field(value, onChange) {
        var i = elm('input',
            'width:52px;margin:0 3px;padding:3px;background-color:' + TEAL + ';border:1px solid ' + CYAN + ';' +
            'border-radius:4px;color:' + CYAN + ';font-size:11px;');
        i.type = 'number'; i.value = value;
        i.onchange = function () { onChange(parseFloat(i.value)); };
        return i;
    }

    function rebuildSelectedBox() {
        selBox.innerHTML = '';
        if (selected < 0 || !barriers()[selected]) {
            selBox.appendChild(elm('div', 'font-size:11px;color:#9fdede;', 'No barrier selected.'));
            return;
        }
        var s = toServer(barriers()[selected]);
        selBox.appendChild(elm('div',
            'font-family:"Arial Black",sans-serif;font-size:12px;margin-bottom:4px;', 'Selected: #' + selected));
        var grid = elm('div', 'display:flex;flex-wrap:wrap;gap:2px 0;align-items:center;font-size:11px;');
        function pair(label, val, key) {
            grid.appendChild(elm('span', 'width:14px;', label));
            grid.appendChild(field(val, function (v) {
                if (isNaN(v)) return;
                var cur = toServer(barriers()[selected]);
                cur[key] = v;
                send('editbarrier ' + selected + ' ' + cur.x + ' ' + cur.y + ' ' + cur.w + ' ' + cur.h);
                pendingVersion = map.barrierVersion;
            }));
        }
        pair('X', s.x, 'x'); pair('Y', s.y, 'y');
        pair('W', s.w, 'w'); pair('H', s.h, 'h');
        selBox.appendChild(grid);
        selBox.appendChild(smallBtn('🗑 Delete barrier', deleteSelected, true));
    }

    function rebuildList() {
        rebuildSelectedBox();
        listEl.innerHTML = '';
        var list = barriers();
        if (!list.length) {
            listEl.appendChild(elm('div', 'font-size:11px;color:#9fdede;padding:4px 0;', 'No barriers yet.'));
            return;
        }
        list.forEach(function (b, i) {
            var s = toServer(b);
            var rowSel = (i === selected);
            var rowEl = elm('div',
                'display:flex;align-items:center;justify-content:space-between;padding:5px 6px;margin:3px 0;' +
                'border-radius:5px;font-size:11px;cursor:pointer;' +
                (rowSel ? 'background-color:' + CYAN + ';color:' + TEAL + ';' : 'background-color:' + TEAL + ';border:1px solid ' + CYAN + ';'));
            var label = elm('span', '', '#' + i + '  (' + s.x + ', ' + s.y + ')  ' + s.w + '×' + s.h);
            rowEl.appendChild(label);
            rowEl.onclick = function () { selectBarrier(i, true); };
            var del = smallBtn('🗑', function (ev) { ev.stopPropagation(); selected = i; deleteSelected(); }, true);
            rowEl.appendChild(del);
            listEl.appendChild(rowEl);
        });
    }

    function loop() {
        raf = requestAnimationFrame(loop);
        if (!active) return;
        syncFromServer();
        draw();
    }

    function syncFromServer() {
        var v = (typeof map === 'object' && map) ? map.barrierVersion : 0;
        if (v === lastVersionSeen) return;
        lastVersionSeen = v;

        if (pendingVersion !== null && v !== pendingVersion) {
            draft = null; pendingVersion = null;
        }
        if (selectLastAfterUpdate) {
            selectLastAfterUpdate = false;
            selectBarrier(barriers().length - 1, false);
        }
        if (selected >= barriers().length) selected = -1;
        needListRebuild = true;
    }

    function draw() {
        var W = canvas.width, H = canvas.height;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.fillStyle = '#01211f';
        ctx.fillRect(0, 0, W, H);

        drawGrid(W, H);
        drawArena();
        drawSnakes();

        var list = barriers();
        for (var i = 0; i < list.length; i++) drawBarrier(i);
        if (selected >= 0 && dispBarrier(selected)) drawHandles(dispBarrier(selected));

        if (placing) drawCrosshair();
        drawHud(W, H);

        var tag = document.activeElement && document.activeElement.tagName;
        var typing = (tag === 'INPUT') && sidePanel.contains(document.activeElement);
        if (needListRebuild && !drag && !typing) { needListRebuild = false; rebuildList(); }
    }

    function drawGrid(W, H) {
        var step = GAME_SCALE * 10;
        while (step * cam.zoom < 28) step *= 5;
        var tl = screenToWorld(0, 0), br = screenToWorld(W, H);
        ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(5,255,255,0.06)';
        ctx.beginPath();
        for (var gx = Math.floor(tl.x / step) * step; gx <= br.x; gx += step) {
            var a = worldToScreen(gx, tl.y), b = worldToScreen(gx, br.y);
            ctx.moveTo(a.x, 0); ctx.lineTo(b.x, H);
        }
        for (var gy = Math.floor(tl.y / step) * step; gy <= br.y; gy += step) {
            var c = worldToScreen(tl.x, gy), d = worldToScreen(br.x, gy);
            ctx.moveTo(0, c.y); ctx.lineTo(W, d.y);
        }
        ctx.stroke();
    }

    function drawArena() {
        var halfW = arenaWidth / 2, halfH = arenaHeight / 2;
        var p = worldToScreen(arenaCenterX - halfW, arenaCenterY - halfH);
        var w = arenaWidth * cam.zoom, h = arenaHeight * cam.zoom;
        ctx.fillStyle = 'rgba(2,49,57,0.35)';
        ctx.fillRect(p.x, p.y, w, h);
        ctx.save();
        ctx.shadowColor = ARENA_LINE; ctx.shadowBlur = 8;
        ctx.strokeStyle = ARENA_GLOW; ctx.lineWidth = 2;
        ctx.strokeRect(p.x, p.y, w, h);
        ctx.restore();
    }

    function drawSnakes() {
        if (typeof entities !== 'object' || !entities) return;
        ctx.save();
        ctx.globalAlpha = 0.9;
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        for (var id in entities) {
            var e = entities[id];
            if (!e || !e.snake || e.tutorial) continue;
            var pts = (e.renderedPoints && e.renderedPoints.length > 1)
                ? e.renderedPoints
                : [{ x: e.x, y: e.y }].concat(e.points || []);
            if (!pts || pts.length < 1) continue;

            var w = (typeof e.getWidth === 'function' ? e.getWidth() : 8) * (e.snakeScale || 1);
            var color = 'hsl(' + (e.hue || 0) + ', 100%, 60%)';
            var isSelf = (typeof localPlayerID !== 'undefined' && id == localPlayerID);

            if (pts.length > 1) {
                ctx.beginPath();
                var p0 = worldToScreen(pts[0].x, pts[0].y);
                ctx.moveTo(p0.x, p0.y);
                for (var i = 1; i < pts.length; i++) {
                    var p = worldToScreen(pts[i].x, pts[i].y);
                    ctx.lineTo(p.x, p.y);
                }
                ctx.strokeStyle = color;
                ctx.lineWidth = Math.max(1, w * cam.zoom);
                ctx.stroke();
            }

            var hp = worldToScreen(e.x, e.y);
            var hr = Math.max(2, (w / 2) * cam.zoom);
            ctx.beginPath();
            ctx.arc(hp.x, hp.y, hr, 0, Math.PI * 2);
            ctx.fillStyle = 'hsl(' + (e.hue || 0) + ', 100%, 70%)';
            ctx.fill();
            if (isSelf) {
                ctx.lineWidth = 2; ctx.strokeStyle = '#fff';
                ctx.beginPath(); ctx.arc(hp.x, hp.y, hr + 2, 0, Math.PI * 2); ctx.stroke();
            }
        }
        ctx.restore();
    }

    function drawBarrier(i) {
        var b = dispBarrier(i);
        if (!b) return;
        var p = worldToScreen(b.x - b.width / 2, b.y - b.height / 2);
        var w = b.width * cam.zoom, h = b.height * cam.zoom;
        var sel = (i === selected);
        ctx.fillStyle = BARRIER_FILL;
        ctx.fillRect(p.x, p.y, w, h);
        ctx.save();
        ctx.shadowColor = ARENA_LINE; ctx.shadowBlur = sel ? 14 : 6;
        ctx.strokeStyle = sel ? CYAN : ARENA_GLOW;
        ctx.lineWidth = sel ? 2.5 : 1.5;
        ctx.strokeRect(p.x, p.y, w, h);
        ctx.restore();
        ctx.fillStyle = sel ? CYAN : 'rgba(170,255,255,0.7)';
        ctx.font = '11px Arial';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('#' + i, p.x + w / 2, p.y + h / 2);
    }

    function drawHandles(b) {
        for (var k = 0; k < HANDLES.length; k++) {
            var hx = HANDLES[k][0], hy = HANDLES[k][1];
            var p = worldToScreen(b.x + hx * b.width / 2, b.y + hy * b.height / 2);
            ctx.fillStyle = '#fff';
            ctx.strokeStyle = CYAN; ctx.lineWidth = 2;
            ctx.fillRect(p.x - HANDLE_PX, p.y - HANDLE_PX, HANDLE_PX * 2, HANDLE_PX * 2);
            ctx.strokeRect(p.x - HANDLE_PX, p.y - HANDLE_PX, HANDLE_PX * 2, HANDLE_PX * 2);
        }
    }

    function drawCrosshair() {
        var p = worldToScreen(mouse.world.x, mouse.world.y);
        ctx.strokeStyle = CYAN; ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(p.x - 12, p.y); ctx.lineTo(p.x + 12, p.y);
        ctx.moveTo(p.x, p.y - 12); ctx.lineTo(p.x, p.y + 12);
        ctx.stroke();
    }

    function drawHud(W, H) {
        var sx = r2(mouse.world.x / GAME_SCALE), sy = r2(-mouse.world.y / GAME_SCALE);
        ctx.fillStyle = 'rgba(170,255,255,0.85)';
        ctx.font = '12px Arial'; ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
        ctx.fillText('cursor: ' + sx + ', ' + sy + '   zoom: ' + r2(cam.zoom), W - 12, H - 10);
    }
};

if (typeof module === 'object') {
    module.exports = BarrierEditor;
}
