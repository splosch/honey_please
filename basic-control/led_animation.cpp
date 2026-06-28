#include "led_animation.h"

// ── Ring geometry ────────────────────────────────────────────────────────────
// Outer ring, 36 positions, clockwise starting top-left.
struct LedPos { uint8_t r; uint8_t c; };

static const LedPos RING[36] = {
    // Top: left→right (row 0)
    {0,0},{0,1},{0,2},{0,3},{0,4},{0,5},{0,6},{0,7},{0,8},{0,9},{0,10},{0,11},
    // Right: top→bottom (col 11, rows 1–7)
    {1,11},{2,11},{3,11},{4,11},{5,11},{6,11},{7,11},
    // Bottom: right→left (row 7, cols 10–0)
    {7,10},{7,9},{7,8},{7,7},{7,6},{7,5},{7,4},{7,3},{7,2},{7,1},{7,0},
    // Left: bottom→top (col 0, rows 6–1)
    {6,0},{5,0},{4,0},{3,0},{2,0},{1,0}
};

// ── Icon definitions (inner LEDs, outside the outer ring) ───────────────────
// Pause: two vertical bars, 5 rows high (rows 2–6), like ⏸
static const LedPos ICON_PAUSE[] = {
    {2,4},{3,4},{4,4},{5,4},{6,4},   // left bar  (col 4)
    {2,5},{3,5},{4,5},{5,5},{6,5},   // left bar  (col 5)
    {2,7},{3,7},{4,7},{5,7},{6,7},   // right bar (col 7)
    {2,8},{3,8},{4,8},{5,8},{6,8}    // right bar (col 8)
};
static constexpr int ICON_PAUSE_N = 20;

// Triangles: 5 rows high (rows 2–6), tip pointing right/left
static const LedPos ICON_PLAY_CW[] = {   // ▶  tip right (clockwise)
    {2,5},
    {3,5},{3,6},
    {4,5},{4,6},{4,7},
    {5,5},{5,6},
    {6,5}
};
static const LedPos ICON_PLAY_CCW[] = {  // ◀  tip left (counter-clockwise)
    {2,7},
    {3,6},{3,7},
    {4,5},{4,6},{4,7},
    {5,6},{5,7},
    {6,7}
};
static constexpr int ICON_PLAY_N = 9;

// ── Public API ───────────────────────────────────────────────────────────────

LedAnimationState makeInitialLedAnimationState() {
    LedAnimationState s;
    s.ringPos     = 0;
    s.lastLedStep = 0;
    memset(s.frame, 0, sizeof(s.frame));
    return s;
}

void updateLedAnimationFrame(
    LedAnimationState&        animState,
    const ControllerState&    controller,
    unsigned long             nowMs,
    const BasicControlConfig& config)
{
    memset(animState.frame, 0, sizeof(animState.frame));

    // ── Ring LEDs ────────────────────────────────────────────────────────────
    // Speed follows ramp progress: 250 ms/step (slow) → 30 ms/step (fast).
    int  dir      = +1;
    bool drawRing = true;
    switch (controller.id) {
        case ControllerStateId::STANDBY:
        case ControllerStateId::WAITING:
            drawRing = false;
            break;
        case ControllerStateId::ACCELERATING:
            dir = isDirectionCCW(controller.targetDirection) ? -1 : +1;
            break;
        case ControllerStateId::RUNNING_CW:
            dir = +1;
            break;
        case ControllerStateId::RUNNING_CCW:
            dir = -1;
            break;
        case ControllerStateId::DECELERATING:
            dir = isDirectionCCW(controller.runningDirection) ? -1 : +1;
            break;
        default:
            drawRing = false;
            break;
    }

    if (drawRing) {
        unsigned long stepMs = (unsigned long)(
            250.0f - 220.0f * getRampProgress(controller, nowMs, config));
        if (nowMs - animState.lastLedStep >= stepMs) {
            animState.ringPos = (dir > 0)
                ? (animState.ringPos + 1) % 36
                : (animState.ringPos + 35) % 36;
            animState.lastLedStep = nowMs;
        }
        const int idx[4] = {
            animState.ringPos,
            (animState.ringPos +  1) % 36,
            (animState.ringPos + 18) % 36,
            (animState.ringPos + 19) % 36
        };
        for (int i = 0; i < 4; i++) {
            animState.frame[ RING[idx[i]].r ][ RING[idx[i]].c ] = 1;
        }
    }

    // ── Inner icon ───────────────────────────────────────────────────────────
    // Shows target action: ⏸ pause | ▶ CW | ◀ CCW.
    // Blinks (~1.25 Hz) while ramp is running; solid when state is established.
    const LedPos* iconPts   = nullptr;
    int           iconCount = 0;
    bool          iconBlink = false;

    switch (controller.id) {
        case ControllerStateId::STANDBY:
            iconPts = ICON_PAUSE; iconCount = ICON_PAUSE_N; iconBlink = false;
            break;
        case ControllerStateId::ACCELERATING:
            iconPts   = isDirectionCCW(controller.targetDirection) ? ICON_PLAY_CCW : ICON_PLAY_CW;
            iconCount = ICON_PLAY_N; iconBlink = true;
            break;
        case ControllerStateId::RUNNING_CW:
            iconPts = ICON_PLAY_CW; iconCount = ICON_PLAY_N; iconBlink = false;
            break;
        case ControllerStateId::RUNNING_CCW:
            iconPts = ICON_PLAY_CCW; iconCount = ICON_PLAY_N; iconBlink = false;
            break;
        case ControllerStateId::DECELERATING:
        case ControllerStateId::WAITING:
            iconPts = hasAutoRestart(controller)
                      ? (isDirectionCCW(controller.targetDirection) ? ICON_PLAY_CCW : ICON_PLAY_CW)
                      : ICON_PAUSE;
            iconCount = hasAutoRestart(controller) ? ICON_PLAY_N : ICON_PAUSE_N;
            iconBlink = true;
            break;
        default:
            break;
    }

    if (iconPts != nullptr) {
        bool show = !iconBlink || ((nowMs / 400) % 2 == 0);
        if (show) {
            for (int i = 0; i < iconCount; i++) {
                animState.frame[ iconPts[i].r ][ iconPts[i].c ] = 1;
            }
        }
    }

}
