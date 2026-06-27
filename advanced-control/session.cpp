// src/session.cpp
// SessionLogger implementation – in-memory ring buffer (F10)
//
// R4 migration (M6.9, 2026-05-16):
//   Replaced LittleFS JSONL file storage with a SRAM ring buffer.
//   All LittleFS / File API removed. No filesystem dependency.
#include "session.h"
#include "log.h"
#include <ArduinoJson.h>
#include <string.h>
#include <stdio.h>

// ─── begin ────────────────────────────────────────────────────────────────────
void SessionLogger::begin() {
    _count = 0;
    _head  = 0;
    LOG("[SESSION] Ring buffer ready (" + String(SESSION_RING_SIZE) + " entries)");
}

// ─── _append ──────────────────────────────────────────────────────────────────
void SessionLogger::_append(const char* type, const String& payload) {
    if (!_active) return;

    SessionEntry& e = _entries[(_head + _count) % SESSION_RING_SIZE];
    e.ts = _ts();
    strncpy(e.type,    type,            sizeof(e.type)    - 1);
    strncpy(e.payload, payload.c_str(), sizeof(e.payload) - 1);
    e.type[sizeof(e.type)       - 1] = '\0';
    e.payload[sizeof(e.payload) - 1] = '\0';

    if (_count < SESSION_RING_SIZE) {
        _count++;
    } else {
        // Ring is full – advance head (oldest overwritten)
        _head = (_head + 1) % SESSION_RING_SIZE;
    }
}

// ─── start ────────────────────────────────────────────────────────────────────
bool SessionLogger::start(const String& fw, uint16_t maxRpm, uint8_t stepCount) {
    if (_active) return false;
    _id          = _id + 1;   // simple incrementing ID; resets to 1 on reboot
    _startMs     = millis();
    _active      = true;
    _sumRpm      = 0;
    _sampleCount = 0;
    _peakRpm     = 0;
    _lastSample  = 0;
    _count       = 0;
    _head        = 0;

    // SESSION_START entry
    char payload[80];
    snprintf(payload, sizeof(payload),
             "\"id\":%u,\"fw\":\"%s\",\"max_rpm\":%u,\"steps\":%u",
             _id, fw.c_str(), maxRpm, stepCount);
    _append("SESSION_START", payload);

    LOG("[SESSION] #" + String(_id) + " started");
    return true;
}

// ─── stop ─────────────────────────────────────────────────────────────────────
void SessionLogger::stop(float avgRpm, float maxRpmSeen, uint8_t stepsCompleted) {
    if (!_active) return;

    float    finalAvg = (_sampleCount > 0) ? (_sumRpm / _sampleCount) : avgRpm;
    float    finalMax = (_peakRpm > maxRpmSeen) ? _peakRpm : maxRpmSeen;
    uint32_t dur      = _ts() / 1000;

    char payload[80];
    snprintf(payload, sizeof(payload),
             "\"duration_s\":%lu,\"avg_rpm\":%.1f,\"max_rpm\":%.1f,\"steps_done\":%u",
             (unsigned long)dur, finalAvg, finalMax, stepsCompleted);
    _append("SESSION_SUMMARY", payload);

    LOG("[SESSION] #" + String(_id) + " stopped – " + String(dur) + "s  avg=" + String(finalAvg, 1) + " RPM");
    _active = false;
}

// ─── logEvent ─────────────────────────────────────────────────────────────────
void SessionLogger::logEvent(const char* type, const String& extra) {
    _append(type, extra);
}

// ─── logRpmSample ─────────────────────────────────────────────────────────────
void SessionLogger::logRpmSample(float rpm, const char* dir, const char* state) {
    if (!_active) return;
    if (rpm > _peakRpm) _peakRpm = rpm;
    _sumRpm += rpm;
    _sampleCount++;

    char payload[80];
    snprintf(payload, sizeof(payload),
             "\"rpm\":%.1f,\"dir\":\"%s\",\"state\":\"%s\"",
             rpm, dir, state);
    _append("RPM_SAMPLE", payload);
}

