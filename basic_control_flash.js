#!/usr/bin/env node
/**
 * basic_control_flash.js – Build and optionally flash the basic-control sketch.
 *
 * Source  : basic-control/main.cpp  (from docs/base_honey_extractor_controller.ino)
 * Purpose : Verify relay + keypad wiring BEFORE connecting the motor driver.
 *
 * Usage:
 *   node basic_control_flash.js --build-only    # compile only (no upload)
 *   node basic_control_flash.js                 # compile + flash via auto-detected USB port
 *   node basic_control_flash.js COM5            # compile + flash via custom port
 *   npm run basic-control:build
 *   npm run basic-control:flash
 */

const { spawnSync, execSync } = require('child_process');
const path = require('path');
const os   = require('os');

const BUILD_ONLY = process.argv.includes('--build-only');
const POSITIONAL_ARGS = process.argv
  .slice(2)
  .filter(arg => arg !== '--' && arg !== '--build-only');
const MANUAL_PORT = POSITIONAL_ARGS[0] || null;

// ── Locate pio (mirrors deploy.js) ───────────────────────────────────────────
function findPio() {
  try { execSync('pio --version', { stdio: 'ignore' }); return 'pio'; } catch {}
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
  console.log(`\n\x1b[36m[BASIC] ${label}\x1b[0m`);
  console.log(`  > ${[cmd, ...args].join(' ')}\n`);
  const r = spawnSync(cmd, args, { stdio: 'inherit' });
  if (r.error) { console.error(`[BASIC] Error: ${r.error.message}`); process.exit(1); }
  if (r.status !== 0) { console.error(`[BASIC] FAILED (exit ${r.status})`); process.exit(r.status); }
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
  console.log('\x1b[1m\x1b[33m═══ honey_please – basic-control flash ═══\x1b[0m');
  console.log('  Sketch  : basic-control/main.cpp');
  console.log('  Env     : r4wifi_basic_control');
  if (BUILD_ONLY) {
    console.log('  Mode    : compile-only');
  }
  console.log('');

  const pio = findPio();
  if (!pio) {
    console.error('[BASIC] ERROR: pio not found. Install PlatformIO or add it to PATH.');
    process.exit(1);
  }

  const uploadPort = BUILD_ONLY ? null : (MANUAL_PORT || detectUploadPort(pio));
  if (!BUILD_ONLY && !uploadPort) {
    console.error('[BASIC] ERROR: No upload port detected. Connect the board and run "pio device list".');
    process.exit(1);
  }

  if (!BUILD_ONLY) {
    console.log(`  Port    : ${uploadPort}${MANUAL_PORT ? ' (manual)' : ' (auto-detected)'}`);
    console.log('  After flash: open Serial Monitor at 115200 baud');
    console.log('  Command : pio device monitor -e r4wifi_basic_control');
    console.log('');
  }

  // Step 1: Compile
  run('Compiling basic-control/main.cpp...', pio, ['run', '-e', 'r4wifi_basic_control']);

  if (BUILD_ONLY) {
    console.log('\n\x1b[32m[BASIC] Compile OK. Run "npm run basic-control:flash" to upload.\x1b[0m\n');
    return;
  }

  // Step 2: Upload
  run(`Flashing to ${uploadPort}...`, pio, [
    'run', '-e', 'r4wifi_basic_control',
    '--target', 'upload',
    '--upload-port', uploadPort,
  ]);

  console.log('\n\x1b[32m[BASIC] Upload complete.\x1b[0m');
  console.log('\x1b[33m[BASIC] Next steps:\x1b[0m');
  console.log('  1. Open Serial Monitor (115200 baud)');
  console.log('  2. Press each button and watch Serial output');
  console.log('  3. Verify relay click sounds match [REL1/X1] and [REL2/X3] states');
  console.log('  4. When all buttons confirmed → connect to Oriental Motor driver\n');
}

main().catch(e => { console.error(e); process.exit(1); });
