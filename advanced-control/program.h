// src/program.h
// Multi-step extraction program (F09)
//
// ProgramStep: one step (direction, rpm%, duration).
// ProgramRunner: state machine that drives RampController step-by-step.
//   - Step timer starts only AFTER target RPM is reached.
//   - Direction changes use the full F04 RampController sequence.
//   - Supports SKIP, PAUSE (saves remaining time), RESUME, ABORT.
//
// R4 migration (M6.8, 2026-05-16):
//   Steps stored in EEPROM at EEPROM_PROG_OFFSET (defined in params.h).
//   NVS namespace removed. See program.cpp for EEPROM layout.
// Max steps: 12, Min steps: 1
#pragma once
#include <Arduino.h>
#include "ramp_controller.h"
#include "params.h"

class SessionLogger;  // forward declaration – full type in program.cpp

// ─── ProgramStep ──────────────────────────────────────────────────────────────
struct ProgramStep {
    bool     cw;           // true = CW, false = CCW
    uint8_t  rpm_pct;      // 1..100 % of max_rpm
    uint16_t duration_s;   // hold time AFTER target reached
};

constexpr uint8_t MAX_PROGRAM_STEPS = 12;
constexpr uint8_t DEFAULT_STEP_COUNT = 6;

// Default 6-step sequence (matches F09 spec)
const ProgramStep DEFAULT_STEPS[DEFAULT_STEP_COUNT] = {
    { false, 30,  60 },  // Step 1: CCW Slow
    { true,  30,  60 },  // Step 2: CW  Slow
    { false, 60,  90 },  // Step 3: CCW Mid
    { true,  60,  90 },  // Step 4: CW  Mid
    { false, 100, 120 }, // Step 5: CCW Fast
    { true,  100, 120 }, // Step 6: CW  Fast
};

// ─── ProgramRunner ────────────────────────────────────────────────────────────
enum class ProgramState : uint8_t {
    IDLE = 0,
    WAITING_FOR_RPM,   // ramp started, waiting to reach target
    HOLDING,           // at target RPM, counting down step duration
    DIR_CHANGING,      // between steps: waiting for ramp/pause to finish
    PAUSED,            // operator paused mid-step
    COMPLETE,          // all steps done
    ABORTED,           // operator aborted
};

class ProgramRunner {
public:
    explicit ProgramRunner(RampController& ramp, const MotorParams& params)
        : _ramp(ramp), _params(params) {}

    // ── Setup ────────────────────────────────────────────────────────────────
    void loadSteps();    // load from NVS (falls back to defaults)
    void saveSteps();    // persist to NVS

    // Access steps (for UI / editing)
    uint8_t           stepCount() const { return _count; }
    const ProgramStep& step(uint8_t i) const { return _steps[i]; }
    void setStep(uint8_t i, const ProgramStep& s);
    void setStepCount(uint8_t n);

    // ── Session integration ──────────────────────────────────────────────────
    // Call once after both ProgramRunner and SessionLogger are initialised.
    void setSession(SessionLogger* s) { _session = s; }

    // ── Control ──────────────────────────────────────────────────────────────
    void start();           // begin from step 0
    void skip();            // skip to next step
    void pause();           // ramp to 0, save remaining time
    void resume();          // continue from saved position
    void abort();           // ramp to 0, go ABORTED

    // ── Tick (call from loop, ideally every 50 ms) ────────────────────────────
    void tick();

    // ── State accessors ──────────────────────────────────────────────────────
    ProgramState  state()        const { return _state; }
    uint8_t       currentStep()  const { return _stepIdx; }
    uint32_t      holdRemaining() const { return _holdRemainS; }
    uint32_t      totalRemainingSecs() const;
    bool          isRunning()    const { return _state == ProgramState::WAITING_FOR_RPM ||
                                                _state == ProgramState::HOLDING ||
                                                _state == ProgramState::DIR_CHANGING; }

private:
    RampController&  _ramp;
    const MotorParams& _params;

    ProgramStep _steps[MAX_PROGRAM_STEPS];
    uint8_t     _count   = DEFAULT_STEP_COUNT;

    ProgramState _state  = ProgramState::IDLE;
    uint8_t      _stepIdx = 0;

    uint32_t _holdRemainS = 0;     // seconds remaining in current step hold
    uint32_t _lastTickMs  = 0;     // for 1 s countdown inside HOLDING
    uint32_t _holdAccumMs = 0;     // sub-second accumulator

    SessionLogger* _session        = nullptr;
    uint32_t       _programStartMs = 0;  // millis() at start(), for PROGRAM_COMPLETE duration

    void _beginStep(uint8_t idx);
    float _targetRpm(uint8_t idx) const;
};

// ── NVS helpers (defined in program.cpp) ──────────────────────────────────────
void loadProgram(ProgramStep* steps, uint8_t& count);
void saveProgram(const ProgramStep* steps, uint8_t count);
