# honey_please – Code Review Report
**Firmware v1.4.0 | Analysis Date: 2026-05-08**

---

## Summary

The codebase is well-structured for a Phase 4 prototype, with good separation of concerns (HAL interfaces, dedicated modules per feature, NVS-backed params). However, several **stability-critical** issues exist that will cause crashes or data corruption under sustained, multi-client use. These must be resolved before any extended production-like operation.

---

## Priority Legend

| Level | Meaning |
|---|---|
| 🔴 P1 – Critical | Will cause crashes, data loss, or safety failures |
| 🟠 P2 – Severe | Causes degradation or failure under sustained/multi-client use |
| 🟡 P3 – Important | Design flaws that limit maintainability or Phase 5 readiness |
| 🔵 P4 – Moderate | Performance/resource issues, won't fail fast but degrade over time |
| ⚪ P5 – Minor | Code quality, style, or cosmetic issues |

---

## P1 – Critical

### P1-A: Race Condition – AsyncTCP Task vs. `loop()` Accessing Shared State
**Files:** `src/web_api.cpp`, `src/main.cpp`, all modules  
**Impact:** Heap corruption, wrong motor state, firmware crash

The ESP32 Arduino framework runs `AsyncTCP` on **Core 0** (a separate RTOS task), while `loop()` runs on **Core 1**. Both cores access the same shared objects (`rampCtrl`, `errorHandler`, `sessionLogger`, `params`, `motorDriverImpl`, `rpmSourceImpl`, `programRunner`) simultaneously — with **zero synchronization**.

- `WebApi::handleCommand()` is called from the AsyncTCP task (Core 0) and modifies `rampCtrl`, `_errors`, `_params`, `_session`, etc.
- `loop()` (Core 1) reads and writes those same objects every 50 ms.
- `onWebSerialMessage()` (also AsyncTCP task) does the same.

With frequent WS commands or WebSerial use, a context switch mid-write produces torn reads, incorrect state, or a call stack overflow.

**Fix:** Protect every object that is both written from an async callback and read from `loop()` with a `portMUX_TYPE` spinlock or `SemaphoreHandle_t` mutex. A common pattern for this codebase would be a single global `SemaphoreHandle_t g_mutex` taken in `handleCommand`, `onWebSerialMessage`, and the critical section of `loop()`.

---

### P1-B: `LOG()` Macro Called from AsyncTCP Context
**File:** `src/log.h`, everywhere via `#define LOG(msg)`  
**Impact:** Firmware crash / undefined behaviour

```cpp
#define LOG(msg) do { Serial.println(msg); WebSerial.println(msg); } while(0)
```

`WebSerial.println()` ultimately queues a WebSocket send on the AsyncTCP task. Calling it from `loop()` (Core 1) while the AsyncTCP task (Core 0) is also sending WebSocket frames creates a data race inside the WebSocket send buffer. `Serial.println()` from Core 1 is safe, but `WebSerial.println()` from both cores simultaneously is not.

