(() => {
  const STORAGE_KEY = 'rpg_hotseat_vtt_v1';
  const MASTER_ID = 'master';

  const $ = (id) => document.getElementById(id);
  const canvas = $('vttCanvas');
  const ctx = canvas.getContext('2d');
  const fogCanvas = document.createElement('canvas');
  const fogCtx = fogCanvas.getContext('2d');

  const state = {
    map: { src: null, image: null, width: 0, height: 0 },
    view: { x: 80, y: 80, zoom: 1, minZoom: 0.2, maxZoom: 3 },
    players: [{ id: MASTER_ID, name: 'Mestre', color: '#facc15', isMaster: true }],
    tokens: [],
    activePlayerIndex: 0,
    turnOrder: [MASTER_ID],
    initiativeMode: false,
    grid: { enabled: true, size: 50, snap: false },
    tools: { measure: false, fogReveal: false, fogHide: false, fogRadius: 80 },
    measurement: null,
    diceHistory: [],
    draggingTokenId: null,
    panning: false,
    lastPointer: { x: 0, y: 0 },
  };

  let needsRender = true;
  let animationFrame = null;

  function uid(prefix = 'id') {
    return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
  }

  function requestRender() {
    needsRender = true;
    if (!animationFrame) {
      animationFrame = requestAnimationFrame(renderLoop);
    }
  }

  function renderLoop() {
    animationFrame = null;
    if (needsRender) {
      render();
      needsRender = false;
    }
  }

  function resizeCanvas() {
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const rect = canvas.parentElement.getBoundingClientRect();
    canvas.width = Math.floor(rect.width * dpr);
    canvas.height = Math.floor(rect.height * dpr);
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;
    fogCanvas.width = canvas.width;
    fogCanvas.height = canvas.height;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    fogCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    requestRender();
  }

  function worldToScreen(wx, wy) {
    return {
      x: wx * state.view.zoom + state.view.x,
      y: wy * state.view.zoom + state.view.y,
    };
  }

  function screenToWorld(sx, sy) {
    return {
      x: (sx - state.view.x) / state.view.zoom,
      y: (sy - state.view.y) / state.view.zoom,
    };
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }

  async function setMapFromBase64(base64) {
    if (!base64) return;
    const img = await loadImage(base64);
    state.map.src = base64;
    state.map.image = img;
    state.map.width = img.width;
    state.map.height = img.height;
    centerMap();
    requestRender();
  }

  function centerMap() {
    if (!state.map.image) return;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    const zx = w / state.map.width;
    const zy = h / state.map.height;
    state.view.zoom = Math.max(state.view.minZoom, Math.min(state.view.maxZoom, Math.min(zx, zy)));
    state.view.x = (w - state.map.width * state.view.zoom) / 2;
    state.view.y = (h - state.map.height * state.view.zoom) / 2;
  }

  function activePlayer() {
    return state.players.find((p) => p.id === state.turnOrder[state.activePlayerIndex]) || state.players[0];
  }

  function canControlToken(token) {
    const ap = activePlayer();
    return ap?.isMaster || token.ownerId === ap?.id;
  }

  function drawMapLayer() {
    if (!state.map.image) return;
    const { x, y, zoom } = state.view;
    ctx.drawImage(state.map.image, x, y, state.map.width * zoom, state.map.height * zoom);
  }

  function drawGridLayer() {
    if (!state.grid.enabled || !state.map.image) return;
    const step = state.grid.size * state.view.zoom;
    if (step < 8) return;
    const start = worldToScreen(0, 0);
    const end = worldToScreen(state.map.width, state.map.height);

    ctx.save();
    ctx.strokeStyle = '#ffffff24';
    ctx.lineWidth = 1;

    for (let x = start.x; x <= end.x; x += step) {
      ctx.beginPath();
      ctx.moveTo(x, start.y);
      ctx.lineTo(x, end.y);
      ctx.stroke();
    }
    for (let y = start.y; y <= end.y; y += step) {
      ctx.beginPath();
      ctx.moveTo(start.x, y);
      ctx.lineTo(end.x, y);
      ctx.stroke();
    }
    ctx.restore();
  }

  const avatarCache = new Map();
  function getAvatarImage(base64) {
    if (!base64) return null;
    if (avatarCache.has(base64)) return avatarCache.get(base64);
    const img = new Image();
    img.src = base64;
    avatarCache.set(base64, img);
    return img;
  }

  function drawTokenLayer() {
    state.tokens.forEach((token) => {
      const s = worldToScreen(token.x, token.y);
      const size = token.size * state.view.zoom;
      const radius = size / 2;
      const owner = state.players.find((p) => p.id === token.ownerId);
      const isActiveOwner = owner && owner.id === activePlayer()?.id;
      const highlight = isActiveOwner ? '#fff' : '#000';
      const borderColor = owner?.color || '#64748b';

      ctx.save();
      ctx.translate(s.x, s.y);

      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, Math.PI * 2);
      ctx.closePath();
      ctx.fillStyle = '#0f172a';
      ctx.fill();

      ctx.save();
      ctx.beginPath();
      ctx.arc(0, 0, radius - 3, 0, Math.PI * 2);
      ctx.clip();
      const avatarImg = getAvatarImage(token.sheet.avatar);
      if (avatarImg && avatarImg.complete) {
        ctx.drawImage(avatarImg, -radius, -radius, size, size);
      } else {
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(-radius, -radius, size, size);
        ctx.fillStyle = '#a5b4fc';
        ctx.font = `${Math.max(12, radius * 0.8)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText((token.name || '?').slice(0, 1).toUpperCase(), 0, 0);
      }
      ctx.restore();

      ctx.strokeStyle = borderColor;
      ctx.lineWidth = isActiveOwner ? 5 : 3;
      ctx.beginPath();
      ctx.arc(0, 0, radius - 1, 0, Math.PI * 2);
      ctx.stroke();

      if (isActiveOwner) {
        ctx.strokeStyle = highlight;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, radius + 3, 0, Math.PI * 2);
        ctx.stroke();
      }

      const hpPct = Math.max(0, Math.min(1, token.sheet.hp / Math.max(1, token.sheet.hpMax)));
      const barW = size * 0.9;
      const barH = Math.max(6, size * 0.1);
      const barX = -barW / 2;
      const barY = radius + 6;
      ctx.fillStyle = '#111827';
      ctx.fillRect(barX, barY, barW, barH);
      ctx.fillStyle = hpPct > 0.5 ? '#22c55e' : hpPct > 0.25 ? '#f59e0b' : '#ef4444';
      ctx.fillRect(barX, barY, barW * hpPct, barH);

      ctx.fillStyle = '#e5e7eb';
      ctx.font = `${Math.max(11, size * 0.22)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(token.name, 0, -radius - 8);

      ctx.restore();
    });
  }

  function drawMeasurementLayer() {
    if (!state.measurement) return;
    const a = worldToScreen(state.measurement.x1, state.measurement.y1);
    const b = worldToScreen(state.measurement.x2, state.measurement.y2);
    const d = Math.hypot(state.measurement.x2 - state.measurement.x1, state.measurement.y2 - state.measurement.y1);

    ctx.save();
    ctx.strokeStyle = '#67e8f9';
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 6]);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.setLineDash([]);
    const feet = (d / state.grid.size) * 5;
    ctx.fillStyle = '#0b1220dd';
    ctx.fillRect((a.x + b.x) / 2 - 58, (a.y + b.y) / 2 - 16, 116, 28);
    ctx.fillStyle = '#f8fafc';
    ctx.textAlign = 'center';
    ctx.fillText(`${d.toFixed(0)} px | ${feet.toFixed(1)} pés`, (a.x + b.x) / 2, (a.y + b.y) / 2 + 4);
    ctx.restore();
  }

  function drawFogLayer() {
    if (!state.map.image) return;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    fogCtx.clearRect(0, 0, w, h);
    fogCtx.fillStyle = '#000b';
    fogCtx.fillRect(0, 0, w, h);
    state.fogActions?.forEach((a) => {
      const s = worldToScreen(a.x, a.y);
      fogCtx.save();
      fogCtx.globalCompositeOperation = a.mode === 'reveal' ? 'destination-out' : 'source-over';
      fogCtx.beginPath();
      fogCtx.arc(s.x, s.y, a.radius * state.view.zoom, 0, Math.PI * 2);
      fogCtx.fillStyle = a.mode === 'reveal' ? '#000' : '#000d';
      fogCtx.fill();
      fogCtx.restore();
    });
    ctx.drawImage(fogCanvas, 0, 0);
  }

  function render() {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    ctx.clearRect(0, 0, w, h);
    drawMapLayer();
    drawGridLayer();
    drawTokenLayer();
    drawMeasurementLayer();
    drawFogLayer();
  }

  function tokenAt(screenX, screenY) {
    for (let i = state.tokens.length - 1; i >= 0; i--) {
      const token = state.tokens[i];
      const s = worldToScreen(token.x, token.y);
      const r = (token.size * state.view.zoom) / 2;
      if (Math.hypot(screenX - s.x, screenY - s.y) <= r) return token;
    }
    return null;
  }

  function snapPoint(pt) {
    if (!state.grid.snap) return pt;
    const g = state.grid.size;
    return {
      x: Math.round(pt.x / g) * g,
      y: Math.round(pt.y / g) * g,
    };
  }

  function onPointerDown(ev) {
    const rect = canvas.getBoundingClientRect();
    const sx = ev.clientX - rect.left;
    const sy = ev.clientY - rect.top;
    state.lastPointer = { x: sx, y: sy };

    const world = screenToWorld(sx, sy);
    if (state.tools.measure) {
      state.measurement = { x1: world.x, y1: world.y, x2: world.x, y2: world.y };
      requestRender();
      return;
    }
    if (state.tools.fogReveal || state.tools.fogHide) {
      paintFog(world.x, world.y, state.tools.fogReveal ? 'reveal' : 'hide');
      return;
    }

    const hit = tokenAt(sx, sy);
    if (hit && canControlToken(hit)) {
      state.draggingTokenId = hit.id;
      canvas.style.cursor = 'grabbing';
      return;
    }
    state.panning = true;
    canvas.style.cursor = 'grabbing';
  }

  function onPointerMove(ev) {
    const rect = canvas.getBoundingClientRect();
    const sx = ev.clientX - rect.left;
    const sy = ev.clientY - rect.top;
    const dx = sx - state.lastPointer.x;
    const dy = sy - state.lastPointer.y;
    state.lastPointer = { x: sx, y: sy };

    if (state.measurement) {
      const world = screenToWorld(sx, sy);
      state.measurement.x2 = world.x;
      state.measurement.y2 = world.y;
      requestRender();
      return;
    }

    if (state.tools.fogReveal || state.tools.fogHide) {
      if (ev.buttons === 1) {
        const world = screenToWorld(sx, sy);
        paintFog(world.x, world.y, state.tools.fogReveal ? 'reveal' : 'hide');
      }
      return;
    }

    if (state.draggingTokenId) {
      const token = state.tokens.find((t) => t.id === state.draggingTokenId);
      if (!token) return;
      const world = snapPoint(screenToWorld(sx, sy));
      token.x += (world.x - token.x) * 0.4;
      token.y += (world.y - token.y) * 0.4;
      requestRender();
      return;
    }

    if (state.panning) {
      state.view.x += dx;
      state.view.y += dy;
      requestRender();
    }
  }

  function onPointerUp() {
    state.draggingTokenId = null;
    state.panning = false;
    state.measurement = null;
    canvas.style.cursor = 'grab';
    requestRender();
  }

  function onDoubleClick(ev) {
    const rect = canvas.getBoundingClientRect();
    const sx = ev.clientX - rect.left;
    const sy = ev.clientY - rect.top;
    const hit = tokenAt(sx, sy);
    if (hit) openSheet(hit);
  }

  function onWheel(ev) {
    ev.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const sx = ev.clientX - rect.left;
    const sy = ev.clientY - rect.top;
    const before = screenToWorld(sx, sy);
    const factor = ev.deltaY < 0 ? 1.08 : 0.92;
    state.view.zoom = Math.max(state.view.minZoom, Math.min(state.view.maxZoom, state.view.zoom * factor));
    const after = worldToScreen(before.x, before.y);
    state.view.x += sx - after.x;
    state.view.y += sy - after.y;
    requestRender();
  }

  function paintFog(x, y, mode) {
    state.fogActions = state.fogActions || [];
    state.fogActions.push({ x, y, radius: state.tools.fogRadius, mode });
    if (state.fogActions.length > 4000) state.fogActions.shift();
    requestRender();
  }

  function renderPlayers() {
    const list = $('playersList');
    list.innerHTML = '';
    const ap = activePlayer();
    state.players.forEach((p) => {
      const row = document.createElement('div');
      row.className = `item ${ap?.id === p.id ? 'active' : ''}`;
      row.innerHTML = `<span><span class="dot" style="background:${p.color}"></span>${p.name}${p.isMaster ? ' 👑' : ''}</span>`;
      const btn = document.createElement('button');
      btn.textContent = 'Ativar';
      btn.onclick = () => setActivePlayer(p.id);
      row.appendChild(btn);
      list.appendChild(row);
    });

    const select = $('tokenOwner');
    select.innerHTML = '';
    state.players.forEach((p) => {
      const op = document.createElement('option');
      op.value = p.id;
      op.textContent = p.name;
      select.appendChild(op);
    });

    const banner = $('activeBanner');
    banner.textContent = `Turno: ${ap?.name || 'N/A'}`;
    banner.style.borderColor = ap?.color || '#fff';
    renderTurnOrder();
  }

  function renderTurnOrder() {
    const box = $('turnOrder');
    box.innerHTML = '';
    state.turnOrder.forEach((pid, idx) => {
      const p = state.players.find((it) => it.id === pid);
      if (!p) return;
      const item = document.createElement('div');
      item.className = `item ${idx === state.activePlayerIndex ? 'active' : ''}`;
      item.innerHTML = `<span>${idx + 1}. <span class="dot" style="background:${p.color}"></span>${p.name}</span>`;
      box.appendChild(item);
    });
  }

  function setActivePlayer(playerId) {
    const idx = state.turnOrder.indexOf(playerId);
    if (idx >= 0) state.activePlayerIndex = idx;
    renderPlayers();
    requestRender();
  }

  function passTurn() {
    state.activePlayerIndex = (state.activePlayerIndex + 1) % state.turnOrder.length;
    renderPlayers();
    requestRender();
  }

  function rollDice(expr, playerName) {
    const cleaned = expr.replace(/\s+/g, '');
    const m = cleaned.match(/^(\d+)d(\d+)([+-]\d+)?$/i);
    if (!m) throw new Error('Expressão inválida. Use ex: 2d6+3');
    const count = Number(m[1]);
    const sides = Number(m[2]);
    const mod = m[3] ? Number(m[3]) : 0;
    if (count < 1 || count > 30 || sides < 2 || sides > 1000) throw new Error('Valores fora do limite.');
    const rolls = Array.from({ length: count }, () => 1 + Math.floor(Math.random() * sides));
    const total = rolls.reduce((a, b) => a + b, 0) + mod;
    return { expr: cleaned, rolls, mod, total, playerName, at: new Date().toLocaleTimeString() };
  }

  function renderDiceHistory() {
    const list = $('diceHistory');
    list.innerHTML = '';
    state.diceHistory.slice(-30).reverse().forEach((r) => {
      const div = document.createElement('div');
      div.className = 'item';
      div.textContent = `[${r.at}] ${r.playerName}: ${r.expr} => [${r.rolls.join(', ')}] ${r.mod ? (r.mod > 0 ? '+' : '') + r.mod : ''} = ${r.total}`;
      list.appendChild(div);
    });
  }

  function addPlayer() {
    const name = $('playerName').value.trim();
    const color = $('playerColor').value;
    if (!name) return;
    const p = { id: uid('player'), name, color, isMaster: false };
    state.players.push(p);
    state.turnOrder.push(p.id);
    $('playerName').value = '';
    renderPlayers();
  }

  function addToken() {
    const ownerId = $('tokenOwner').value;
    const name = $('tokenName').value.trim() || 'Aventureiro';
    const size = Math.max(20, Math.min(220, Number($('tokenSize').value) || 56));
    const token = {
      id: uid('tok'),
      ownerId,
      name,
      size,
      x: state.map.width ? state.map.width / 2 : 100,
      y: state.map.height ? state.map.height / 2 : 100,
      sheet: {
        className: 'Classe',
        level: 1,
        hp: 10,
        hpMax: 10,
        notes: '',
        inventory: [],
        avatar: null,
      },
    };
    state.tokens.push(token);
    $('tokenName').value = '';
    requestRender();
  }

  function openSheet(token) {
    $('sheetTokenId').value = token.id;
    $('sheetName').value = token.name;
    $('sheetClass').value = token.sheet.className || '';
    $('sheetLevel').value = token.sheet.level || 1;
    $('sheetHp').value = token.sheet.hp || 0;
    $('sheetHpMax').value = token.sheet.hpMax || 1;
    $('sheetNotes').value = token.sheet.notes || '';
    $('sheetInventory').value = (token.sheet.inventory || []).join('\n');
    $('sheetAvatarPreview').src = token.sheet.avatar || '';
    $('sheetDialog').showModal();
  }

  async function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async function saveSheetFromDialog(ev) {
    ev.preventDefault();
    const token = state.tokens.find((t) => t.id === $('sheetTokenId').value);
    if (!token) return;

    token.name = $('sheetName').value.trim() || token.name;
    token.sheet.className = $('sheetClass').value.trim();
    token.sheet.level = Math.max(1, Number($('sheetLevel').value) || 1);
    token.sheet.hp = Math.max(0, Number($('sheetHp').value) || 0);
    token.sheet.hpMax = Math.max(1, Number($('sheetHpMax').value) || 1);
    token.sheet.notes = $('sheetNotes').value;
    token.sheet.inventory = $('sheetInventory').value.split('\n').map((x) => x.trim()).filter(Boolean);

    const avatarFile = $('sheetAvatar').files[0];
    if (avatarFile && avatarFile.type === 'image/png') {
      token.sheet.avatar = await fileToBase64(avatarFile);
      avatarCache.delete(token.sheet.avatar);
    }

    $('sheetAvatar').value = '';
    $('sheetDialog').close();
    requestRender();
  }

  function serializeState() {
    return JSON.stringify({
      ...state,
      map: {
        src: state.map.src,
        width: state.map.width,
        height: state.map.height,
      },
      measurement: null,
      draggingTokenId: null,
      panning: false,
      lastPointer: { x: 0, y: 0 },
    });
  }

  async function hydrate(data) {
    state.players = data.players || state.players;
    state.tokens = data.tokens || [];
    state.activePlayerIndex = data.activePlayerIndex || 0;
    state.turnOrder = data.turnOrder?.length ? data.turnOrder : state.players.map((p) => p.id);
    state.initiativeMode = !!data.initiativeMode;
    state.grid = data.grid || state.grid;
    state.tools = { ...state.tools, ...(data.tools || {}) };
    state.diceHistory = data.diceHistory || [];
    state.fogActions = data.fogActions || [];
    if (data.map?.src) {
      await setMapFromBase64(data.map.src);
    } else {
      state.map = { src: null, image: null, width: 0, height: 0 };
    }
    renderPlayers();
    renderDiceHistory();
    syncUiFromState();
    requestRender();
  }

  function saveCampaign() {
    localStorage.setItem(STORAGE_KEY, serializeState());
    toast('Campanha salva no navegador.');
  }

  async function loadCampaign() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return toast('Nenhum save encontrado.');
    try {
      await hydrate(JSON.parse(raw));
      toast('Campanha carregada.');
    } catch {
      toast('Falha ao carregar save.');
    }
  }

  function resetCampaign() {
    if (!confirm('Resetar toda a campanha local?')) return;
    localStorage.removeItem(STORAGE_KEY);
    location.reload();
  }

  function toast(msg) {
    const b = $('activeBanner');
    const prev = b.textContent;
    b.textContent = msg;
    setTimeout(() => {
      b.textContent = `Turno: ${activePlayer()?.name || 'N/A'}`;
    }, 1400);
    if (!prev) renderPlayers();
  }

  function syncUiFromState() {
    $('gridEnabled').checked = state.grid.enabled;
    $('gridSize').value = state.grid.size;
    $('snapEnabled').checked = state.grid.snap;
    $('measureTool').checked = state.tools.measure;
    $('fogRevealTool').checked = state.tools.fogReveal;
    $('fogHideTool').checked = state.tools.fogHide;
    $('fogRadius').value = state.tools.fogRadius;
    $('initiativeMode').checked = state.initiativeMode;
  }

  function toggleExclusiveTool(name) {
    state.tools.measure = name === 'measure' ? !state.tools.measure : false;
    state.tools.fogReveal = name === 'fogReveal' ? !state.tools.fogReveal : false;
    state.tools.fogHide = name === 'fogHide' ? !state.tools.fogHide : false;
    syncUiFromState();
    requestRender();
  }

  function bindUi() {
    window.addEventListener('resize', resizeCanvas);

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointerleave', onPointerUp);
    canvas.addEventListener('dblclick', onDoubleClick);
    canvas.addEventListener('wheel', onWheel, { passive: false });

    $('uploadMapBtn').onclick = () => $('mapFileInput').click();
    $('mapFileInput').addEventListener('change', async (ev) => {
      const file = ev.target.files[0];
      if (!file) return;
      const base64 = await fileToBase64(file);
      await setMapFromBase64(base64);
      requestRender();
    });

    $('addPlayerBtn').onclick = addPlayer;
    $('addTokenBtn').onclick = addToken;
    $('passTurnBtn').onclick = passTurn;
    $('saveBtn').onclick = saveCampaign;
    $('loadBtn').onclick = loadCampaign;
    $('resetBtn').onclick = resetCampaign;

    $('gridEnabled').onchange = (e) => { state.grid.enabled = e.target.checked; requestRender(); };
    $('gridSize').onchange = (e) => { state.grid.size = Math.max(20, Number(e.target.value) || 50); requestRender(); };
    $('snapEnabled').onchange = (e) => { state.grid.snap = e.target.checked; };
    $('fogRadius').onchange = (e) => { state.tools.fogRadius = Math.max(20, Number(e.target.value) || 80); };
    $('measureTool').onchange = () => toggleExclusiveTool('measure');
    $('fogRevealTool').onchange = () => toggleExclusiveTool('fogReveal');
    $('fogHideTool').onchange = () => toggleExclusiveTool('fogHide');
    $('initiativeMode').onchange = (e) => {
      state.initiativeMode = e.target.checked;
      if (state.initiativeMode) {
        state.turnOrder = [...state.players]
          .map((p) => ({ ...p, init: p.isMaster ? 0 : 1 + Math.floor(Math.random() * 20) }))
          .sort((a, b) => b.init - a.init)
          .map((p) => p.id);
        state.activePlayerIndex = 0;
      } else {
        state.turnOrder = state.players.map((p) => p.id);
      }
      renderPlayers();
    };

    $('rollDiceBtn').onclick = () => {
      try {
        const r = rollDice($('diceExpr').value, activePlayer()?.name || 'N/A');
        state.diceHistory.push(r);
        renderDiceHistory();
      } catch (err) {
        toast(err.message);
      }
    };

    $('sheetForm').addEventListener('submit', saveSheetFromDialog);
    $('sheetCancelBtn').onclick = () => $('sheetDialog').close();
    $('sheetAvatar').addEventListener('change', async (ev) => {
      const file = ev.target.files[0];
      if (!file || file.type !== 'image/png') return;
      $('sheetAvatarPreview').src = await fileToBase64(file);
    });

    window.addEventListener('keydown', (ev) => {
      if (ev.code === 'Space') {
        ev.preventDefault();
        passTurn();
      }
      if (ev.key.toLowerCase() === 'g') {
        state.grid.enabled = !state.grid.enabled;
        syncUiFromState();
        requestRender();
      }
      if (ev.key.toLowerCase() === 's') {
        state.grid.snap = !state.grid.snap;
        syncUiFromState();
      }
      if (ev.key.toLowerCase() === 'm') toggleExclusiveTool('measure');
      if (ev.key.toLowerCase() === 'r') toggleExclusiveTool('fogReveal');
      if (ev.key.toLowerCase() === 'h') toggleExclusiveTool('fogHide');
    });
  }

  async function bootstrap() {
    bindUi();
    resizeCanvas();
    renderPlayers();
    renderDiceHistory();
    syncUiFromState();
    await loadCampaign();
    canvas.style.cursor = 'grab';
    setInterval(saveCampaign, 25000);
    requestRender();
  }

  bootstrap();
})();
