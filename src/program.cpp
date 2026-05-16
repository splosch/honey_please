// src/program.cpp
// ProgramRunner implementation (F09)
//
// R4 migration (M6.8, 2026-05-16):
//   NVS Preferences replaced with EEPROM struct at EEPROM_PROG_OFFSET.
//   Layout (starting at EEPROM_PROG_OFFSET):
//     [0]      = step count (1 byte)
//     [1..N×4] = ProgramStep array (each 4 bytes: cw, rpm_pct, duration_s low, high)
//     [N×4+1]  = PROG_MAGIC byte (0x5A)
#include "program.h"
#include "session.h"
#include "log.h"
#include <EEPROM.h>

static constexpr uint8_t PROG_MAGIC = 0x5A;

// Offsets within the EEPROM_PROG_OFFSET block
static constexpr int PROG_COUNT_OFF = 0;
static constexpr int PROG_STEPS_OFF = 1;
static constexpr int PROG_MAGIC_OFF = 1 + MAX_PROGRAM_STEPS * 4;

// ─── EEPROM helpers ───────────────────────────────────────────────────────────
void loadProgram(ProgramStep* steps, uint8_t& count) {
    uint8_t magic = EEPROM.read(EEPROM_PROG_OFFSET + PROG_MAGIC_OFF);
    if (magic != PROG_MAGIC) {
        count = DEFAULT_STEP_COUNT;
        for (uint8_t i = 0; i < count; i++) steps[i] = DEFAULT_STEPS[i];
        return;
    }
    count = EEPROM.read(EEPROM_PROG_OFFSET + PROG_COUNT_OFF);
    if (count < 1 || count > MAX_PROGRAM_STEPS) count = DEFAULT_STEP_COUNT;
    for (uint8_t i = 0; i < count; i++) {
        int base = EEPROM_PROG_OFFSET + PROG_STEPS_OFF + i * 4;
        steps[i].cw         = EEPROM.read(base + 0) != 0;
        steps[i].rpm_pct    = EEPROM.read(base + 1);
        steps[i].duration_s = (uint16_t)EEPROM.read(base + 2) |
                              ((uint16_t)EEPROM.read(base + 3) << 8);
    }
}

void saveProgram(const ProgramStep* steps, uint8_t count) {
    if (count < 1 || count > MAX_PROGRAM_STEPS) return;
    EEPROM.write(EEPROM_PROG_OFFSET + PROG_COUNT_OFF, count);
    for (uint8_t i = 0; i < count; i++) {
        int base = EEPROM_PROG_OFFSET + PROG_STEPS_OFF + i * 4;
        EEPROM.write(base + 0, steps[i].cw ? 1 : 0);
        EEPROM.write(base + 1, steps[i].rpm_pct);
        EEPROM.write(base + 2, (uint8_t)(steps[i].duration_s & 0xFF));
        EEPROM.write(base + 3, (uint8_t)(steps[i].duration_s >> 8));
    }
    EEPROM.write(EEPROM_PROG_OFFSET + PROG_MAGIC_OFF, PROG_MAGIC);
}

// ─── ProgramRunner ────────────────────────────────────────────────────────────
void ProgramRunner::loadSteps() {
    loadProgram(_steps, _count);
    LOG("[PROG] Loaded " + String(_count) + " steps from EEPROM");
}

void ProgramRunner::saveSteps() {
    saveProgram(_steps, _count);
    LOG("[PROG] Saved " + String(_count) + " steps to EEPROM");
}

void ProgramRunner::setStep(uint8_t i, const ProgramStep& s) {
    if (i < _count) _steps[i] = s;
}

void ProgramRunner::setStepCount(uint8_t n) {
    if (n < 1) n = 1;
    if (n > MAX_PROGRAM_STEPS) n = MAX_PROGRAM_STEPS;
    _count = n;
}

float ProgramRunner::_targetRpm(uint8_t idx) const {
    float pct = _steps[idx].rpm_pct / 100.0f;
    return pct * _params.max_rpm;
}

void ProgramRunner::_beginStep(uint8_t idx) {
    _stepIdx      = idx;
    _holdRemainS  = _steps[idx].duration_s;
    _holdAccumMs  = 0;
    _lastTickMs   = millis();

    const ProgramStep& st = _steps[idx];
    float targetRpm = _targetRpm(idx);

    LOG("[PROG] Step " + String(idx + 1) + "/" + String(_count) +
        " – " + (st.cw ? "CW" : "CCW") +
        "  " + String((int)targetRpm) + " RPM  " +
        String(st.duration_s) + " s");

    // If direction is already correct and ramp is idle: just set target.
    // Otherwise use requestDirectionChange which handles the F04 sequence.
    RampState rs = _ramp.getState();
    bool currentCw = _ramp.isCurrentDirectionCw();

    // Session: log direction change before it happens
    if (_session && _session->isActive() && st.cw != currentCw) {
        _session->logDirectionChange(currentCw ? "CW" : "CCW", st.cw ? "CW" : "CCW");
    }

    // Session: log step start
    if (_session && _session->isActive()) {
        _session->logStepStart(idx, _count, st.cw, targetRpm, st.duration_s);
    }

    if (st.cw != currentCw && (rs != RampState::IDLE)) {
        _ramp.requestDirectionChange(st.cw, targetRpm);
        _state = ProgramState::DIR_CHANGING;
    } else {
        if (st.cw != currentCw) {
            _ramp.requestDirectionChange(st.cw, targetRpm);
            _state = ProgramState::DIR_CHANGING;
        } else {
            _ramp.setTarget(targetRpm);
            _state = ProgramState::WAITING_FOR_RPM;
        }
    }
}