**Fix:** Replace `LOG()` with a thread-safe wrapper that posts to a `QueueHandle_t` ring buffer. A dedicated low-priority task (or the `loop()` drains the queue and sends to WebSerial safely.

---

### P1-C: No WiFi Reconnection in `loop()`
**File:** `src/main.cpp` (`setup()`, `loop()`)  
**Impact:** Permanent loss of OTA and Web UI after any WiFi dropout; session data lost

`setup()` reboots on initial connect failure. But once running, if WiFi drops (AP restart, range loss, DHCP renewal), there is no recovery path. `ArduinoOTA.handle()` and all WebSocket connections silently die. The motor continues running but becomes uncontrollable remotely.

```cpp
// In loop() — nothing like this exists:
if (WiFi.status() != WL_CONNECTED) { WiFi.reconnect(); }
```

**Fix:** Add a reconnect watchdog in `loop()`:
```cpp
static unsigned long wifiCheck = 0;
if (millis() - wifiCheck >= 10000UL) {
    wifiCheck = millis();
    if (WiFi.status() != WL_CONNECTED) {
        LOG("[WIFI] Reconnecting...");
        WiFi.disconnect();
        WiFi.begin(ssid, password);
    }
}
```

---

## P2 – Severe

### P2-A: Flash Wear – File Open/Close per Every Log Event
**File:** `src/session.cpp` (`_append()`)  
**Impact:** Excessive flash write amplification; slow main loop under burst logging

```cpp
void SessionLogger::_append(const String& line) {
    File f = LittleFS.open(sessionPath(_id), FILE_APPEND);
    f.println(line);
    f.close();  // flush after every write
}
```

Every individual event (step start/done, direction change, RPM sample, error, param change) opens the file, writes one line, and closes it. During a 6-step program execution:
- 6× STEP_START + 6× STEP_COMPLETE + multiple DIRECTION_CHANGE + PROGRAM_START/COMPLETE
- Plus RPM_SAMPLE every 5 s for the entire session duration

File open/close on LittleFS is not free — each close triggers a metadata flush. Under a burst (rapid step transitions), multiple sequential flushes happen in the same `loop()` tick, stalling the loop for 10–30 ms each.

**Fix:** Keep the file open for the duration of a session. Open in `start()`, write in `_append()`, close in `stop()`. Use `f.flush()` (not `f.close()`) after each write to still ensure data safety.

---

### P2-B: No Rate Limiting on Inbound WebSocket Commands
**File:** `src/web_api.cpp` (`handleCommand`)  
**Impact:** DoS from a buggy/malicious client; WDT reset under command flood

Any connected client can send unlimited commands. Each `handleCommand` call:
1. Parses JSON (`deserializeJson`)
2. May call `broadcastState()` (JSON serialize + WebSocket send)
3. May write to LittleFS (param save or session log)
4. May call `LOG()` (Serial + WebSerial send)

Under a flood of commands, the async task queue fills, heap fragments, and the WDT fires.

**Fix:** Add a command timestamp guard per client:
```cpp
// Only process a command if ≥50 ms since the last command from this client
if (millis() - _lastCmdMs[client->id()] < 50) return;
_lastCmdMs[client->id()] = millis();
```

---

### P2-C: `broadcastState()` Allocates `JsonDocument` + `String` at 10 Hz
**File:** `src/web_api.cpp`  
**Impact:** Heap fragmentation → OOM crash after hours of continuous operation

```cpp
void WebApi::broadcastState() {
    JsonDocument doc;   // dynamic heap allocation
    ...
    String json;        // second heap allocation
    serializeJson(doc, json);
    _ws.textAll(json);  // third allocation inside textAll per client
}
```

At 10 Hz with 2+ WebSocket clients, this is 30+ heap alloc/free cycles per second. ESP32's heap allocator (`heap_caps_malloc`) is not garbage-collected; repeated small allocations of different sizes cause fragmentation. After several hours the largest contiguous free block drops below what `JsonDocument` needs, causing a `std::bad_alloc` / `abort()`.

**Fix:** Use a static or reused buffer:
```cpp
static char jsonBuf[512];  // size to profile with serializeMsgPack or measure actual output
StaticJsonDocument<400> doc;
```
Or measure and cap at a known size; use `serializeJson(doc, jsonBuf, sizeof(jsonBuf))`.

---

### P2-D: `listSessions()` Builds Unbounded `String` via Repeated `+=`
**File:** `src/session.cpp` (`listSessions()`)  
**Impact:** Heap reallocation chain; can fail silently with 50 sessions under low heap

```cpp
String out = "[";
...
out += "{\"id\":..." // repeated concatenation, each reallocates
```

With 50 sessions at ~60 bytes each, this results in ~3 KB of iterative String expansion, each `+=` potentially triggering a `realloc`. If heap is fragmented (after hours of operation), this silently returns an empty or truncated string, corrupting the HTTP response.

**Fix:** Use `ArduinoJson` with a stream output directly to the HTTP response, or pre-compute the required size with `String::reserve()`.

---

### P2-E: `set_param` via WebSocket Writes NVS on Every Call
**File:** `src/web_api.cpp` (`handleCommand`, `set_param` branch)  
**Impact:** NVS endurance exhaustion (~100k cycles per key) if UI uses live sliders

```cpp
} else if (strcmp(cmd, "set_param") == 0) {
    ...
    if (validateParams(next)) {
        _params = next;
        saveParams(_params);  // ← NVS write on every valid set_param command
    }
}
```

NVS wear is rated at ~100,000 write cycles. If the UI sends `set_param` on slider release events, even 10 changes per session × 100 sessions = 1000 writes, manageable. But with live tracking or UI bugs, this can reach tens of thousands of writes.

**Fix:** Separate in-memory application from NVS persistence. Accept all changes immediately in `_params` but only write to NVS on an explicit `params_save` command (or debounce 2–5 s of inactivity).

---

### P2-F: `WebSocket` Multi-Frame Messages Silently Dropped
**File:** `src/web_api.cpp` (`begin()` WS event handler)  
**Impact:** Commands from UI or automation silently ignored; UI hangs

```cpp
if (info->final && info->index == 0 && info->len == len && info->opcode == WS_TEXT) {
    handleCommand(client, msg);
}
// Multi-frame messages: silently ignored
```

If a client sends a JSON command that exceeds the WebSocket frame size (fragmented), the condition is false and the message is dropped without any error response to the client. Browsers sometimes fragment frames for messages > 1400 bytes.

**Fix:** Accumulate partial frames in a per-client buffer:
```cpp
static String frameBuf[WS_MAX_QUEUED_MESSAGES];
if (info->index == 0) frameBuf[client->id()] = "";
frameBuf[client->id()] += String((char*)data, len);
if (info->final) { handleCommand(client, frameBuf[client->id()]); }
```

---

### P2-G: `programRunner.tick()` Runs at Full `loop()` Speed, Not 20 Hz
**File:** `src/main.cpp` (`loop()`)  
**Impact:** Unnecessary CPU burn; timing behaviour differs from design intent

```cpp
// 20 Hz tick block:
if (now - lastTick >= 50UL) {
    lastTick = now;
    rampCtrl.tick();        // ✔ gated at 20 Hz
    // fault checks...
}

// This is OUTSIDE the 50 ms gate:
if (!errorHandler.hasCritical()) {
    programRunner.tick();   // ✗ runs at loop() speed (~10–50 kHz)
}
```

The comment even says "20 Hz tick (must come after rampCtrl.tick)" but the code doesn't enforce it. While `tick()` returns early most of the time, when in `HOLDING` state it recalculates `millis()` deltas on every call at full speed, burning CPU and defeating the purpose of the rate-limited design.

**Fix:** Move `programRunner.tick()` inside the `if (now - lastTick >= 50UL)` block, after `rampCtrl.tick()`.

---

## P3 – Important Design Issues

### P3-A: `WebApi` Has a Hard Compile-Time Dependency on Simulation Types
**File:** `src/web_api.h`  
**Impact:** Phase 5 (REAL_HARDWARE) requires `WebApi` changes; violates HAL abstraction

```cpp
class WebApi {
    SimMotorDriver&    _simDriver;  // concrete sim type!
    SimRpmSource&      _simRpm;     // concrete sim type!
    ...
};
```

`WebApi` accepts both the abstract `IMotorDriver&` AND the concrete `SimMotorDriver&` for fault injection. This means when `REAL_HARDWARE` is enabled, `WebApi` must be modified or `inject_fault` commands must be guarded everywhere.

**Fix:** Introduce a `IFaultInjectable` interface (or use `#if defined(REAL_HARDWARE)` guards to compile out the injection commands in `WebApi`). The cleanest solution for Phase 5 is conditional compilation in `handleCommand`.

---

### P3-B: `extern const char* FIRMWARE_VERSION_STR` Declared Inside Function Body
**File:** `src/web_api.cpp`  
**Impact:** Fragile linkage; breaks if main.cpp is refactored

```cpp
} else if (strcmp(cmd, "session_start") == 0) {
    if (!_session.isActive()) {
        extern const char* FIRMWARE_VERSION_STR;  // ← inside function body
        _session.start(String(FIRMWARE_VERSION_STR), ...);
    }
}
```

**Fix:** Move `FIRMWARE_VERSION_STR` (or just `FIRMWARE_VERSION`) into a dedicated `version.h` header and include it where needed.

---

### P3-C: `ActiveError::message` is a Raw `const char*`
**File:** `src/error_handler.h`  
**Impact:** Dangling pointer risk if a caller ever passes a non-literal string

```cpp
struct ActiveError {
    ErrorCode   code;
    const char* message;  // not owning; relies on caller passing literals
    uint32_t    timestamp_ms;
};
```

All current callers pass string literals (safe). But there's no enforcement of this contract. Any refactor that passes a `String::c_str()` will produce a dangling pointer that is only caught at runtime.

**Fix:** Change `message` to `char message[48]` (fixed-size buffer) and use `strncpy` in `trigger()`. This also allows safe JSON serialization without lifetime concerns.

---

### P3-D: `DEFAULT_STEPS[]` Defined in Header File
**File:** `src/program.h`  
**Impact:** Multiple copies in flash; potential ODR violation if linkage changes

```cpp
// In program.h:
const ProgramStep DEFAULT_STEPS[DEFAULT_STEP_COUNT] = { ... };
```

`const` at file scope gives internal linkage in C++, so each TU that includes `program.h` gets its own copy in flash. Currently only `program.cpp` uses it, but any future include in another TU wastes flash.

**Fix:** Declare as `extern const ProgramStep DEFAULT_STEPS[]` in the header; define in `program.cpp`.

---

### P3-E: LittleFS Not Mounted Before `begin()` / `sessionLogger.begin()` Can Fail Silently
**File:** `src/main.cpp` (`setup()`)  
**Impact:** Session logging starts silently writing to nothing; no recovery path

```cpp
if (!LittleFS.begin()) {
    LOG("[ERROR] LittleFS mount failed – run 'Upload Filesystem Image' once");
    // ← execution continues; sessionLogger.begin() is called next
}
loadParams(params);
programRunner.loadSteps();
sessionLogger.begin();  // ← will silently fail if LittleFS not mounted
```

After a failed mount, all session writes silently fail (file open returns false), but `_active` can still be set to true and `isActive()` returns true, misleading the UI.

**Fix:** Add a `bool _fsReady` flag checked before any `_append()`. Alternatively, halt on filesystem failure since LittleFS is required for core functionality.

---

## P4 – Moderate Performance / Resource Issues

### P4-A: `_nextId()` and `_pruneOldest()` Each Do a Full Directory Scan
**File:** `src/session.cpp`  
**Impact:** 2× LittleFS directory scan per session start; unnecessary I/O latency

Both functions independently open `/sessions` and iterate all files. Called back-to-back in `start()`, this is 2 full directory traversals.

**Fix:** Merge into a single `_scanSessions(uint16_t& nextId, uint16_t& minId, uint8_t& count)` helper called once.

---

### P4-B: `_sumRpm` Float Precision Degradation in Long Sessions
**File:** `src/session.h`, `session.cpp`  
**Impact:** Inaccurate average RPM in session summary for very long sessions

```cpp
float    _sumRpm      = 0;     // single-precision float
uint32_t _sampleCount = 0;
```

A 10-hour session at 300 RPM sampling every 5 s = 7,200 samples × 300 = 2,160,000. Float32 has ~7 digits of precision; the running sum loses the last RPM digit by ~1,000 samples. For this application the error is small but grows.

**Fix:** Use `double` for `_sumRpm`, or use Welford's online algorithm for the running mean without accumulating the sum.

---

### P4-C: `uptime` Broadcast as Raw `millis()` (Rollover after 49.7 Days)
**File:** `src/web_api.cpp` (`broadcastState()`)  
**Impact:** UI uptime counter resets to 0 after ~49.7 days; minor but visible

```cpp
doc["uptime"] = millis();  // wraps at UINT32_MAX (~49.7 days)
```

**Fix:** Broadcast as seconds: `doc["uptime"] = millis() / 1000UL;` which overflows only after ~136 years.

---

### P4-D: No Heap Usage Monitoring
**File:** `src/main.cpp` (`loop()` heartbeat)  
**Impact:** No early warning before OOM crash

The 5-second heartbeat logs RPM and state but not heap. On an ESP32 with ~300 KB usable DRAM, heap fragmentation from String allocations becomes a problem well before the allocator fails.

**Fix:** Add to the 5-second heartbeat:
```cpp
LOG("[HB] heap=" + String(ESP.getFreeHeap()) +
    " minHeap=" + String(ESP.getMinFreeHeap()));
```

---

### P4-E: `String` Concatenation Pattern in `logEvent()` and `listSessions()`
**File:** `src/session.cpp`  
**Impact:** Repeated heap reallocation for every log event

```cpp
String line = "{\"ts\":" + String(_ts()) + ",\"type\":\"" + type + "\"";
```

Each `+` creates a temporary `String`, which is then concatenated. This is O(n²) in the number of fragments. For `listSessions()` with 50 entries it's measurably slow.

**Fix:** Use `String::reserve()` upfront, or use `snprintf` into a fixed-size `char buf[128]`.

---

## P5 – Minor

### P5-A: `target` WebSerial Command Enables Motor Even for Invalid Input
**File:** `src/main.cpp` (`onWebSerialMessage`)

```cpp
} else if (cmd.startsWith("target ")) {
    float rpm = cmd.substring(7).toFloat();
    motorDriver->enable();   // ← called before validation
    rampCtrl.setTarget(rpm); // ← setTarget clamps to max_rpm, but 0.0f is valid
}
```

`"target abc"` parses as 0.0f → motor gets enabled and ramps to 0. Harmless in simulation but confusing; in real hardware could briefly energize the motor unnecessarily.

**Fix:** Validate rpm > 0 before enabling, or at minimum log a warning on `toFloat()` == 0 with non-numeric input.

---

### P5-B: `session_stop` Passes `0` for `avgRpm` / `maxRpmSeen` 
**File:** `src/web_api.cpp`

```cpp
_session.stop(0, 0, _program.currentStep());
```

`stop()` has fallback logic using internal stats, so this is functionally correct. But the API is misleading — callers look like they're providing real stats. `avgRpm` and `maxRpmSeen` parameters should either be removed (and the function compute everything from internal state) or the callers should pass the actual values.

---

### P5-C: JSON String Building in `logEvent()` Not Using ArduinoJson
**File:** `src/session.cpp`

`logEvent()` manually builds a JSON string via concatenation, while most other log methods use `JsonDocument`. This inconsistency means any value containing `"` or `\` passed in `extra` will produce invalid JSON.

**Fix:** Unify all session log methods to use `JsonDocument`.

---

### P5-D: `stateStr[]` Array in WebSerial Handler and Heartbeat Are Out of Sync
**File:** `src/main.cpp`

```cpp
// In onWebSerialMessage:
const char* stateStr[] = { "IDLE", "RAMPING_UP", "RUNNING", "RAMPING_DOWN", "DIR_CHANGE_PAUSE" };

// In loop() heartbeat:
const char* stateStr[] = { "IDLE", "RAMPING_UP", "RUNNING", "RAMPING_DOWN", "DIR_CHG_PAUSE" };
//                                                                            ^^^^^^^^^^^^^^^^ different!
```

`"DIR_CHANGE_PAUSE"` vs `"DIR_CHG_PAUSE"` — any log analysis tool parsing these will see two different state names for the same state. The `rampStateStr()` helper in `web_api.cpp` is the canonical version; use it everywhere.

---

## Prioritized TODO List

| # | Priority | Task | File(s) |
|---|---|---|---|
| 1 | 🔴 P1-A | Add mutex/spinlock protecting all shared state accessed from async callbacks | all modules |
| 2 | 🔴 P1-B | Make `LOG()` thread-safe (post to queue, drain from `loop()`) | `log.h` |
| 3 | 🔴 P1-C | Add WiFi reconnection watchdog in `loop()` | `main.cpp` |
| 4 | 🟠 P2-G | Move `programRunner.tick()` into the 50 ms gate | `main.cpp` |
| 5 | 🟠 P2-A | Keep session file open for session lifetime; replace per-write open/close with `f.flush()` | `session.cpp` |
| 6 | 🟠 P2-C | Use static/reused buffer for `broadcastState()` JSON | `web_api.cpp` |
| 7 | 🟠 P2-B | Add per-client command rate limiter (50 ms gate) | `web_api.cpp` |
| 8 | 🟠 P2-D | Fix `listSessions()` string building (use `reserve()` or streaming) | `session.cpp` |
| 9 | 🟠 P2-E | Decouple in-memory param updates from NVS writes; require explicit save | `web_api.cpp` |
| 10 | 🟠 P2-F | Handle multi-frame WebSocket messages (per-client accumulation buffer) | `web_api.cpp` |
| 11 | 🟡 P3-E | Guard `sessionLogger.begin()` and all `_append()` calls behind `_fsReady` flag | `session.cpp`, `main.cpp` |
| 12 | 🟡 P3-C | Change `ActiveError::message` to a fixed-size `char[48]` buffer | `error_handler.h`, `.cpp` |
| 13 | 🟡 P3-B | Move `FIRMWARE_VERSION_STR` to `version.h` | `main.cpp`, `web_api.cpp` |
| 14 | 🟡 P3-A | Wrap fault-injection WebSocket commands in `#if !defined(REAL_HARDWARE)` | `web_api.h`, `.cpp` |
| 15 | 🟡 P3-D | Move `DEFAULT_STEPS[]` definition to `program.cpp` | `program.h`, `program.cpp` |
| 16 | 🔵 P4-D | Add heap free / min-heap to 5-second heartbeat log | `main.cpp` |
| 17 | 🔵 P4-A | Merge `_nextId()` + `_pruneOldest()` into one directory scan | `session.cpp` |
| 18 | 🔵 P4-C | Change `uptime` broadcast to seconds (`millis() / 1000`) | `web_api.cpp` |
| 19 | 🔵 P4-B | Use `double` or Welford online mean for `_sumRpm` / `_sampleCount` | `session.h`, `.cpp` |
| 20 | 🔵 P4-E | Use `snprintf` / `reserve()` in `logEvent()` and `listSessions()` | `session.cpp` |
| 21 | ⚪ P5-D | Unify `RampState` string representation (use `rampStateStr()` everywhere) | `main.cpp` |
| 22 | ⚪ P5-C | Unify `logEvent()` to use `JsonDocument` like other log methods | `session.cpp` |
| 23 | ⚪ P5-A | Validate `target` WebSerial command input before enabling motor | `main.cpp` |
| 24 | ⚪ P5-B | Remove unused `avgRpm`/`maxRpmSeen` params from `session_stop` call | `web_api.cpp` |

---

## Risk Matrix

```
                HIGH IMPACT
                     │
  P1-A (race)   ─────┼───── P1-B (LOG race)
  P1-C (WiFi)        │
                     │
  P2-A (flash) ──────┼───── P2-C (heap frag)
  P2-G (tick)        │      P2-B (DoS)
                     │
──────────────────── ┼ ────────────────────
                     │
  P3-A (HAL)   ──────┼───── P4-D (no heap mon)
  P3-E (FS)         │
                     │
  P5-D (str)   ──────┼───── P5-A (target cmd)
                     │
                LOW IMPACT
         LOW LIKELIHOOD      HIGH LIKELIHOOD
```

---

*Generated by automated code review. Review findings with the team before acting on P3+ items.*
