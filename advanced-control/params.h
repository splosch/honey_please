// src/params.h
// Motor operational parameters – EEPROM persistence.
//
// R4 migration (M6.8, 2026-05-16):
//   NVS Preferences (ESP32-only) replaced with Arduino EEPROM library.
//   MotorParams struct is stored at EEPROM offset 0 as a packed blob.
//   A magic byte at EEPROM_PARAMS_MAGIC_ADDR detects first-boot.
//
// EEPROM layout (shared with program.cpp):
//   [  0 .. 15]  = MotorParams struct (max 16 bytes incl. alignment)
//   [ 16]        = PARAMS_MAGIC byte
//   [ 32 .. 127] = ProgramRunner steps (see program.cpp, EEPROM_PROG_OFFSET)
//
// PHYSICAL_MAX_RPM is a compile-time hard limit – never stored in EEPROM.
#pragma once
#include <Arduino.h>
#include <EEPROM.h>

// Hard limit: exceeding this triggers E04_OVERSPEED + EMERGENCY_STOP.
#define PHYSICAL_MAX_RPM 300

// EEPROM address map (fixed to avoid sizeof-before-definition issues)
static constexpr int     EEPROM_TOTAL_SIZE       = 128;
static constexpr int     EEPROM_PARAMS_ADDR      = 0;
static constexpr int     EEPROM_PARAMS_MAGIC_ADDR = 16;  // byte after params region
static constexpr int     EEPROM_PROG_OFFSET      = 32;  // program steps start here

// Magic byte: if absent, treat EEPROM as uninitialized → use defaults.
static constexpr uint8_t PARAMS_MAGIC = 0xA5;

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

// Verify MotorParams fits in the 16-byte region (compile-time check)
static_assert(sizeof(MotorParams) <= 16, "MotorParams too large for EEPROM region");

bool validateParams(const MotorParams& p);
void loadParams(MotorParams& p);          // EEPROM.get or defaults
void saveParams(const MotorParams& p);    // EEPROM.put
void resetToDefaults(MotorParams& p);
