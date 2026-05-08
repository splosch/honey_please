// src/session.h
// Extraction session logger (F10)
//
// Appends JSONL (one JSON object per line) to /sessions/sNNN.jsonl on LittleFS.
// Timestamps are ms-since-session-start offsets.
// Max 50 sessions; oldest is deleted when limit is exceeded.
// Flushed to flash after every append (close+reopen).
#pragma once
#include <Arduino.h>
#include <LittleFS.h>

constexpr uint8_t  SESSION_MAX_FILES  = 50;
constexpr uint16_t SESSION_SAMPLE_INT = 5000;  // ms between RPM_SAMPLE events

class SessionLogger {
public:
    // ── Lifecycle ─────────────────────────────────────────────────────────────
    void begin();            // scan LittleFS, determine next session ID
    bool start(const String& firmwareVersion, uint16_t maxRpm, uint8_t stepCount);
    void stop(float avgRpm, float maxRpmSeen, uint8_t stepsCompleted);
    bool isActive() const { return _active; }
    uint16_t sessionId() const { return _id; }

    // ── Event logging ─────────────────────────────────────────────────────────
    void logEvent(const char* type, const String& extra = "");
    void logRpmSample(float rpm, const char* dir, const char* state);
    void logError(const char* code, const char* msg);
    void logErrorCleared(const char* code);
    void logStepStart(uint8_t idx, uint8_t total, bool cw, float targetRpm, uint16_t durS);
    void logStepDone(uint8_t idx, float avgRpm);
    void logProgramStart(uint8_t steps, uint16_t maxRpm);
    void logProgramComplete(uint32_t durationS);
    void logProgramAbort(uint8_t atStep);
    void logDirectionChange(const char* from, const char* to);
    void logParamChange(const char* key, float value);

    // ── Tick (call from loop) ─────────────────────────────────────────────────
    void tick(float currentRpm, const char* dir, const char* state);

    // ── HTTP helpers ──────────────────────────────────────────────────────────
    // Returns JSON array string of session metadata objects
    String listSessions();
    // Builds the export path; caller must handle file read+send
    String sessionPath(uint16_t id) const;

private:
    bool     _active         = false;
    uint16_t _id             = 0;
    uint32_t _startMs        = 0;
    unsigned long _lastSample = 0;

    // Running stats for summary
    float    _sumRpm         = 0;
    uint32_t _sampleCount    = 0;
    float    _peakRpm        = 0;

    void _append(const String& line);
    uint32_t _ts() const { return millis() - _startMs; }
    uint16_t _nextId();
    void _pruneOldest();
};
