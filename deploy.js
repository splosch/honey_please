#!/usr/bin/env node
/**
 * deploy.js – Build, flash, and verify the honey_please firmware.
 *
 * Steps:
 *   1. Compile-only sanity check  (pio run -e r4wifi)
 *   2. Upload via USB             (pio run -e r4wifi --target upload)
 *   3. Wait 12 s for board reboot
 *   4. Selfcheck                  (HTTP /status + WebSocket /ws)
 *
 * Usage:
 *   node deploy.js [COM_PORT] [BOARD_IP]
 *   npm run deploy                        # auto-detects USB port + uses default IP
 *   npm run deploy -- COM5 192.168.1.99   # override port and IP
 */

const { spawnSync, execSync } = require('child_process');
const path = require('path');
const os   = require('os');

const BUILD_ONLY = process.argv.includes('--build-only');
const POSITIONAL_ARGS = process.argv
  .slice(2)
  .filter(arg => arg !== '--' && arg !== '--build-only');
const MANUAL_PORT = POSITIONAL_ARGS[0] || null;
const BOARD_IP = POSITIONAL_ARGS[1] || '192.168.178.70';

// ── Locate pio ─────────────────────────────────────────────────────────────────
function findPio() {
  // 1) Try PATH
  try { execSync('pio --version', { stdio: 'ignore' }); return 'pio'; } catch {}
  // 2) Default PlatformIO install locations
  const candidates = [
    path.join(os.homedir(), '.platformio', 'penv', 'Scripts', 'pio.exe'), // Windows
    path.join(os.homedir(), '.platformio', 'penv', 'bin', 'pio'),         // macOS/Linux
  ];
  for (const c of candidates) {
    try { execSync(`"${c}" --version`, { stdio: 'ignore' }); return c; } catch {}
  }
  return null;
}

function run(label, cmd, args) {
  console.log(`\n\x1b[36m[DEPLOY] ${label}\x1b[0m`);
  console.log(`  > ${cmd} ${args.join(' ')}\n`);
  const r = spawnSync(cmd, args, { stdio: 'inherit' });
  if (r.error) { console.error(`[DEPLOY] Error: ${r.error.message}`); process.exit(1); }
  if (r.status !== 0) { console.error(`[DEPLOY] FAILED (exit ${r.status})`); process.exit(r.status); }
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function parsePortsFromPlainList(stdout) {
  const ports = [];
  for (const line of stdout.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (/^COM\d+$/i.test(trimmed) || /^\/dev\/.+/.test(trimmed)) {
      ports.push(trimmed);
    }
  }
  return ports;
}

function detectUploadPort(pio) {
  const jsonList = spawnSync(pio, ['device', 'list', '--json-output'], {
    encoding: 'utf8',
  });

  if (jsonList.status === 0 && jsonList.stdout) {
    try {
      const devices = JSON.parse(jsonList.stdout);
      if (Array.isArray(devices) && devices.length > 0) {
        const preferred = devices.find(d =>
          String(d.hwid || '').toUpperCase().includes('VID:PID=2341:1002')
        );
        if (preferred && preferred.port) return preferred.port;

        if (devices.length === 1 && devices[0].port) return devices[0].port;

        const likely = devices.find(d =>
          /(arduino|usb|serial|seriell)/i.test(`${d.description || ''} ${d.hwid || ''}`)
        );
        if (likely && likely.port) return likely.port;
      }
    } catch {
      // Fall back to plain output parsing below.
    }
  }

  const plainList = spawnSync(pio, ['device', 'list'], { encoding: 'utf8' });
  if (plainList.status === 0 && plainList.stdout) {
    const ports = parsePortsFromPlainList(plainList.stdout);
    if (ports.length === 1) return ports[0];
    if (ports.length > 1) return ports[0];
  }

  return null;
}

async function main() {
  console.log('\x1b[1m\x1b[33m═══ honey_please deploy ═══\x1b[0m');
  if (BUILD_ONLY) {
    console.log('  Mode: compile-only sanity check');
  }

  const pio = findPio();
  if (!pio) {
    console.error('[DEPLOY] ERROR: pio not found. Install PlatformIO or add it to PATH.');
    process.exit(1);
  }

  const uploadPort = BUILD_ONLY ? null : (MANUAL_PORT || detectUploadPort(pio));
  if (!BUILD_ONLY && !uploadPort) {
    console.error('[DEPLOY] ERROR: No upload port detected. Connect the board and run "pio device list".');
    process.exit(1);
  }

  if (!BUILD_ONLY) {
    console.log(`  Port:  ${uploadPort}${MANUAL_PORT ? ' (manual)' : ' (auto-detected)'}`);
    console.log(`  Board: ${BOARD_IP}`);
  }

  // Step 1: Compile-only sanity check
  run('Step 1/3 – Compile (sanity check)', pio, ['run', '-e', 'r4wifi']);
  if (BUILD_ONLY) { console.log('\x1b[32m[BUILD] Compile OK\x1b[0m'); return; }

  // Step 2: Upload
  run('Step 2/3 – Upload via USB', pio, ['run', '-e', 'r4wifi', '--target', 'upload', '--upload-port', uploadPort]);

  // Step 3: Wait for board reboot then selfcheck
  console.log('\n\x1b[36m[DEPLOY] Step 3/3 – Waiting 12 s for board reboot…\x1b[0m');
  await wait(12000);

  console.log(`\x1b[36m[DEPLOY] Running selfcheck against ${BOARD_IP}…\x1b[0m\n`);
  const check = spawnSync(process.execPath, [path.join(__dirname, 'tests', 'selfcheck.js'), BOARD_IP], { stdio: 'inherit' });
  if (check.status !== 0) {
    console.error('\x1b[31m[DEPLOY RESULT] Upload: OK | Selfcheck: FAIL\x1b[0m');
    process.exit(check.status);
  }
  console.log('\x1b[32m[DEPLOY RESULT] Upload: OK | Selfcheck: OK\x1b[0m');
}

main().catch(e => { console.error(e); process.exit(1); });
