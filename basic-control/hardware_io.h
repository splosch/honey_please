#pragma once

#include <Arduino.h>
#include "config.h"
#include "speed_dataset.h"

enum class ButtonId {
    DIR_LEFT,
    DIR_RIGHT,
    STOP,
    PRESET_1,
    PRESET_2,
    START
};

struct InputSnapshot {
    bool dirLeftPressed;
    bool dirRightPressed;
    bool stopPressed;
    bool preset1Pressed;
    bool preset2Pressed;
    bool startPressed;
};

InputSnapshot readInputs(const BasicControlConfig& cfg);

void initializeHardwareIo(const BasicControlConfig& cfg);

void setStartRelayEnabled(const BasicControlConfig& cfg, bool enabled);
void setDirectionRelay(const BasicControlConfig& cfg, bool ccw);
void applySpeedDataset(const BasicControlConfig& cfg, BinarySpeedDataset dataset);

bool isStartRelayEnabled(const BasicControlConfig& cfg);
bool isDirectionRelayCCW(const BasicControlConfig& cfg);
BinarySpeedDataset currentSpeedDataset(const BasicControlConfig& cfg);