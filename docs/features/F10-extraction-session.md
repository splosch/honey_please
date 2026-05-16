# F10 – Honey Extraction Session

**Status:** ✅ Implemented (v1.4.0)  
**Depends on:** [F02 – RPM Monitoring](./F02-rpm-monitoring.md), [F04 – Direction Control](./F04-direction-control.md), [F05 – Error States](./F05-error-states.md), [F09 – Multi-Step Program](./F09-multistep-program.md)  
**Referenced by:** [Feature Overview](./FEATURE-OVERVIEW.md)

---

## 1. Goal

Track a complete honey extraction run from start to finish. Every significant event is recorded with a timestamp. The operator sees a live log during the session and can export it afterwards for analysis or record-keeping.

---

## 2. Session Lifecycle

```
[START SESSION]
      │
      ▼
   RUNNING
   (manual control or program auto-run)
      │
      ├── [PAUSE]  →  PAUSED  →  [RESUME]  ──────┐
      │                                           │
      └──────────────────────────────────────────┘
      │
      ├── [STOP SESSION] / program complete
      ▼
   COMPLETED
      │
      ▼
   [VIEW / EXPORT]
```

A session is identified by:
- `session_id`: incrementing integer, stored in EEPROM (persists across power cycles)
- `started_at`: millis-based offset from boot (no RTC on R4 WiFi by default)
- `firmware_version`: from `FIRMWARE_VERSION` constant

---

## 3. Session Protocol – Event Types

| Event | Logged when | Implemented |
|---|---|---|
| `SESSION_START` | Operator starts session | ✅ |
| `SESSION_SUMMARY` | Operator stops or program completes | ✅ |
| `PAUSE` | Operator pauses program | ✅ |
| `RESUME` | Operator resumes program | ✅ |
| `SKIP` | Operator skips a step | ✅ |
| `RPM_SAMPLE` | Every 5 seconds (configurable) during active session | ✅ |
| `DIRECTION_CHANGE` | Direction change initiated (before it occurs) | ✅ |
| `STEP_START` | Program step begins (after direction is set) | ✅ |
| `STEP_COMPLETE` | Program step ends (hold timer expired) | ✅ |
| `PROGRAM_START` | Multi-step program started | ✅ |
| `PROGRAM_COMPLETE` | All steps finished | ✅ |
| `PROGRAM_ABORT` | Operator aborted program mid-run | ✅ |
| `PARAM_CHANGE` | Any parameter change applied | ✅ |
| `ERROR` | Any error condition triggered (code + message) | ✅ |
| `ERROR_CLEARED` | Error resolved / operator reset | ✅ |
| `RPM_TARGET_SET` | Target RPM changed manually | ✘ not implemented |
| `RAMP_START` | Ramp begins (up or down) | ✘ not implemented |
| `RAMP_COMPLETE` | Target RPM reached | ✘ not implemented |
| `DIRECTION_APPLIED` | GPIO flip applied (after pause) | ✘ not implemented |

---

## 4. Log Entry Format

Files are **JSONL** – one JSON object per line. Example entries:

```jsonl
{"ts":0,"type":"SESSION_START","id":3,"fw":"1.4.0","max_rpm":100,"steps":6}
{"ts":2041,"type":"PROGRAM_START","steps":6,"max_rpm":100}
{"ts":2041,"type":"STEP_START","step":1,"total":6,"dir":"CCW","target_rpm":30,"dur_s":60}
{"ts":84521,"type":"RPM_SAMPLE","rpm":30.0,"dir":"CCW","state":"RUNNING"}
{"ts":91204,"type":"STEP_COMPLETE","step":1,"avg_rpm":29.8}
{"ts":91204,"type":"DIRECTION_CHANGE","from":"CCW","to":"CW"}
{"ts":91410,"type":"ERROR","code":"E09","msg":"E-Stop via Web UI"}
{"ts":95000,"type":"ERROR_CLEARED"}
{"ts":584000,"type":"PROGRAM_COMPLETE","duration_s":582}
{"ts":584100,"type":"SESSION_SUMMARY","duration_s":584,"avg_rpm":61.3,"max_rpm":100.0,"steps_done":6}
```

All timestamps are milliseconds since session start (`millis()` offset).

