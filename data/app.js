// app.js – honey_please Web UI logic
// WebSocket connection, sparkline, basket animation, render loop

// ─── WebSocket connection ────────────────────────────────────────────────────
// Board IP: defaults to the page's host. When running from a local dev server,
// append ?ip=<board-ip> to the URL, e.g. http://localhost:5500/?ip=192.168.178.70
const _params   = new URLSearchParams(location.search);
const BOARD_HOST = _params.get('ip') || location.hostname;
const WS_URL = `ws://${BOARD_HOST}/ws`;
let ws = null, reconnectTimer = null;
let state = {};

// ─── Environment bar ─────────────────────────────────────────────────────────
// Three independent status pills: UI origin | Board connection | Driver mode.
// Pill 1 (UI origin) is static and set once on load.
// Pills 2+3 are dynamic and driven by WebSocket state + received frames.

const _isDevServer = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
const _isFileProt  = location.protocol === 'file:';
let   _simMode     = null;  // null = unknown (no frame received yet)

(function initUiPill() {
  const label  = document.getElementById('env-ui-label');
  const detail = document.getElementById('env-ui-detail');
  if (_isFileProt) {
    label.textContent  = 'LOCAL FILE';
    detail.textContent = 'no server';
  } else if (_isDevServer) {
    label.textContent  = 'DEV SERVER';
    detail.textContent = location.host;
  } else {
    label.textContent  = 'REMOTE';
    detail.textContent = location.host;
  }
})();

function updateEnvBar(wsOk) {
  // Pill 2: Board connection
  const boardPill   = document.getElementById('env-board');
  const boardLabel  = document.getElementById('env-board-label');
  const boardDetail = document.getElementById('env-board-detail');
  boardDetail.textContent = BOARD_HOST;
  if (wsOk) {
    boardPill.dataset.state   = 'ok';
    boardLabel.textContent    = 'BOARD ONLINE';
  } else {
    boardPill.dataset.state   = 'err';
    boardLabel.textContent    = 'RECONNECTING\u2026';
  }

  // Pill 3: Motor driver mode
  const driverPill   = document.getElementById('env-driver');
  const driverIcon   = document.getElementById('env-driver-icon');
  const driverLabel  = document.getElementById('env-driver-label');
  const driverDetail = document.getElementById('env-driver-detail');
  if (!wsOk || _simMode === null) {
    driverPill.dataset.state  = 'unknown';
    driverIcon.textContent    = '\u2014';
    driverLabel.textContent   = 'DRIVER';
    driverDetail.textContent  = 'unknown';
  } else if (_simMode) {
    driverPill.dataset.state  = 'sim';
    driverIcon.textContent    = '\u26a0';
    driverLabel.textContent   = 'SIM DRIVER';
    driverDetail.textContent  = 'no GPIO output';
  } else {
    driverPill.dataset.state  = 'hw';
    driverIcon.textContent    = '\u2713';
    driverLabel.textContent   = 'REAL DRIVER';
    driverDetail.textContent  = 'GPIO active';
  }
}

function updateConnUI(ok) {
  updateEnvBar(ok);
}

function connect() {
  ws = new WebSocket(WS_URL);
  ws.onopen    = () => { clearTimeout(reconnectTimer); updateConnUI(true); };
  ws.onclose   = () => { updateConnUI(false); reconnectTimer = setTimeout(connect, 2000); };
  ws.onerror   = () => ws.close();
  ws.onmessage = (e) => { try { state = JSON.parse(e.data); render(state); } catch(_){} };
}
connect();

function send(obj) {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
}
function sendCmd(cmd) { send({ cmd }); }
function goTarget()   { send({ cmd: 'target', value: +document.getElementById('rpm-input').value }); }
function dirChange(d) { send({ cmd: 'dir', value: d }); }

// ─── Program commands ────────────────────────────────────────────────────────
function progCmd(cmd) { send({ cmd }); }
let _progPaused = false;
function progPauseResume() { progCmd(_progPaused ? 'prog_resume' : 'prog_pause'); }

