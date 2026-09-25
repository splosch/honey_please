/**
 * led_matrix.js — Pure JS mirror of basic-control/led_animation.cpp
 * =================================================================
 * Ports the Arduino LED matrix animation 1:1 so the interactive docs show
 * exactly what the physical 8×12 matrix shows. C++ is MASTER: change
 * led_animation.cpp / led_animation.h first, then mirror here.
 *
 * Sync strategy: line-citation mirror (feature_matrix_simulation.md §5 S1).
 * Same table layout, same function names, same switch structure; every
 * block cites its C++ origin line so drift is visible by eye.
 *
 * No DOM access, no side effects — plain state in, plain frame out.
 * Input is a state snapshot like the one returned by
 * HoneyStateMachine.getState(nowMs) (honey_state_machine.js:175-189):
 *   { id, targetDirection, runningDirection, selectedRunDataset,
 *     restartIntent, progress }
 *
 * Timing notes (deliberate, feature_matrix_simulation.md R8):
 *   - Ring speed derives from snapshot.progress, which already respects
 *     simSpeed (ramps are scaled in honey_state_machine.js) — so the ring
 *     speeds up in demo mode exactly as it would on faster hardware.
 *   - The icon blink uses raw nowMs (1.25 Hz), identical to the C++.
 *
 * API (mirrors led_animation.h):
 *   makeInitialLedAnimationState()          → LedAnimationState
 *   updateLedAnimationFrame(anim, snap, nowMs) → fills anim.frame[8][12]
 *   createFrame()                           → zeroed 8×12 array (helper)
 *
 * Caller is responsible for pushing the frame to a display — the analogue
 * of ledMatrix.renderBitmap(animState.frame, 8, 12) in main.cpp:109,124.
 */

// ── Ring geometry ────────────────────────────────────────────────────────────
// Mirrors led_animation.cpp:3-16
// Outer ring, 36 positions, clockwise starting top-left.

const RING = [
    // Top: left→right (row 0)
    {r:0,c:0},{r:0,c:1},{r:0,c:2},{r:0,c:3},{r:0,c:4},{r:0,c:5},{r:0,c:6},{r:0,c:7},{r:0,c:8},{r:0,c:9},{r:0,c:10},{r:0,c:11},
    // Right: top→bottom (col 11, rows 1–7)
    {r:1,c:11},{r:2,c:11},{r:3,c:11},{r:4,c:11},{r:5,c:11},{r:6,c:11},{r:7,c:11},
    // Bottom: right→left (row 7, cols 10–0)
    {r:7,c:10},{r:7,c:9},{r:7,c:8},{r:7,c:7},{r:7,c:6},{r:7,c:5},{r:7,c:4},{r:7,c:3},{r:7,c:2},{r:7,c:1},{r:7,c:0},
    // Left: bottom→top (col 0, rows 6–1)
    {r:6,c:0},{r:5,c:0},{r:4,c:0},{r:3,c:0},{r:2,c:0},{r:1,c:0}
];

// ── Icon definitions (inner LEDs, outside the outer ring) ───────────────────
// Mirrors led_animation.cpp:18-43
// Pause: two vertical bars, 5 rows high (rows 2–6), like ⏸

const ICON_PAUSE = [
    {r:2,c:4},{r:3,c:4},{r:4,c:4},{r:5,c:4},{r:6,c:4},   // left bar  (col 4)
    {r:2,c:5},{r:3,c:5},{r:4,c:5},{r:5,c:5},{r:6,c:5},   // left bar  (col 5)
    {r:2,c:7},{r:3,c:7},{r:4,c:7},{r:5,c:7},{r:6,c:7},   // right bar (col 7)
    {r:2,c:8},{r:3,c:8},{r:4,c:8},{r:5,c:8},{r:6,c:8}    // right bar (col 8)
];
const ICON_PAUSE_N = 20;

