// src/ramp_controller.cpp
#include "ramp_controller.h"
#include "log.h"

void RampController::setTarget(float rpm) {
    rpm = constrain(rpm, 0.0f, (float)_params.max_rpm);
    _target = rpm;
    if (_target > _current) {
        _state = RampState::RAMPING_UP;
    } else if (_target < _current) {
        _state = RampState::RAMPING_DOWN;
    }
    // If target == current, state stays as-is (RUNNING or IDLE)
}

void RampController::requestDirectionChange(bool cw, float resumeRpm) {
    if (cw == _driver.getDirection() && !_dirChangePending) {
        // Already in that direction – treat as a noop
        return;
    }
    _pendingDirCw      = cw;
    _resumeRpm         = (resumeRpm < 0.0f) ? _target : resumeRpm;
    _dirChangePending  = true;

    if (_current <= 0.1f) {
        // Already stopped – enter pause immediately
        _current = 0.0f;
        _state   = RampState::DIR_CHANGE_PAUSE;
        _pauseEndMs = millis() + _params.dir_pause_ms;
        _driver.setDutyCycle(0);
        LOG("[RAMP] Dir change: already at 0 – pausing "
            + String(_params.dir_pause_ms) + " ms");
    } else {
        // Decel to 0 first; tick() will enter DIR_CHANGE_PAUSE when RPM hits 0
        _target = 0.0f;
        _state  = RampState::RAMPING_DOWN;
        LOG("[RAMP] Dir change: decelerating to 0");
    }
}

void RampController::emergencyStop() {
    _target           = 0.0f;
    _current          = 0.0f;
    _dirChangePending = false;
    _state            = RampState::IDLE;
    _driver.setDutyCycle(0);
    _driver.disable();
}

void RampController::tick() {
    // ── DIR_CHANGE_PAUSE ─────────────────────────────────────────────────────
    if (_state == RampState::DIR_CHANGE_PAUSE) {
        if ((int32_t)(millis() - _pauseEndMs) >= 0) {
            // Safety re-check: must still be at 0
            if (_current > 0.5f) {
                // Race condition guard (F04 §4): re-enter RAMPING_DOWN
                _target = 0.0f;
                _state  = RampState::RAMPING_DOWN;
                _pauseEndMs = millis() + _params.dir_pause_ms;
                LOG("[RAMP] Dir change: RPM not zero at flip point – re-decelerating");
                return;
            }
            _driver.setDirection(_pendingDirCw);
            _dirChangePending = false;
            LOG("[RAMP] Dir change: direction flipped → "
                + String(_pendingDirCw ? "CW" : "CCW")
                + "  resuming " + String(_resumeRpm, 0) + " RPM");
            if (_resumeRpm > 0.0f) {
                setTarget(_resumeRpm);  // transitions to RAMPING_UP
            } else {
                _state = RampState::IDLE;
            }
        }
        return;  // No PWM change during pause
    }

    // ── Normal ramp ──────────────────────────────────────────────────────────
    const float stepAccel = _params.accel_rate * TICK_INTERVAL_S;
    const float stepDecel = _params.decel_rate * TICK_INTERVAL_S;

    if (_current < _target) {
        _current += stepAccel;
        if (_current >= _target) {
            _current = _target;
            _state   = RampState::RUNNING;
        } else {
            _state = RampState::RAMPING_UP;
        }
    } else if (_current > _target) {
        _current -= stepDecel;
        if (_current <= _target) {
            _current = _target;
            if (_dirChangePending && _target == 0.0f) {
                // Reached 0 as part of direction change – enter pause
                _state      = RampState::DIR_CHANGE_PAUSE;
                _pauseEndMs = millis() + _params.dir_pause_ms;
                LOG("[RAMP] Dir change: at 0 RPM – pausing "
                    + String(_params.dir_pause_ms) + " ms");
            } else {
                _state = (_target == 0.0f) ? RampState::IDLE : RampState::RUNNING;
            }
        } else {
            _state = RampState::RAMPING_DOWN;
        }
    } else {
        // current == target
        _state = (_current == 0.0f) ? RampState::IDLE : RampState::RUNNING;
    }

    _driver.setDutyCycle(rpmToDuty(_current));
}

float RampController::getEtaSeconds() const {
    if (_state == RampState::DIR_CHANGE_PAUSE) {
        int32_t remaining = (int32_t)(_pauseEndMs - millis());
        return (remaining > 0) ? (float)remaining / 1000.0f : 0.0f;
    }
    if (_current == _target) return 0.0f;
    if (_current < _target) {
        return (_target - _current) / (float)_params.accel_rate;
    }
    return (_current - _target) / (float)_params.decel_rate;
}

uint8_t RampController::rpmToDuty(float rpm) const {
    if (rpm <= 0.0f) return 0;
    // Linear map: 0..PHYSICAL_MAX_RPM → 0..255
    // Phase 5 note: calibrate against actual motor + load
    float duty = (rpm / (float)PHYSICAL_MAX_RPM) * 255.0f;
    return (uint8_t)constrain(duty, 0.0f, 255.0f);
}
