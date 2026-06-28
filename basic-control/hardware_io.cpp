#include "hardware_io.h"

static uint8_t relayOnLevel(const BasicControlConfig& cfg) {
    return cfg.relayActiveHigh ? HIGH : LOW;
}

static uint8_t relayOffLevel(const BasicControlConfig& cfg) {
    return cfg.relayActiveHigh ? LOW : HIGH;
}

static uint8_t relayDirLevelFor(const BasicControlConfig& cfg, bool ccw) {
    bool highLevel = (ccw == cfg.dirRelayHighMeansCCW);
    return highLevel ? HIGH : LOW;
}

static bool isButtonPressedOnPin(uint8_t pin) {
    return digitalRead(pin) == LOW;
}

static uint8_t pinForButton(const BasicControlConfig& cfg, ButtonId button) {
    switch (button) {
        case ButtonId::DIR_LEFT:  return cfg.pinKeyLinks;
        case ButtonId::DIR_RIGHT: return cfg.pinKeyRechts;
        case ButtonId::STOP:      return cfg.pinKeyStop;
        case ButtonId::PRESET_1:  return cfg.pinKeyYel1;
        case ButtonId::PRESET_2:  return cfg.pinKeyYel2;
        case ButtonId::START:     return cfg.pinKeyStart;
        default:                  return cfg.pinKeyStart;
    }
}

static bool isButtonPressed(const BasicControlConfig& cfg, ButtonId button) {
    return isButtonPressedOnPin(pinForButton(cfg, button));
}

InputSnapshot readInputs(const BasicControlConfig& cfg) {
    InputSnapshot snapshot;
    snapshot.dirLeftPressed = isButtonPressed(cfg, ButtonId::DIR_LEFT);
    snapshot.dirRightPressed = isButtonPressed(cfg, ButtonId::DIR_RIGHT);
    snapshot.stopPressed = isButtonPressed(cfg, ButtonId::STOP);
    snapshot.preset1Pressed = isButtonPressed(cfg, ButtonId::PRESET_1);
    snapshot.preset2Pressed = isButtonPressed(cfg, ButtonId::PRESET_2);
    snapshot.startPressed = isButtonPressed(cfg, ButtonId::START);
    return snapshot;
}

void setStartRelayEnabled(const BasicControlConfig& cfg, bool enabled) {
    digitalWrite(cfg.pinRelayStart, enabled ? relayOnLevel(cfg) : relayOffLevel(cfg));
}

void setDirectionRelay(const BasicControlConfig& cfg, bool ccw) {
    digitalWrite(cfg.pinRelayDir, relayDirLevelFor(cfg, ccw));
}

void applySpeedDataset(const BasicControlConfig& cfg, BinarySpeedDataset dataset) {
    const BinarySpeedRelayProfile& profile = relayProfileForDataset(dataset);
    digitalWrite(cfg.pinRelayUnused3, profile.m1Enabled ? relayOnLevel(cfg) : relayOffLevel(cfg));
    digitalWrite(cfg.pinRelayUnused4, profile.m2Enabled ? relayOnLevel(cfg) : relayOffLevel(cfg));
}

bool isStartRelayEnabled(const BasicControlConfig& cfg) {
    return digitalRead(cfg.pinRelayStart) == relayOnLevel(cfg);
}

bool isDirectionRelayCCW(const BasicControlConfig& cfg) {
    return digitalRead(cfg.pinRelayDir) == relayDirLevelFor(cfg, true);
}

BinarySpeedDataset currentSpeedDataset(const BasicControlConfig& cfg) {
    bool m1Enabled = digitalRead(cfg.pinRelayUnused3) == relayOnLevel(cfg);
    bool m2Enabled = digitalRead(cfg.pinRelayUnused4) == relayOnLevel(cfg);
    return datasetFromRelayBits(m1Enabled, m2Enabled);
}

void initializeHardwareIo(const BasicControlConfig& cfg) {
    pinMode(cfg.pinRelayStart, OUTPUT);
    pinMode(cfg.pinRelayDir, OUTPUT);
    pinMode(cfg.pinRelayUnused3, OUTPUT);
    pinMode(cfg.pinRelayUnused4, OUTPUT);

    // Safe startup state for all relay outputs.
    setStartRelayEnabled(cfg, false);
    setDirectionRelay(cfg, false);
    applySpeedDataset(cfg, BinarySpeedDataset::DATASET_0);

    pinMode(cfg.pinKeyLinks, INPUT_PULLUP);
    pinMode(cfg.pinKeyRechts, INPUT_PULLUP);
    pinMode(cfg.pinKeyStop, INPUT_PULLUP);
    pinMode(cfg.pinKeyYel1, INPUT_PULLUP);
    pinMode(cfg.pinKeyYel2, INPUT_PULLUP);
    pinMode(cfg.pinKeyStart, INPUT_PULLUP);
}