/**
 * led_matrix_smoke.mjs — Port validation for docs/js/lib/led_matrix.js
 * =====================================================================
 * Drives the JS mirror of basic-control/led_animation.cpp with fixed
 * state snapshots and asserts the resulting 8×12 frames match the C++
 * behavior (ring geometry, icons, blink phase, profile dots, ring speed).
 *
 * Run:  node tests/led_matrix_smoke.mjs
 * No dependencies, no browser. Re-run after any change to
 * led_animation.cpp or led_matrix.js.
 */

import {
    makeInitialLedAnimationState,
    updateLedAnimationFrame,
    createFrame
} from '../basic-control/docs/js/lib/led_matrix.js';

let failures = 0;

function assert(cond, label) {
    if (cond) {
        console.log('  PASS  ' + label);
    } else {
        console.error('  FAIL  ' + label);
        failures++;
    }
}

function countLit(frame) {
    let n = 0;
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 12; c++) {
            n += frame[r][c];
        }
    }
    return n;
}

function litPositions(frame) {
    const out = [];
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 12; c++) {
            if (frame[r][c]) out.push(r + ',' + c);
        }
    }
    return out.sort().join(' ');
}

// Compare the frame against the union of pixel groups (order-insensitive).
function expectPixels(frame, groups) {
    const expected = groups.flatMap(g => g.split(' ')).sort().join(' ');
    return litPositions(frame) === expected;
}

// Snapshot factory — shape of HoneyStateMachine.getState() (minus fields
// the matrix renderer doesn't read).
function snap(overrides) {
    return Object.assign({
        id: 'STANDBY',
        targetDirection: 'CW',
        runningDirection: 'CW',
        selectedRunDataset: 'DATASET_0',
        restartIntent: 'NONE',
        progress: 0
    }, overrides);
}

// Expected icon pixel sets (led_animation.cpp:20-43)
const PAUSE_PX =
    '2,4 2,5 2,7 2,8 3,4 3,5 3,7 3,8 4,4 4,5 4,7 4,8 5,4 5,5 5,7 5,8 6,4 6,5 6,7 6,8';
const PLAY_CW_PX =
    '2,5 3,5 3,6 4,5 4,6 4,7 5,5 5,6 6,5';
const PLAY_CCW_PX =
    '2,7 3,6 3,7 4,5 4,6 4,7 5,6 5,7 6,7';
// Ring positions {pos, pos+1, pos+18, pos+19} (led_animation.cpp:7-16,131-139)
const RING_POS0_PX = '0,0 0,1 7,10 7,11';  // RING[0], RING[1], RING[18], RING[19]
const RING_POS1_PX = '0,1 0,2 7,9 7,10';   // RING[1], RING[2], RING[19], RING[20]
// dAtA-4 dots: two 2×2 blocks at baseCol=2, rows {1,2} and {4,5} (led_animation.cpp:65-66)
const DOTS_D4_PX = '1,2 1,3 2,2 2,3 4,2 4,3 5,2 5,3';

function render(s, nowMs, anim) {
    const a = anim || makeInitialLedAnimationState();
    updateLedAnimationFrame(a, s, nowMs);
    return a;
}

console.log('— STANDBY: pause icon only, no ring, no blink —');
{
    const a = render(snap({}), 0);
    assert(litPositions(a.frame) === PAUSE_PX, 'exactly ICON_PAUSE (20 px), no dots for DATASET_0');
    assert(a.ringPos === 0, 'ringPos stays 0 (no ring drawn)');
}

console.log('— RUNNING_CW: ring +1, solid play icon, max speed (30 ms/step) —');
{
    const a = makeInitialLedAnimationState();
    a.lastLedStep = 0;
    render(snap({ id: 'RUNNING_CW', progress: 1.0 }), 100, a);   // 100 ≥ 30 → step
    assert(a.ringPos === 1, 'ring stepped forward at 30 ms/step');
    assert(expectPixels(a.frame, [RING_POS1_PX, PLAY_CW_PX]), 'ring@pos1 + solid ▶');
    // next call 29 ms later must NOT step (29 < 30)
    const before = a.ringPos;
    render(snap({ id: 'RUNNING_CW', progress: 1.0 }), 129, a);
    assert(a.ringPos === before, 'no step when Δt < stepMs');
}

console.log('— RUNNING_CCW: ring −1 —');
{
    const a = makeInitialLedAnimationState();
    render(snap({ id: 'RUNNING_CCW', progress: 1.0 }), 100, a);
    assert(a.ringPos === 35, 'ring stepped backward ((0+35)%36)');
}

console.log('— ACCELERATING: blink phase (integer division), 250 ms/step at rest —');
{
    // Pin lastLedStep to the render time so ring stepping never interferes
    // with the icon-only blink assertions.
    const a = makeInitialLedAnimationState();
    a.lastLedStep = 400;
    render(snap({ id: 'ACCELERATING', targetDirection: 'CW', progress: 0 }), 400, a);
    assert(expectPixels(a.frame, [RING_POS0_PX]), 'icon OFF at nowMs=400 (400/400=1 → odd)');
    a.lastLedStep = 800;
    render(snap({ id: 'ACCELERATING', targetDirection: 'CW', progress: 0 }), 800, a);
    assert(expectPixels(a.frame, [RING_POS0_PX, PLAY_CW_PX]), 'icon ON at nowMs=800');
    a.lastLedStep = 1000;
    render(snap({ id: 'ACCELERATING', targetDirection: 'CW', progress: 0 }), 1000, a);
    // 1000/400 = 2.5 → C++ integer division = 2 → even → icon ON (float % would break this)
    assert(litPositions(a.frame).includes(PLAY_CW_PX), 'icon ON at nowMs=1000 (int division)');

    // stepMs boundary at rest: 250 ms/step → no step at Δt=200, step at Δt=250
    const b = makeInitialLedAnimationState();
    render(snap({ id: 'ACCELERATING', progress: 0 }), 200, b);
    assert(b.ringPos === 0, 'no ring step at Δt=200 (< 250 ms/step)');
    render(snap({ id: 'ACCELERATING', progress: 0 }), 250, b);
    assert(b.ringPos === 1, 'ring step at Δt=250 (≥ 250 ms/step)');
}

