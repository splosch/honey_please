#pragma once

#include <Arduino.h>
#include "controller_state.h"
#include "config.h"

// Persistent animation state. frame[r][c] == 1 → LED on, 0 → LED off.
// Caller is responsible for pushing frame to ArduinoLEDMatrix after each update.
struct LedAnimationState {
    int           ringPos;
    unsigned long lastLedStep;
    byte          frame[8][12];
};

LedAnimationState makeInitialLedAnimationState();

// Advance the animation one tick and fill animState.frame.
// After this call, the caller must push the frame to the matrix:
//   ledMatrix.renderBitmap(animState.frame, 8, 12)
// Keeping the renderBitmap call in main.cpp avoids the duplicate-static
// `framebuffer` ODR issue in Arduino_LED_Matrix.h.
void updateLedAnimationFrame(
    LedAnimationState&        animState,
    const ControllerState&    controller,
    unsigned long             nowMs,
    const BasicControlConfig& config);
