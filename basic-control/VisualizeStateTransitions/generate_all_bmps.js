/**
 * generate_all_bmps.js — Headless BMP snapshot generator
 * ======================================================
 * Run via:  npm run snapshot
 *
 * Reads the current git commit SHA, runs every simulation scenario through
 * the real HoneyStateMachine, generates a 24-bit BMP for each, and writes
 * them into a versioned folder under bmp_snapshots/<sha>/.
 *
 * Also maintains bmp_snapshots/index.json so the frontend viewer can
 * discover available snapshots without directory listing.
 *
 * CommonJS shell with dynamic import() — the simulation modules are
 * browser ES modules that also work in Node.js (no DOM dependencies).
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// ── Helpers ────────────────────────────────────────────────────────────

function getCommitSha() {
    try {
        return execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
    } catch (_err) {
        // Fallback: ISO timestamp if git is unavailable
        const now = new Date();
        return now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
    }
}

function readIndex(snapshotsDir) {
    const indexPath = path.join(snapshotsDir, 'index.json');
    try {
        const raw = fs.readFileSync(indexPath, 'utf8');
        const parsed = JSON.parse(raw);
        return (parsed && parsed.snapshots) ? parsed.snapshots : [];
    } catch (_err) {
        return [];
    }
}

function writeIndex(snapshotsDir, snapshots) {
    const indexPath = path.join(snapshotsDir, 'index.json');
    // Newest first
    snapshots.sort((a, b) => b.generatedAt.localeCompare(a.generatedAt));
    fs.writeFileSync(indexPath, JSON.stringify({ snapshots }, null, 2), 'utf8');
    console.log(`  index.json updated (${snapshots.length} snapshot(s))`);
}

// ── Main ───────────────────────────────────────────────────────────────

async function main() {
    console.log('BMP Snapshot Generator');
    console.log('======================\n');

    // 1. Resolve paths
    const snapshotsDir = path.join(__dirname, 'bmp_snapshots');
    const sha = getCommitSha();
    const outDir = path.join(snapshotsDir, sha);
    const generatedAt = new Date().toISOString();

    console.log(`  Commit SHA : ${sha}`);
    console.log(`  Output dir : ${outDir}\n`);

    // 2. Create output directory
    fs.mkdirSync(outDir, { recursive: true });

    // 3. Dynamic import ES modules (transitive imports resolve automatically)
    console.log('  Loading simulation modules...');
    const [{ runHeadlessSimulation }, { generateBmpBuffer }, { SCENARIOS }] =
        await Promise.all([
            import('../docs/js/composables/useBmpSimulation.js'),
            import('../docs/js/lib/bmpWriter.js'),
            import('../docs/js/lib/simulationScenarios.js')
        ]);

    console.log(`  ${SCENARIOS.length} scenarios found.\n`);

    // 4. Generate BMPs
    const manifestScenarios = [];
    let ok = 0;
    let fail = 0;

    for (let i = 0; i < SCENARIOS.length; i++) {
        const scenario = SCENARIOS[i];
        const filename = `${scenario.id}.bmp`;
        const label = `[${String(i + 1).padStart(2, '0')}/${SCENARIOS.length}]`;

        try {
            const { matrix, width, height } = runHeadlessSimulation(scenario);
            const buffer = generateBmpBuffer(matrix, width, height);
            fs.writeFileSync(path.join(outDir, filename), Buffer.from(buffer));

            manifestScenarios.push({
                id: scenario.id,
                name: scenario.name,
                file: filename,
                totalTicks: scenario.totalTicks,
                tickDurationMs: scenario.tickDurationMs,
                hasHardwareFaults: !!(scenario.hardwareFaults && scenario.hardwareFaults.length > 0),
                bmpWidth: width,
                bmpHeight: height
            });

            console.log(`  ${label} ${filename}  (${width}×${height} px, ${buffer.byteLength} bytes)`);
            ok++;
        } catch (err) {
            console.error(`  ${label} ${filename}  FAILED: ${err.message}`);
            fail++;
        }
    }

    // 5. Write per-snapshot manifest
    const manifest = {
        sha,
        generatedAt,
        scenarioCount: manifestScenarios.length,
        scenarios: manifestScenarios
    };
    fs.writeFileSync(
        path.join(outDir, 'manifest.json'),
        JSON.stringify(manifest, null, 2),
        'utf8'
    );

    // 6. Update global index
    const snapshots = readIndex(snapshotsDir);
    // Replace entry for this SHA if it already exists, otherwise append
    const existingIdx = snapshots.findIndex(s => s.sha === sha);
    const entry = {
        sha,
        generatedAt,
        scenarioCount: manifestScenarios.length,
        path: sha
    };
    if (existingIdx >= 0) {
        snapshots[existingIdx] = entry;
    } else {
        snapshots.push(entry);
    }
    writeIndex(snapshotsDir, snapshots);

    // 7. Summary
    console.log(`\n  Done: ${ok} generated, ${fail} failed.`);
    console.log(`  Folder: ${outDir}`);
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
