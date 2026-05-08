// src/params.cpp
// NVS persistence for MotorParams.
#include "params.h"
#include "log.h"

static const char* NVS_NS = "motor_params";

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
    Preferences prefs;
    if (!prefs.begin(NVS_NS, true)) {
        LOG("[PARAMS] NVS namespace not found – using defaults");
        resetToDefaults(p);
        return;
    }
    p.max_rpm        = prefs.getUShort("max_rpm",         100);
    p.accel_rate     = prefs.getUChar ("accel_rate",       10);
    p.decel_rate     = prefs.getUChar ("decel_rate",       15);
    p.dir_pause_ms   = prefs.getUShort("dir_pause_ms",   2000);
    p.zero_timeout   = prefs.getUShort("zero_timeout",   2000);
    p.stall_rpm_min  = prefs.getUChar ("stall_rpm_min",     5);
    p.stall_detect_s = prefs.getUChar ("stall_detect_s",    3);
    p.pwm_freq_hz    = prefs.getUShort("pwm_freq_hz",    1000);
    prefs.end();

    if (!validateParams(p)) {
        LOG("[PARAMS] Stored params failed validation – resetting to defaults");
        resetToDefaults(p);
    } else {
        LOG("[PARAMS] Loaded from NVS");
    }
}

void saveParams(const MotorParams& p) {
    if (!validateParams(p)) {
        LOG("[PARAMS] Save rejected: validation failed");
        return;
    }
    Preferences prefs;
    prefs.begin(NVS_NS, false);
    prefs.putUShort("max_rpm",        p.max_rpm);
    prefs.putUChar ("accel_rate",     p.accel_rate);
    prefs.putUChar ("decel_rate",     p.decel_rate);
    prefs.putUShort("dir_pause_ms",   p.dir_pause_ms);
    prefs.putUShort("zero_timeout",   p.zero_timeout);
    prefs.putUChar ("stall_rpm_min",  p.stall_rpm_min);
    prefs.putUChar ("stall_detect_s", p.stall_detect_s);
    prefs.putUShort("pwm_freq_hz",    p.pwm_freq_hz);
    prefs.end();
    LOG("[PARAMS] Saved to NVS");
}

void resetToDefaults(MotorParams& p) {
    p = MotorParams{};
    LOG("[PARAMS] Reset to defaults");
}