// Triangles: 5 rows high (rows 2–6), tip pointing right/left
const ICON_PLAY_CW = [   // ▶  tip right (clockwise)
    {r:2,c:5},
    {r:3,c:5},{r:3,c:6},
    {r:4,c:5},{r:4,c:6},{r:4,c:7},
    {r:5,c:5},{r:5,c:6},
    {r:6,c:5}
];
const ICON_PLAY_CCW = [  // ◀  tip left (counter-clockwise)
    {r:2,c:7},
    {r:3,c:6},{r:3,c:7},
    {r:4,c:5},{r:4,c:6},{r:4,c:7},
    {r:5,c:6},{r:5,c:7},
    {r:6,c:7}
];
const ICON_PLAY_N = 9;

// ── Frame helpers ────────────────────────────────────────────────────────────
// Mirrors memset(animState.frame, 0, sizeof(animState.frame))

export function createFrame() {
    const frame = new Array(8);
    for (let r = 0; r < 8; r++) {
        frame[r] = new Array(12).fill(0);
    }
    return frame;
}

function clearFrame(frame) {
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 12; c++) {
            frame[r][c] = 0;
        }
    }
}

// ── State snapshot accessors (mirror ControllerState field reads) ────────────

// Mirrors isDirectionCCW (controller_state.cpp:16-18)
function isDirectionCCW(direction) {
    return direction === 'CCW';
}

// Mirrors hasAutoRestart (controller_state.cpp:20-22)
function hasAutoRestart(snap) {
    return snap.restartIntent === 'AUTO_RESTART';
}

// ── Profile marker dots ──────────────────────────────────────────────────────
// Mirrors drawProfileMarkerDots (led_animation.cpp:45-76)
// Draw profile indicator left of the icon with 1 px horizontal gap.
// dAtA 2 -> one 2x2 block, dAtA 4 -> two stacked 2x2 blocks with 1 px gap.

function drawProfileMarkerDots(frame, dataset, iconMinCol) {
    let dotCount = 0;
    if (dataset === 'DATASET_2') {
        dotCount = 1;
    } else if (dataset === 'DATASET_4') {
        dotCount = 2;
    } else {
        return;
    }

    if (iconMinCol < 3) {
        return;
    }

    const baseCol = iconMinCol - 3;   // 2 px dot + 1 px padding to icon
    const topRows = [1, 4];           // 1 px vertical gap between two 2x2 dots

    for (let d = 0; d < dotCount; d++) {
        const r0 = topRows[d];
        for (let dr = 0; dr < 2; dr++) {
            for (let dc = 0; dc < 2; dc++) {
                frame[r0 + dr][baseCol + dc] = 1;
            }
        }
    }
}

// ── Public API ───────────────────────────────────────────────────────────────

// Mirrors makeInitialLedAnimationState (led_animation.cpp:80-86)
export function makeInitialLedAnimationState() {
    return {
        ringPos:     0,
        lastLedStep: 0,
        frame:       createFrame()
    };
}

/**
 * Mirrors updateLedAnimationFrame (led_animation.cpp:88-191).
 *
 * Advance the animation one tick and fill animState.frame (frame[r][c]
 * == 1 → LED on, 0 → LED off). Signature differs from the C++ only in
 * that `controller` is a state snapshot object and the `config` parameter
 * is dropped (C++ ignores it: controller_state.cpp:37).
 *
 * @param {{ringPos:number, lastLedStep:number, frame:number[][]}} animState
 * @param {{id:string, targetDirection:string, runningDirection:string,
 *          selectedRunDataset:string, restartIntent:string,
 *          progress:number}} snap — HoneyStateMachine.getState(nowMs) shape
 * @param {number} nowMs - wall-clock milliseconds (Date.now())
 */
