// app.js – honey_please Web UI logic
// WebSocket connection, sparkline, basket animation, render loop

// ─── WebSocket connection ────────────────────────────────────────────────────
const WS_URL = `ws://${location.hostname}/ws`;
let ws = null, reconnectTimer = null;
let state = {};

function connect() {
  ws = new WebSocket(WS_URL);
  ws.onopen    = () => { clearTimeout(reconnectTimer); updateConnUI(true); };
  ws.onclose   = () => { updateConnUI(false); reconnectTimer = setTimeout(connect, 2000); };
  ws.onerror   = () => ws.close();
  ws.onmessage = (e) => { try { state = JSON.parse(e.data); render(state); } catch(_){} };
}
connect();

function updateConnUI(ok) {
  document.getElementById('conn-dot').className    = ok ? 'ok' : '';
  document.getElementById('conn-label').textContent = ok ? 'CONNECTED' : 'RECONNECTING…';
}

function send(obj) {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
}
function sendCmd(cmd) { send({ cmd }); }
function goTarget()   { send({ cmd: 'target', value: +document.getElementById('rpm-input').value }); }
function dirChange(d) { send({ cmd: 'dir', value: d }); }

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

  // SIM banner + badges + fault panel
  document.getElementById('sim-banner').classList.toggle('visible', sim);
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
  document.getElementById('wifi-info').textContent   = `IP: ${location.hostname}`;

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
}

function setGpio(id, high, invert = false) {
  const el     = document.getElementById(id);
  const isHigh = invert ? !high : high;
  el.textContent = isHigh ? 'HIGH' : 'LOW';
  el.className   = 'gpio-val ' + (isHigh ? 'high' : 'low');
}
