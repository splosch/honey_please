// src/session.cpp
// SessionLogger implementation (F10)
#include "session.h"
#include "log.h"
#include <ArduinoJson.h>

static const char* SESSION_DIR = "/sessions";

// ─── begin ────────────────────────────────────────────────────────────────────
void SessionLogger::begin() {
    if (!LittleFS.exists(SESSION_DIR)) {
        LittleFS.mkdir(SESSION_DIR);
    }
    LOG("[SESSION] Storage ready at " + String(SESSION_DIR));
}

// ─── _nextId ──────────────────────────────────────────────────────────────────
uint16_t SessionLogger::_nextId() {
    uint16_t maxId = 0;
    File dir = LittleFS.open(SESSION_DIR);
    if (dir) {
        File f = dir.openNextFile();
        while (f) {
            String name = String(f.name());
            // name format: s001.jsonl
            if (name.startsWith("s") && name.endsWith(".jsonl")) {
                uint16_t n = (uint16_t)name.substring(1, name.length() - 6).toInt();
                if (n > maxId) maxId = n;
            }
            f = dir.openNextFile();
        }
        dir.close();
    }
    return maxId + 1;
}

// ─── _pruneOldest ─────────────────────────────────────────────────────────────
void SessionLogger::_pruneOldest() {
    // Count files; if ≥ SESSION_MAX_FILES, delete the one with the lowest ID
    uint16_t minId = 0xFFFF;
    uint8_t  count = 0;
    File dir = LittleFS.open(SESSION_DIR);
    if (!dir) return;
    File f = dir.openNextFile();
    while (f) {
        String name = String(f.name());
        if (name.startsWith("s") && name.endsWith(".jsonl")) {
            count++;
            uint16_t n = (uint16_t)name.substring(1, name.length() - 6).toInt();
            if (n < minId) minId = n;
        }
        f = dir.openNextFile();
    }
    dir.close();

    if (count >= SESSION_MAX_FILES && minId != 0xFFFF) {
        char buf[40];
        snprintf(buf, sizeof(buf), "%s/s%03u.jsonl", SESSION_DIR, minId);
        LittleFS.remove(buf);
        LOG("[SESSION] Pruned oldest session s" + String(minId));
    }
}

// ─── sessionPath ──────────────────────────────────────────────────────────────
String SessionLogger::sessionPath(uint16_t id) const {
    char buf[40];
    snprintf(buf, sizeof(buf), "%s/s%03u.jsonl", SESSION_DIR, id);
    return String(buf);
}

// ─── _append ──────────────────────────────────────────────────────────────────
void SessionLogger::_append(const String& line) {
    if (!_active) return;
    File f = LittleFS.open(sessionPath(_id), FILE_APPEND);
    if (!f) {
        LOG("[SESSION] ERROR: cannot open session file for append");
        return;
    }
    f.println(line);
    f.close();  // flush after every write
}

// ─── start ────────────────────────────────────────────────────────────────────
bool SessionLogger::start(const String& fw, uint16_t maxRpm, uint8_t stepCount) {
    if (_active) return false;
    _pruneOldest();
    _id         = _nextId();
    _startMs    = millis();
    _active     = true;
    _sumRpm     = 0;
    _sampleCount = 0;
    _peakRpm    = 0;
    _lastSample = 0;

    JsonDocument doc;
    doc["ts"]      = 0;
    doc["type"]    = "SESSION_START";
    doc["id"]      = _id;
    doc["fw"]      = fw;
    doc["max_rpm"] = maxRpm;
    doc["steps"]   = stepCount;
    String line;
    serializeJson(doc, line);
    _append(line);

    LOG("[SESSION] #" + String(_id) + " started");
    return true;
}

// ─── stop ─────────────────────────────────────────────────────────────────────
void SessionLogger::stop(float avgRpm, float maxRpmSeen, uint8_t stepsCompleted) {
    if (!_active) return;

    float finalAvg = _sampleCount > 0 ? (_sumRpm / _sampleCount) : avgRpm;
    float finalMax = _peakRpm > maxRpmSeen ? _peakRpm : maxRpmSeen;
    uint32_t dur = (_ts()) / 1000;

    JsonDocument doc;
    doc["ts"]            = _ts();
    doc["type"]          = "SESSION_SUMMARY";
    doc["duration_s"]    = dur;
    doc["avg_rpm"]       = (float)((int)(finalAvg * 10)) / 10.0f;
    doc["max_rpm"]       = (float)((int)(finalMax * 10)) / 10.0f;
    doc["steps_done"]    = stepsCompleted;
    String line;
    serializeJson(doc, line);
    _append(line);

    LOG("[SESSION] #" + String(_id) + " stopped – " + String(dur) + "s  avg=" + String(finalAvg, 1) + " RPM");
    _active = false;
}

