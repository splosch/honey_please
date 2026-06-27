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
 *   npm run deploy                        # uses defaults: COM4 + 192.168.178.70
 *   npm run deploy -- COM5 192.168.1.99   # override port and IP
 */

const { spawnSync, execSync } = require('child_process');
const path = require('path');
const os   = require('os');

const PORT       = process.argv[2] === '--build-only' ? 'COM4'              : (process.argv[2] || 'COM4');
const BOARD_IP   = process.argv[2] === '--build-only' ? '192.168.178.70'   : (process.argv[3] || '192.168.178.70');
const BUILD_ONLY = process.argv.includes('--build-only');

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

async function main() {
  console.log('\x1b[1m\x1b[33m═══ honey_please deploy ═══\x1b[0m');
  if (BUILD_ONLY) {
    console.log('  Mode: compile-only sanity check');
  } else {
    console.log(`  Port:  ${PORT}`);
    console.log(`  Board: ${BOARD_IP}`);
  }

  const pio = findPio();
  if (!pio) {
    console.error('[DEPLOY] ERROR: pio not found. Install PlatformIO or add it to PATH.');
    process.exit(1);
  }

  // Step 1: Compile-only sanity check
  run('Step 1/3 – Compile (sanity check)', pio, ['run', '-e', 'r4wifi']);
  if (BUILD_ONLY) { console.log('\x1b[32m[BUILD] Compile OK\x1b[0m'); return; }

  // Step 2: Upload
  run('Step 2/3 – Upload via USB', pio, ['run', '-e', 'r4wifi', '--target', 'upload', '--upload-port', PORT]);

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