const faultState = { driver: false, sensor: false };
function toggleFault(type) {
  faultState[type] = !faultState[type];
  send({ cmd: 'inject_fault', type, active: faultState[type] });
  document.getElementById('fi-' + type).classList.toggle('active', faultState[type]);
}

// ─── Sparkline ───────────────────────────────────────────────────────────────
const SPARK_WINDOW = 30;
const SPARK_RES    = 500;
const SPARK_SLOTS  = Math.ceil(SPARK_WINDOW * 1000 / SPARK_RES);
const sparkData    = new Array(SPARK_SLOTS).fill(0);
let   sparkMax     = 100;
let   lastSpark    = 0;

function sparkPush(rpm) {
  const now = Date.now();
  if (now - lastSpark < SPARK_RES) return;
  lastSpark = now;
  sparkData.push(rpm);
  if (sparkData.length > SPARK_SLOTS) sparkData.shift();
}

function drawSparkline() {
  const canvas = document.getElementById('sparkline');
  canvas.width = canvas.offsetWidth;
  const ctx = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  sparkMax = Math.max(10, ...sparkData) * 1.1;
  const step = w / (sparkData.length - 1 || 1);

  ctx.beginPath();
  ctx.moveTo(0, h);
  sparkData.forEach((v, i) => ctx.lineTo(i * step, h - (v / sparkMax) * h));
  ctx.lineTo(w, h);
  ctx.closePath();
  ctx.fillStyle = 'rgba(88,166,255,.18)';
  ctx.fill();

  ctx.beginPath();
  sparkData.forEach((v, i) => {
    const x = i * step, y = h - (v / sparkMax) * h;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.strokeStyle = '#58a6ff';
  ctx.lineWidth   = 1.5;
  ctx.stroke();
}

// ─── Basket rotation animation ───────────────────────────────────────────────
let basketAngle = 0, lastBasketFrame = 0;
function animateBasket(ts) {
  requestAnimationFrame(animateBasket);
  const rpm = state.rpm || 0;
  const dir = (state.dir === 'CW') ? 1 : -1;
  const dt  = Math.min(ts - lastBasketFrame, 100);
  lastBasketFrame = ts;
  if (state.state === 'DIR_CHANGE_PAUSE') return;
  basketAngle += dir * rpm * (dt / 60000) * 360;
  const g = document.getElementById('basket-g');
  if (g) g.style.transform = `rotate(${basketAngle}deg)`;
}
requestAnimationFrame(animateBasket);

// ─── Render ──────────────────────────────────────────────────────────────────
function render(s) {
  const critical = s.critical;
  const sim      = s.sim;
  const en       = s.enabled;
  const cw       = s.dir === 'CW';

  // Update env-bar driver pill with latest sim flag from frame
  _simMode = sim;
  updateEnvBar(true);

  // SIM badges + fault panel (per-component box indicators)
  document.getElementById('fault-panel').classList.toggle('visible', sim);
  ['esp32', 'mc', 'mot'].forEach(id =>
    document.getElementById('sim-badge-' + id).style.display = sim ? '' : 'none'
  );

  // Error overlay + reset bar
  document.getElementById('error-overlay').classList.toggle('visible', critical);
  document.getElementById('resetfault-bar').classList.toggle('visible', critical);

  // ── ESP32 box ──────────────────────────────────────────────────────────────
  const dutyPct = Math.round((s.duty / 255) * 100);
  document.getElementById('gpio-pwm').textContent      = dutyPct + '%';
  document.getElementById('duty-bar-fill').style.width = dutyPct + '%';
  setGpio('gpio-dira',   en &&  cw);
  setGpio('gpio-dirb',   en && !cw);
  setGpio('gpio-en',     en);
  setGpio('gpio-nfault', !s.fault, true);
  document.getElementById('gpio-rpm').textContent      = s.rpm > 0 ? '~~~~' : '____';
  document.getElementById('ring-esp32').className      = 'status-ring ' + (critical ? 'red' : 'green');

  const up = Math.floor((s.uptime || 0) / 1000);
  const hh = String(Math.floor(up / 3600)).padStart(2, '0');
  const mm = String(Math.floor((up % 3600) / 60)).padStart(2, '0');
  const ss = String(up % 60).padStart(2, '0');
  document.getElementById('uptime-info').textContent = `Uptime: ${hh}:${mm}:${ss}`;
  document.getElementById('wifi-info').textContent   = `IP: ${BOARD_HOST}`;

  // ── Motor controller box ───────────────────────────────────────────────────
  document.getElementById('mc-duty').textContent    = dutyPct + '%';
  document.getElementById('mc-dir').textContent     = s.dir || '—';
  document.getElementById('mc-en').textContent      = en ? 'ON ●' : 'OFF ○';
  document.getElementById('mc-fault').textContent   = s.fault ? '⚠ FAULT' : 'OK ●';
  document.getElementById('mc-fault').style.color   = s.fault ? 'var(--red)' : 'var(--green)';
  document.getElementById('ring-motctrl').className = 'status-ring ' + (s.fault || critical ? 'red' : 'green');

  // ── Honigschleuder box ─────────────────────────────────────────────────────
  const dirColor = cw ? 'var(--cw-color)' : 'var(--ccw-color)';
  document.getElementById('basket-svg').style.color = critical ? 'var(--red)' : dirColor;
  document.getElementById('dir-label').style.color  = dirColor;
  document.getElementById('dir-label').textContent  =
    s.state === 'DIR_CHANGE_PAUSE' ? '⏸ DIR CHANGE…' :
    cw ? '↻ CW / RIGHT' : '↺ CCW / LEFT';
  document.getElementById('rpm-display').textContent = Math.round(s.rpm);
  document.getElementById('rpm-display').style.color = critical ? 'var(--red)' : dirColor;
  document.getElementById('rpm-target').textContent  = `→ ${Math.round(s.target)} RPM`;
  document.getElementById('ring-motor').className    = 'status-ring ' + (critical ? 'red' : en ? 'green' : 'green pulse');

  // Ramp bar
  const maxRpm  = (s.params && s.params.max_rpm) ? s.params.max_rpm : 100;
  const rampPct = maxRpm > 0 ? Math.min(100, (s.rpm / maxRpm) * 100) : 0;
  const rampEl  = document.getElementById('ramp-bar');
  rampEl.style.width = rampPct + '%';
  rampEl.className   = 'ramp-bar-fill ' + ({
    RAMPING_UP:       '',
    RAMPING_DOWN:     'down',
    RUNNING:          'running',
    DIR_CHANGE_PAUSE: 'pause',
    IDLE:             'running'
  }[s.state] || '');

  let rampLbl = s.state;
  if (s.state === 'RAMPING_UP')   rampLbl = `▲ ACCEL  ${Math.round(s.rpm)} / ${Math.round(s.target)}`;
  if (s.state === 'RAMPING_DOWN') rampLbl = `▼ DECEL  ${Math.round(s.rpm)} / ${Math.round(s.target)}`;
  if (s.state === 'RUNNING')      rampLbl = `● ${Math.round(s.rpm)} RPM`;
  document.getElementById('ramp-label').textContent = rampLbl;

  const eta = s.eta || 0;
  document.getElementById('eta-label').textContent = eta > 0.1 ? `ETA: ${eta.toFixed(1)} s` : '';

  // ── Controls ───────────────────────────────────────────────────────────────
  document.getElementById('btn-go').disabled   = critical;
  document.getElementById('btn-stop').disabled = critical;
  document.getElementById('btn-cw').disabled   = critical;
  document.getElementById('btn-ccw').disabled  = critical;
  document.getElementById('btn-cw').classList.toggle('dir-active',   cw && en);
  document.getElementById('btn-ccw').classList.toggle('dir-active', !cw && en);

  sparkPush(s.rpm);
  drawSparkline();

  renderProgram(s);
  renderSession(s);
}

function setGpio(id, high, invert = false) {
  const el     = document.getElementById(id);
  const isHigh = invert ? !high : high;
  el.textContent = isHigh ? 'HIGH' : 'LOW';
  el.className   = 'gpio-val ' + (isHigh ? 'high' : 'low');
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function fmtTime(s) {
  const m = Math.floor(s / 60), sec = s % 60;
  return m > 0 ? `${m}m${String(sec).padStart(2,'0')}s` : `${sec}s`;
}

// ─── Program panel ────────────────────────────────────────────────────────────
let _progStepCount = -1;  // track last rendered count to avoid unnecessary DOM rebuild

function renderProgram(s) {
  const prog   = s.prog   || {};
  const pstate = prog.state   || 'IDLE';
  const steps  = prog.steps   || [];
  const curIdx = (prog.step   || 1) - 1;  // 0-based
  const running = prog.running || false;

  // ── State badge ──
  const badge = document.getElementById('prog-state-badge');
  badge.textContent = pstate.replace(/_/g,' ');
  badge.className = 'state-badge ' + ({
    WAITING_FOR_RPM:'waiting', DIR_CHANGING:'waiting',
    HOLDING:'running', PAUSED:'paused',
    COMPLETE:'done',   ABORTED:'aborted'
  }[pstate] || '');

  // ── Total remaining ──
  const total = prog.total_remain || 0;
  document.getElementById('prog-remain').textContent =
    running && total > 0 ? `${fmtTime(total)} remaining` : '';

  // ── Step bubbles (rebuild only when count changes) ──
  const stepsEl = document.getElementById('prog-steps');
  if (_progStepCount !== steps.length) {
    _progStepCount = steps.length;
    stepsEl.innerHTML = '';
    steps.forEach((st, i) => {
      const div = document.createElement('div');
      div.id = 'pstep-' + i;
      div.className = 'prog-step';
      div.innerHTML =
        `<div class="step-num">Step ${i+1}</div>` +
        `<div class="step-dir" style="color:${st.cw?'var(--cw-color)':'var(--ccw-color)'}">${st.cw?'↻ CW':'↺ CCW'}</div>` +
        `<div class="step-rpm">${st.pct}%</div>` +
        `<div class="step-dur">${fmtTime(st.dur)}</div>` +
        `<div class="step-timer">—</div>`;
      stepsEl.appendChild(div);
    });
  }

  // ── Update each step state ──
  steps.forEach((_, i) => {
    const el = document.getElementById('pstep-' + i);
    if (!el) return;
    const isActive = running && i === curIdx;
    const isDone   = (pstate === 'COMPLETE') || (running && i < curIdx);
    el.className = 'prog-step' + (isActive ? ' active' : isDone ? ' done' : '');
    if (isActive) {
      const t = el.querySelector('.step-timer');
      if (t) t.textContent = fmtTime(prog.hold_remain || 0);
    }
  });

  // ── Button states ──
  const idle = pstate === 'IDLE' || pstate === 'COMPLETE' || pstate === 'ABORTED';
  _progPaused = (pstate === 'PAUSED');
  document.getElementById('prog-btn-start').disabled = !idle || s.critical;
  document.getElementById('prog-btn-skip').disabled  = !running || _progPaused;
  const pb = document.getElementById('prog-btn-pause');
  pb.textContent = _progPaused ? '▶ RESUME' : '⏸ PAUSE';
  pb.disabled = idle || s.critical;
  document.getElementById('prog-btn-abort').disabled = idle;
}

// ─── Session bar ──────────────────────────────────────────────────────────────
let _lastSessionId = null;

function renderSession(s) {
  const sess   = s.session || {};
  const active = sess.active || false;
  if (active) _lastSessionId = sess.id;

  document.getElementById('sess-rec-dot').className = active ? 'active' : '';
  document.getElementById('sess-label').textContent =
    active ? `Session #${sess.id} — Recording` :
    _lastSessionId !== null ? `Session #${_lastSessionId} — Stopped` : 'No active session';
  document.getElementById('sess-btn-start').disabled = active;
  document.getElementById('sess-btn-stop').disabled  = !active;

  const exp = document.getElementById('sess-btn-export');
  const showId = active ? sess.id : _lastSessionId;
  exp.style.display = showId !== null ? '' : 'none';
  if (showId !== null) exp.href = `/sessions?id=${showId}`;
}