// ─── logEvent ─────────────────────────────────────────────────────────────────
void SessionLogger::logEvent(const char* type, const String& extra) {
    if (!_active) return;
    String line = "{\"ts\":" + String(_ts()) + ",\"type\":\"" + type + "\"";
    if (extra.length()) line += "," + extra;
    line += "}";
    _append(line);
}

// ─── logRpmSample ─────────────────────────────────────────────────────────────
void SessionLogger::logRpmSample(float rpm, const char* dir, const char* state) {
    if (!_active) return;
    if (rpm > _peakRpm) _peakRpm = rpm;
    _sumRpm += rpm;
    _sampleCount++;

    JsonDocument doc;
    doc["ts"]    = _ts();
    doc["type"]  = "RPM_SAMPLE";
    doc["rpm"]   = (float)((int)(rpm * 10)) / 10.0f;
    doc["dir"]   = dir;
    doc["state"] = state;
    String line;
    serializeJson(doc, line);
    _append(line);
}

// ─── logError ─────────────────────────────────────────────────────────────────
void SessionLogger::logError(const char* code, const char* msg) {
    logEvent("ERROR", "\"code\":\"" + String(code) + "\",\"msg\":\"" + String(msg) + "\"");
}

void SessionLogger::logErrorCleared(const char* code) {
    logEvent("ERROR_CLEARED", "\"code\":\"" + String(code) + "\"");
}

// ─── logStepStart / Done ──────────────────────────────────────────────────────
void SessionLogger::logStepStart(uint8_t idx, uint8_t total, bool cw, float targetRpm, uint16_t durS) {
    JsonDocument doc;
    doc["ts"]         = _ts();
    doc["type"]       = "STEP_START";
    doc["step"]       = idx + 1;
    doc["total"]      = total;
    doc["dir"]        = cw ? "CW" : "CCW";
    doc["target_rpm"] = (int)targetRpm;
    doc["dur_s"]      = durS;
    String line;
    serializeJson(doc, line);
    _append(line);
}

void SessionLogger::logStepDone(uint8_t idx, float avgRpm) {
    JsonDocument doc;
    doc["ts"]      = _ts();
    doc["type"]    = "STEP_COMPLETE";
    doc["step"]    = idx + 1;
    doc["avg_rpm"] = (float)((int)(avgRpm * 10)) / 10.0f;
    String line;
    serializeJson(doc, line);
    _append(line);
}

// ─── logProgram* ──────────────────────────────────────────────────────────────
void SessionLogger::logProgramStart(uint8_t steps, uint16_t maxRpm) {
    logEvent("PROGRAM_START", "\"steps\":" + String(steps) + ",\"max_rpm\":" + String(maxRpm));
}

void SessionLogger::logProgramComplete(uint32_t durationS) {
    logEvent("PROGRAM_COMPLETE", "\"duration_s\":" + String(durationS));
}

void SessionLogger::logProgramAbort(uint8_t atStep) {
    logEvent("PROGRAM_ABORT", "\"at_step\":" + String(atStep + 1));
}

void SessionLogger::logDirectionChange(const char* from, const char* to) {
    logEvent("DIRECTION_CHANGE",
             "\"from\":\"" + String(from) + "\",\"to\":\"" + String(to) + "\"");
}

void SessionLogger::logParamChange(const char* key, float value) {
    logEvent("PARAM_CHANGE",
             "\"key\":\"" + String(key) + "\",\"value\":" + String(value, 2));
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
    // Build a JSON array of {id, path, size} for each session file
    String out = "[";
    bool first = true;
    File dir = LittleFS.open(SESSION_DIR);
    if (dir) {
        File f = dir.openNextFile();
        while (f) {
            String name = String(f.name());
            if (name.startsWith("s") && name.endsWith(".jsonl")) {
                uint16_t n = (uint16_t)name.substring(1, name.length() - 6).toInt();
                if (!first) out += ",";
                out += "{\"id\":" + String(n) +
                       ",\"size\":" + String(f.size()) +
                       ",\"path\":\"/sessions/" + name + "\"}";
                first = false;
            }
            f = dir.openNextFile();
        }
        dir.close();
    }
    out += "]";
    return out;
}