void ProgramRunner::start() {
    if (_count == 0) return;
    _stepIdx = 0;
    _state   = ProgramState::IDLE;  // reset before _beginStep
    _programStartMs = millis();
    LOG("[PROG] Program START – " + String(_count) + " steps");
    _beginStep(0);
}

void ProgramRunner::skip() {
    if (!isRunning() && _state != ProgramState::PAUSED) return;
    uint8_t next = _stepIdx + 1;
    if (next >= _count) {
        LOG("[PROG] Skip on last step – aborting program");
        abort();
        return;
    }
    LOG("[PROG] Skipping step " + String(_stepIdx + 1));
    if (_session && _session->isActive()) _session->logEvent("SKIP");
    _beginStep(next);
}

void ProgramRunner::pause() {
    if (!isRunning()) return;
    LOG("[PROG] PAUSE at step " + String(_stepIdx + 1) +
        " – remain " + String(_holdRemainS) + " s");
    _ramp.setTarget(0.0f);
    _state = ProgramState::PAUSED;
    if (_session && _session->isActive()) _session->logEvent("PAUSE");
}

void ProgramRunner::resume() {
    if (_state != ProgramState::PAUSED) return;
    LOG("[PROG] RESUME step " + String(_stepIdx + 1));
    if (_session && _session->isActive()) _session->logEvent("RESUME");
    float targetRpm = _targetRpm(_stepIdx);
    bool  targetCw  = _steps[_stepIdx].cw;

    if (targetCw != _ramp.isCurrentDirectionCw()) {
        _ramp.requestDirectionChange(targetCw, targetRpm);
        _state = ProgramState::DIR_CHANGING;
    } else {
        _ramp.setTarget(targetRpm);
        _state = ProgramState::WAITING_FOR_RPM;
    }
}

void ProgramRunner::abort() {
    LOG("[PROG] ABORT at step " + String(_stepIdx + 1));
    _ramp.setTarget(0.0f);
    _state = ProgramState::ABORTED;
    if (_session && _session->isActive()) _session->logProgramAbort(_stepIdx);
}

// ─── tick ─────────────────────────────────────────────────────────────────────
void ProgramRunner::tick() {
    if (_state == ProgramState::IDLE    ||
        _state == ProgramState::COMPLETE ||
        _state == ProgramState::ABORTED  ||
        _state == ProgramState::PAUSED) return;

    const float current    = _ramp.getCurrent();
    const float target     = _targetRpm(_stepIdx);
    const RampState rstate = _ramp.getState();

    switch (_state) {
        case ProgramState::DIR_CHANGING:
            // Wait until ramp has completed the direction change and is running/ramping up
            if (rstate == RampState::RUNNING ||
                (rstate == RampState::RAMPING_UP && current > 0.5f)) {
                // Direction applied, now ramp to target if not already set
                if (_ramp.getTarget() < target - 0.5f) {
                    _ramp.setTarget(target);
                }
                _state = ProgramState::WAITING_FOR_RPM;
            }
            // Also handle: direction change complete, ramp idle → set target
            if (rstate == RampState::IDLE) {
                _ramp.setTarget(target);
                _state = ProgramState::WAITING_FOR_RPM;
            }
            break;

        case ProgramState::WAITING_FOR_RPM:
            // Wait until RPM within 5% of target
            if (current >= target * 0.95f) {
                LOG("[PROG] Step " + String(_stepIdx + 1) + " RPM reached – holding " +
                    String(_holdRemainS) + " s");
                _lastTickMs  = millis();
                _holdAccumMs = 0;
                _state = ProgramState::HOLDING;
            }
            break;

        case ProgramState::HOLDING: {
            // Count down hold duration in real seconds
            unsigned long now = millis();
            _holdAccumMs += (now - _lastTickMs);
            _lastTickMs   = now;

            while (_holdAccumMs >= 1000UL) {
                _holdAccumMs -= 1000UL;
                if (_holdRemainS > 0) _holdRemainS--;
            }

            if (_holdRemainS == 0) {
                LOG("[PROG] Step " + String(_stepIdx + 1) + " DONE");
                if (_session && _session->isActive())
                    _session->logStepDone(_stepIdx, _ramp.getCurrent());
                uint8_t next = _stepIdx + 1;
                if (next >= _count) {
                    // All steps done
                    _ramp.setTarget(0.0f);
                    _state = ProgramState::COMPLETE;
                    LOG("[PROG] Program COMPLETE");
                    if (_session && _session->isActive()) {
                        uint32_t durS = (millis() - _programStartMs) / 1000UL;
                        _session->logProgramComplete(durS);
                    }
                } else {
                    _beginStep(next);
                }
            }
            break;
        }

        default: break;
    }
}

uint32_t ProgramRunner::totalRemainingSecs() const {
    if (_state == ProgramState::IDLE || _state == ProgramState::COMPLETE ||
        _state == ProgramState::ABORTED) return 0;

    uint32_t total = _holdRemainS;
    // Add future steps durations (not accounting for ramp time)
    for (uint8_t i = _stepIdx + 1; i < _count; i++) {
        total += _steps[i].duration_s;
    }
    return total;
}
