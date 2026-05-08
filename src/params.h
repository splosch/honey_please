// src/params.h
// Motor operational parameters.
// Stored persistently in ESP32 NVS ("motor_params" namespace).
// PHYSICAL_MAX_RPM is a compile-time hard limit and is never stored in NVS.
//
// Architecture: all configurable values live here; RampController,
// ErrorHandler, and WebApi read through a const MotorParams reference so
// any update to a single shared instance is visible everywhere.
#pragma once
#include <Arduino.h>
#include <Preferences.h>

// Hard limit: exceeding this triggers E04_OVERSPEED + EMERGENCY_STOP.
// Never adjustable by operator.
#define PHYSICAL_MAX_RPM 300

struct MotorParams {
    uint16_t max_rpm        = 100;   // Operator-configured RPM ceiling
    uint8_t  accel_rate     = 10;    // RPM/s acceleration
    uint8_t  decel_rate     = 15;    // RPM/s deceleration
    uint16_t dir_pause_ms   = 2000;  // Pause at 0 RPM during direction change
    uint16_t zero_timeout   = 2000;  // ms before E03 (no pulse while powered)
    uint8_t  stall_rpm_min  = 5;     // RPM below which stall detection activates
    uint8_t  stall_detect_s = 3;     // Seconds at low RPM before E05 triggers
    uint16_t pwm_freq_hz    = 1000;  // PWM frequency (used by RealMotorDriver)
};

bool validateParams(const MotorParams& p);
void loadParams(MotorParams& p);
void saveParams(const MotorParams& p);
void resetToDefaults(MotorParams& p);