export function updateLedAnimationFrame(animState, snap, nowMs) {
    clearFrame(animState.frame);

    // ── Ring LEDs ────────────────────────────────────────────────────────────
    // Mirrors led_animation.cpp:96-140
    // Speed follows ramp progress: 250 ms/step (slow) → 30 ms/step (fast).
    let dir      = +1;
    let drawRing = true;
    switch (snap.id) {
        case 'STANDBY':
        case 'WAITING':
            drawRing = false;
            break;
        case 'ACCELERATING':
            dir = isDirectionCCW(snap.targetDirection) ? -1 : +1;
            break;
        case 'RUNNING_CW':
            dir = +1;
            break;
        case 'RUNNING_CCW':
            dir = -1;
            break;
        case 'DECELERATING':
            dir = isDirectionCCW(snap.runningDirection) ? -1 : +1;
            break;
        default:
            drawRing = false;
            break;
    }

    if (drawRing) {
        // getRampProgress → snap.progress (same value, mirrored in
        // honey_state_machine.js:_computeProgress)
        const stepMs = 250.0 - 220.0 * snap.progress;
        if (nowMs - animState.lastLedStep >= stepMs) {
            animState.ringPos = (dir > 0)
                ? (animState.ringPos + 1) % 36
                : (animState.ringPos + 35) % 36;
            animState.lastLedStep = nowMs;
        }
        const idx = [
            animState.ringPos,
            (animState.ringPos +  1) % 36,
            (animState.ringPos + 18) % 36,
            (animState.ringPos + 19) % 36
        ];
        for (let i = 0; i < 4; i++) {
            animState.frame[ RING[idx[i]].r ][ RING[idx[i]].c ] = 1;
        }
    }

    // ── Inner icon ───────────────────────────────────────────────────────────
    // Mirrors led_animation.cpp:142-190
    // Shows target action: ⏸ pause | ▶ CW | ◀ CCW.
    // Blinks (~1.25 Hz) while ramp is running; solid when state is established.
    let iconPts    = null;
    let iconCount  = 0;
    let iconBlink  = false;
    let iconMinCol = 4;

    switch (snap.id) {
        case 'STANDBY':
            iconPts = ICON_PAUSE; iconCount = ICON_PAUSE_N; iconBlink = false;
            iconMinCol = 4;
            break;
        case 'ACCELERATING':
            iconPts    = isDirectionCCW(snap.targetDirection) ? ICON_PLAY_CCW : ICON_PLAY_CW;
            iconCount  = ICON_PLAY_N; iconBlink = true;
            iconMinCol = 5;
            break;
        case 'RUNNING_CW':
            iconPts = ICON_PLAY_CW; iconCount = ICON_PLAY_N; iconBlink = false;
            iconMinCol = 5;
            break;
        case 'RUNNING_CCW':
            iconPts = ICON_PLAY_CCW; iconCount = ICON_PLAY_N; iconBlink = false;
            iconMinCol = 5;
            break;
        case 'DECELERATING':
        case 'WAITING':
            iconPts = hasAutoRestart(snap)
                      ? (isDirectionCCW(snap.targetDirection) ? ICON_PLAY_CCW : ICON_PLAY_CW)
                      : ICON_PAUSE;
            iconCount = hasAutoRestart(snap) ? ICON_PLAY_N : ICON_PAUSE_N;
            iconBlink = true;
            iconMinCol = hasAutoRestart(snap) ? 5 : 4;
            break;
        default:
            break;
    }

    if (iconPts !== null) {
        // Math.floor: C++ (nowMs / 400) is unsigned-long integer division;
        // JS % on a float would break the blink phase (1000/400 = 2.5 → 0.5 ≠ 0).
        const show = !iconBlink || (Math.floor(nowMs / 400) % 2 === 0);
        if (show) {
            for (let i = 0; i < iconCount; i++) {
                animState.frame[ iconPts[i].r ][ iconPts[i].c ] = 1;
            }
            drawProfileMarkerDots(animState.frame, snap.selectedRunDataset, iconMinCol);
        }
    }
}
