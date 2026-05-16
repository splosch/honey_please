// src/session.h
// Extraction session logger – in-memory ring buffer (F10)
//
// R4 migration (M6.9, 2026-05-16):
//   LittleFS removed (not available on R4). Sessions are stored in a SRAM
//   ring buffer capped at SESSION_RING_SIZE entries (~5 KB).
//   No persistence across power cycles (acceptable for operator use).
//   Session ID resets to 1 on reboot; future O-6.1 can add EEPROM persistence.
#pragma once
#include <Arduino.h>

constexpr uint8_t  SESSION_RING_SIZE  = 50;   // max log entries per session
constexpr uint16_t SESSION_SAMPLE_INT = 5000; // ms between RPM_SAMPLE events

struct SessionEntry {
    uint32_t ts;           // ms since session start
    char     type[20];     // event type string
    char     payload[80];  // JSON key:value pairs (no outer braces)
};

class SessionLogger {
public:
    // ── Lifecycle ─────────────────────────────────────────────────────────────
    void begin();
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
    // Returns JSON array string of current session metadata (at most one active)
    String listSessions();
    // Serialises ring buffer to JSONL string for export
    String exportSession() const;

private:
    bool     _active      = false;
    uint16_t _id          = 0;
    uint32_t _startMs     = 0;
    unsigned long _lastSample = 0;

    // Ring buffer
    SessionEntry _entries[SESSION_RING_SIZE];
    uint8_t      _count   = 0;  // entries written (0–SESSION_RING_SIZE)
    uint8_t      _head    = 0;  // index of oldest entry (used when full)

    // Running stats for summary
    float    _sumRpm      = 0;
    uint32_t _sampleCount = 0;
    float    _peakRpm     = 0;

    void     _append(const char* type, const String& payload);
    uint32_t _ts() const { return millis() - _startMs; }
};
