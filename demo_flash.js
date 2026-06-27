#!/usr/bin/env node
/**
 * demo_flash.js – Build and optionally flash the demo / wiring-verification sketch.
 *
 * Source  : demo/main.cpp  (from docs/base_honey_extractor_controller.ino)
 * Purpose : Verify relay + keypad wiring BEFORE connecting the motor driver.
 *
 * Usage:
 *   node demo_flash.js --build-only    # compile only (no upload)
 *   node demo_flash.js                 # compile + flash via COM4
 *   node demo_flash.js COM5            # compile + flash via custom port
 *   npm run demo:build
 *   npm run demo:flash
 */

const { spawnSync, execSync } = require('child_process');
const path = require('path');
const os   = require('os');

const BUILD_ONLY = process.argv.includes('--build-only');
const PORT       = (!BUILD_ONLY && process.argv[2]) ? process.argv[2] : 'COM4';

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
  console.log(`\n\x1b[36m[DEMO] ${label}\x1b[0m`);
  console.log(`  > ${[cmd, ...args].join(' ')}\n`);
  const r = spawnSync(cmd, args, { stdio: 'inherit' });
  if (r.error) { console.error(`[DEMO] Error: ${r.error.message}`); process.exit(1); }
  if (r.status !== 0) { console.error(`[DEMO] FAILED (exit ${r.status})`); process.exit(r.status); }
}

async function main() {
  console.log('\x1b[1m\x1b[33m═══ honey_please – DEMO flash ═══\x1b[0m');
  console.log('  Sketch  : demo/main.cpp');
  console.log('  Env     : r4wifi_demo');
  if (BUILD_ONLY) {
    console.log('  Mode    : compile-only');
  } else {
    console.log(`  Port    : ${PORT}`);
    console.log('  After flash: open Serial Monitor at 115200 baud');
    console.log('  Command : pio device monitor -e r4wifi_demo');
  }
  console.log('');

  const pio = findPio();
  if (!pio) {
    console.error('[DEMO] ERROR: pio not found. Install PlatformIO or add it to PATH.');
    process.exit(1);
  }

  // Step 1: Compile
  run('Compiling demo/main.cpp...', pio, ['run', '-e', 'r4wifi_demo']);

  if (BUILD_ONLY) {
    console.log('\n\x1b[32m[DEMO] Compile OK. Run "npm run demo:flash" to upload.\x1b[0m\n');
    return;
  }

  // Step 2: Upload
  run(`Flashing to ${PORT}...`, pio, [
    'run', '-e', 'r4wifi_demo',
    '--target', 'upload',
    '--upload-port', PORT,
  ]);

  console.log('\n\x1b[32m[DEMO] Upload complete.\x1b[0m');
  console.log('\x1b[33m[DEMO] Next steps:\x1b[0m');
  console.log('  1. Open Serial Monitor (115200 baud)');
  console.log('  2. Press each button and watch Serial output');
  console.log('  3. Verify relay click sounds match [REL1/X1] and [REL2/X3] states');
  console.log('  4. When all buttons confirmed → connect to Oriental Motor driver\n');
}

main().catch(e => { console.error(e); process.exit(1); });
