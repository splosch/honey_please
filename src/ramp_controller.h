// src/ramp_controller.h
// Linear ramp controller – 20 Hz tick (call every 50 ms from loop()).
//
// Architecture decisions:
//   - Tick interval: 50 ms (20 Hz). Balances responsiveness and CPU budget.
//   - rpmToDuty(): linear map 0..PHYSICAL_MAX_RPM → 0..255.
//     Phase 5 will calibrate this against actual motor load.
//   - emergencyStop(): bypasses ramp, cuts PWM immediately (E09 / FAULT_STOP).
//   - EMERGENCY_STOP is the only code path that skips the ramp.
#pragma once
#include <Arduino.h>
#include "motor_driver.h"
#include "params.h"

enum class RampState : uint8_t {
    IDLE,             // Motor at 0, not commanded
    RAMPING_UP,       // Accelerating toward target
    RUNNING,          // At target RPM
    RAMPING_DOWN,     // Decelerating toward target (or toward 0)
    DIR_CHANGE_PAUSE  // At 0 RPM, waiting before flipping direction (F04)
};

class RampController {
    IMotorDriver&      _driver;
    const MotorParams& _params;

    float     _current = 0.0f;
    float     _target  = 0.0f;
    RampState _state   = RampState::IDLE;

    // Direction change state (F04 sequence)
    bool     _dirChangePending = false;
    bool     _pendingDirCw     = true;
    float    _resumeRpm        = 0.0f;
    uint32_t _pauseEndMs       = 0;

    static constexpr float TICK_INTERVAL_S = 0.05f;  // 50 ms

    uint8_t rpmToDuty(float rpm) const;

public:
    RampController(IMotorDriver& driver, const MotorParams& params)
        : _driver(driver), _params(params) {}

    // Set new target RPM. Clamped to params.max_rpm.
    // Does not enable the driver – caller must call driver.enable() first.
    void setTarget(float rpm);

    // Safe direction change (F04): decel → pause → flip → accel.
    // resumeRpm < 0 means resume at the current target RPM.
    // Ignored when FAULT_STOP is active (caller must guard).
    void requestDirectionChange(bool cw, float resumeRpm = -1.0f);

    // Immediate PWM cut – no ramp. Call on any CRITICAL error.
    void emergencyStop();

    // Advance ramp one tick. Call every 50 ms from loop().
    void tick();

    float     getCurrent()           const { return _current; }
    float     getTarget()            const { return _target; }
    RampState getState()             const { return _state; }
    float     getEtaSeconds()        const;
    bool      isDirChangePending()   const { return _dirChangePending; }
    bool      isCurrentDirectionCw() const { return _driver.getDirection(); }
};