---

## 5. Storage

On R4 WiFi, **no filesystem is available** (no LittleFS, no SD card). Sessions are stored in a **SRAM ring buffer** capped at 50 entries.

```cpp
// session.h
struct SessionEntry {
    uint32_t ts;             // ms since session start
    char     type[20];       // event type string
    char     payload[80];    // JSON fragment (key:value pairs)
};

const uint8_t SESSION_RING_SIZE = 50;
SessionEntry sessionRing[SESSION_RING_SIZE];
uint8_t      sessionHead = 0;  // next write index (wraps)
uint8_t      sessionCount = 0; // total entries (capped at SESSION_RING_SIZE)
```

**Constraints:**
- Max entries per session: 50 (oldest overwritten when limit reached)
- Each entry: ~100 bytes → 50 entries ≈ 5 KB SRAM
- Session data is **volatile** – lost on power cycle or reset
- Typical 6-step program ≈ 30–40 entries – fits comfortably within 50-entry limit

> **TODO (open item):** Consider optional EEPROM snapshot of SESSION_SUMMARY on stop, so the last session result survives a reboot (requires ~100 bytes of EEPROM).

Format: **JSONL in-memory** – entries written to the ring buffer immediately. No disk flush needed (no filesystem). Each entry is a small struct with a type string and a payload JSON fragment.

**Entry lifecycle:**
- Written on each event (motor state changes, RPM samples, errors, step transitions)
- Served over HTTP / WebSocket on demand
- Cleared when a new session starts

---

## 6. Session Summary

On `SESSION_STOP`, the firmware appends a `SESSION_SUMMARY` block:

```jsonl
{"ts":584100,"type":"SESSION_SUMMARY","duration_s":584,"avg_rpm":61.3,"max_rpm":100.0,"steps_done":6}
```

**Fields:** `duration_s` (total session length), `avg_rpm` (arithmetic mean of all RPM samples), `max_rpm` (peak sample), `steps_done` (steps in COMPLETE state at stop time).

> `min_rpm` and `dir_changes` counters are not included in the current implementation.

---

## 7. Web UI – Session Bar

A persistent bar at the bottom of the schematic view:

```
┌─────────────────────────────────────────────────────────┐
│ ● Recording – Session #3   [■ Stop]  [⬇ Export]        │
└─────────────────────────────────────────────────────────┘
```

After stop, the label changes to `Session #3 – Stopped` and the Export button remains visible:

```
┌─────────────────────────────────────────────────────────┐
│ Session #3 – Stopped   [⏺ Record]  [⬇ Export]          │
└─────────────────────────────────────────────────────────┘
```

Planned but not yet implemented:
- Live scrolling event log during recording
- Session history browser page (currently only the active session is in RAM)

### Session API

`GET /session` returns the current session's ring buffer as a JSONL response (one entry per line):

```
HTTP/1.1 200 OK
Content-Type: application/x-ndjson
Access-Control-Allow-Origin: *

{"ts":0,"type":"SESSION_START","id":3,"fw":"1.5.0",...}
{"ts":2041,"type":"PROGRAM_START",...}
...
```

---

## 8. Export Format

### JSONL Download

The current in-memory session can be downloaded via:
```
GET /session
```
Response: `Content-Type: application/x-ndjson` with the full ring buffer as JSONL text. The browser can save this as a `.jsonl` file for offline analysis.

> Only the **current session** is available (in-memory). Previous sessions are not stored after a new session starts or the board is reset.

---

## 9. Acceptance Criteria

- [x] Session starts/stops on operator command or program completion
- [x] RPM samples written every 5 seconds during active session
- [x] All errors logged with code, message, and timestamp
- [x] Session summary (`SESSION_SUMMARY`) generated on every STOP
- [x] Session accessible via `GET /session` (JSONL API, CORS header included)
- [ ] JSONL export downloadable from browser – not yet implemented for R4
- [ ] Live scrolling event log in UI during recording – not yet implemented
- [ ] Optional EEPROM snapshot of last SESSION_SUMMARY on stop – not yet implemented
- [ ] Plain text / human-readable export – not yet implemented
- [ ] Live scroll pauses on manual scroll-up – not yet implemented
