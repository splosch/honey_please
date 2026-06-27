// src/params.cpp
// EEPROM persistence for MotorParams.
//
// R4 migration (M6.8, 2026-05-16):
//   NVS Preferences replaced with Arduino EEPROM library.
//   EEPROM.begin() called with EEPROM_TOTAL_SIZE.
//   Layout defined in params.h header comments.
#include "params.h"
#include "log.h"

bool validateParams(const MotorParams& p) {
    if (p.max_rpm        <  10 || p.max_rpm        > PHYSICAL_MAX_RPM) return false;
    if (p.accel_rate     <   1 || p.accel_rate     > 50)               return false;
    if (p.decel_rate     <   1 || p.decel_rate     > 50)               return false;
    if (p.dir_pause_ms   < 500 || p.dir_pause_ms   > 10000)            return false;
    if (p.zero_timeout   < 500 || p.zero_timeout   > 5000)             return false;
    if (p.stall_rpm_min  <   1 || p.stall_rpm_min  > 20)               return false;
    if (p.stall_detect_s <   1 || p.stall_detect_s > 10)               return false;
    if (p.pwm_freq_hz    < 100 || p.pwm_freq_hz    > 20000)            return false;
    return true;
}

void loadParams(MotorParams& p) {
    uint8_t magic = EEPROM.read(EEPROM_PARAMS_MAGIC_ADDR);
    if (magic != PARAMS_MAGIC) {
        LOG("[PARAMS] First boot – no EEPROM data, using defaults");
        resetToDefaults(p);
        return;
    }
    EEPROM.get(EEPROM_PARAMS_ADDR, p);
    if (!validateParams(p)) {
        LOG("[PARAMS] EEPROM data invalid – resetting to defaults");
        resetToDefaults(p);
    } else {
        LOG("[PARAMS] Loaded from EEPROM");
    }
}

void saveParams(const MotorParams& p) {
    if (!validateParams(p)) {
        LOG("[PARAMS] Save rejected: validation failed");
        return;
    }
    EEPROM.put(EEPROM_PARAMS_ADDR, p);
    EEPROM.write(EEPROM_PARAMS_MAGIC_ADDR, PARAMS_MAGIC);
    LOG("[PARAMS] Saved to EEPROM");
}

void resetToDefaults(MotorParams& p) {
    p = MotorParams{};
    LOG("[PARAMS] Reset to defaults");
}