// ─── logError ─────────────────────────────────────────────────────────────────
void SessionLogger::logError(const char* code, const char* msg) {
    char payload[80];
    snprintf(payload, sizeof(payload), "\"code\":\"%s\",\"msg\":\"%s\"", code, msg);
    _append("ERROR", payload);
}

void SessionLogger::logErrorCleared(const char* code) {
    char payload[40];
    snprintf(payload, sizeof(payload), "\"code\":\"%s\"", code);
    _append("ERROR_CLEARED", payload);
}

// ─── logStepStart / Done ──────────────────────────────────────────────────────
void SessionLogger::logStepStart(uint8_t idx, uint8_t total, bool cw, float targetRpm, uint16_t durS) {
    char payload[80];
    snprintf(payload, sizeof(payload),
             "\"step\":%u,\"total\":%u,\"dir\":\"%s\",\"target_rpm\":%d,\"dur_s\":%u",
             idx + 1, total, cw ? "CW" : "CCW", (int)targetRpm, durS);
    _append("STEP_START", payload);
}

void SessionLogger::logStepDone(uint8_t idx, float avgRpm) {
    char payload[40];
    snprintf(payload, sizeof(payload), "\"step\":%u,\"avg_rpm\":%.1f", idx + 1, avgRpm);
    _append("STEP_COMPLETE", payload);
}

// ─── logProgram* ──────────────────────────────────────────────────────────────
void SessionLogger::logProgramStart(uint8_t steps, uint16_t maxRpm) {
    char payload[40];
    snprintf(payload, sizeof(payload), "\"steps\":%u,\"max_rpm\":%u", steps, maxRpm);
    _append("PROGRAM_START", payload);
}

void SessionLogger::logProgramComplete(uint32_t durationS) {
    char payload[30];
    snprintf(payload, sizeof(payload), "\"duration_s\":%lu", (unsigned long)durationS);
    _append("PROGRAM_COMPLETE", payload);
}

void SessionLogger::logProgramAbort(uint8_t atStep) {
    char payload[20];
    snprintf(payload, sizeof(payload), "\"at_step\":%u", atStep + 1);
    _append("PROGRAM_ABORT", payload);
}

void SessionLogger::logDirectionChange(const char* from, const char* to) {
    char payload[40];
    snprintf(payload, sizeof(payload), "\"from\":\"%s\",\"to\":\"%s\"", from, to);
    _append("DIRECTION_CHANGE", payload);
}

void SessionLogger::logParamChange(const char* key, float value) {
    char payload[60];
    snprintf(payload, sizeof(payload), "\"key\":\"%s\",\"value\":%.2f", key, value);
    _append("PARAM_CHANGE", payload);
}

// ─── tick ─────────────────────────────────────────────────────────────────────
void SessionLogger::tick(float currentRpm, const char* dir, const char* state) {
    if (!_active) return;
    unsigned long now = millis();
    if (now - _lastSample >= SESSION_SAMPLE_INT) {
        _lastSample = now;
        logRpmSample(currentRpm, dir, state);
    }
}

// ─── listSessions ─────────────────────────────────────────────────────────────
String SessionLogger::listSessions() {
    // Returns JSON array. If a session is active or was completed this boot, include it.
    if (_id == 0) return "[]";
    String out = "[{\"id\":" + String(_id) +
                 ",\"active\":" + String(_active ? "true" : "false") +
                 ",\"entries\":" + String(_count) + "}]";
    return out;
}

// ─── exportSession ────────────────────────────────────────────────────────────
String SessionLogger::exportSession() const {
    // Serialises ring buffer as JSONL (one JSON object per line)
    String out;
    out.reserve(_count * 60);
    for (uint8_t i = 0; i < _count; i++) {
        const SessionEntry& e = _entries[(_head + i) % SESSION_RING_SIZE];
        out += "{\"ts\":" + String(e.ts) +
               ",\"type\":\"" + e.type + "\"";
        if (e.payload[0] != '\0') {
            out += ",";
            out += e.payload;
        }
        out += "}\n";
    }
    return out;
}