console.log('— ACCELERATING CCW: ◀ icon + dAtA-4 dots (blink on) —');
{
    const a = makeInitialLedAnimationState();
    a.lastLedStep = 800;
    render(snap({ id: 'ACCELERATING', targetDirection: 'CCW', selectedRunDataset: 'DATASET_4', progress: 0 }), 800, a);
    assert(expectPixels(a.frame, [RING_POS0_PX, PLAY_CCW_PX, DOTS_D4_PX]),
        '◀ + two 2×2 dots at baseCol=2');
}

console.log('— DECELERATING: ring in runningDirection, auto-restart icon selection —');
{
    // auto-restart to CCW → blinking ◀ (led_animation.cpp:169-176)
    const a = makeInitialLedAnimationState();
    render(snap({ id: 'DECELERATING', runningDirection: 'CW', targetDirection: 'CCW',
                  restartIntent: 'AUTO_RESTART', progress: 0 }), 800, a);
    assert(a.ringPos === 1, 'ring runs CW (runningDirection)');
    assert(litPositions(a.frame).includes(PLAY_CCW_PX), '◀ shown (auto-restart → targetDirection)');

    // plain stop → blinking ⏸
    const b = makeInitialLedAnimationState();
    render(snap({ id: 'DECELERATING', restartIntent: 'NONE', progress: 0 }), 800, b);
    assert(litPositions(b.frame).includes(PAUSE_PX), '⏸ shown (no auto-restart)');
}

console.log('— WAITING: no ring, ⏸/▶ per auto-restart —');
{
    const a = makeInitialLedAnimationState();
    render(snap({ id: 'WAITING', restartIntent: 'NONE' }), 800, a);
    assert(a.ringPos === 0, 'no ring in WAITING');
    assert(litPositions(a.frame) === PAUSE_PX, 'blinking ⏸ in WAITING');
}

console.log('— PROGRAM indicator: "P1"/"P2" replaces the icon (R5) —');
{
    // P glyph cols 2..4 + "1" glyph cols 6..8 (led_animation.cpp:45-71, 214-227)
    const P1_PX = '2,2 2,3 2,4 3,2 3,4 4,2 4,3 4,4 5,2 6,2 ' +
                  '2,7 3,6 3,7 4,7 5,7 6,6 6,7 6,8';
    const P2_PX = '2,2 2,3 2,4 3,2 3,4 4,2 4,3 4,4 5,2 6,2 ' +
                  '2,6 2,7 2,8 3,8 4,6 4,7 4,8 5,6 6,6 6,7 6,8';

    const a = makeInitialLedAnimationState();
    render(snap({ id: 'STANDBY', programId: 'PROG_1' }), 0, a);
    assert(expectPixels(a.frame, [P1_PX]), 'PROG_1 → exactly P1 glyphs (18 px), pause icon suppressed');

    const b = makeInitialLedAnimationState();
    render(snap({ id: 'RUNNING_CW', progress: 1.0, programId: 'PROG_2' }), 100, b);
    assert(litPositions(b.frame) === [RING_POS1_PX, P2_PX].flatMap(g => g.split(' ')).sort().join(' '),
        'PROG_2 while running → ring@pos1 + P2 glyphs (21 px), play icon suppressed');
}

console.log('— R12 slowdown ramp: ring inverted (slower instead of faster) —');
{
    // progress 0.75 → normal stepMs = 85 ms; slowdown inverts → 250 − 220·0.25 = 195 ms
    const a = makeInitialLedAnimationState();
    render(snap({ id: 'ACCELERATING', progress: 0.75, rampIsSlowdown: true }), 150, a);
    assert(a.ringPos === 0, 'no ring step at Δt=150 (< 195 ms slowdown stepMs)');
    render(snap({ id: 'ACCELERATING', progress: 0.75, rampIsSlowdown: true }), 200, a);
    assert(a.ringPos === 1, 'ring step at Δt=200 (≥ 195 ms)');
    // sanity: without slowdown flag the same Δt=150 would step (85 ms stepMs)
    const b = makeInitialLedAnimationState();
    render(snap({ id: 'ACCELERATING', progress: 0.75 }), 150, b);
    assert(b.ringPos === 1, 'same ramp without slowdown steps at Δt=150 (85 ms stepMs)');
}

console.log('— frame API: 8×12, zeroed by update, isolated instances —');
{
    const f = createFrame();
    assert(f.length === 8 && f.every(row => row.length === 12), 'createFrame() → 8×12');
    const a = makeInitialLedAnimationState();
    render(snap({ id: 'RUNNING_CW', progress: 1.0 }), 100, a);
    assert(countLit(a.frame) === 13, 'RUNNING_CW lit count = 4 ring + 9 ▶ (DATASET_0, no dots)');
    const b = makeInitialLedAnimationState();
    updateLedAnimationFrame(b, snap({}), 0);
    assert(countLit(a.frame) === 13, 'separate animState instances do not share the frame buffer');
}

console.log('');
if (failures) {
    console.error(failures + ' assertion(s) FAILED');
    process.exit(1);
}
console.log('All assertions passed.');
