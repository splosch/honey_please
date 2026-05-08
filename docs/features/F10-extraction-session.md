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
- `session_id`: incrementing integer, stored in NVS
- `started_at`: ISO 8601 timestamp (system clock or millis offset)
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

Sessions are stored in **LittleFS** on the ESP32:

```
/sessions/
  s001.jsonl
  s002.jsonl
  ...
```

Format: **JSONL** (newline-delimited JSON – one event object per line). The file is opened for append and immediately closed after every write, ensuring each event survives a power loss.

**Storage limits:**
- Max sessions stored: 50 (oldest deleted when limit reached)
- No fixed per-session entry cap; limited by available LittleFS partition space
- Typical session entry ~80–120 bytes; a full 6-step program ≈ 50–80 entries ≈ 5–10 KB
- Partition: `min_spiffs.csv` – ~1.5 MB for LittleFS; sufficient for many sessions

> ⚠️ LittleFS partition size limits maximum total stored data.  
> At ~8 KB/session average, 50 sessions ≈ 400 KB – well within the 1.5 MB budget.

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
- Session history browser page (list of all stored sessions)
- DELETE action per session

### Session List API

`GET /sessions` (no `id` param) returns a JSON array:

```json
[
  {"id": 3, "size": 4821, "path": "/sessions/s003.jsonl"},
  {"id": 2, "size": 6102, "path": "/sessions/s002.jsonl"}
]
```

---

## 8. Export Format

### JSONL Download

The raw session file is downloaded as-is via:
```
GET /sessions?id=3
```
Response: `Content-Disposition: attachment; filename="s003.jsonl"` with the full JSONL body.

> Plain text / human-readable export is not yet implemented.

---

## 9. Acceptance Criteria

- [x] Session starts/stops on operator command or program completion
- [x] RPM samples written every 5 seconds during active session
- [x] All errors logged with code, message, and timestamp
- [x] Session file survives power loss mid-session (LittleFS flush after each append)
- [x] Session summary (`SESSION_SUMMARY`) generated on every STOP
- [x] Session list accessible via `GET /sessions` (JSON API)
- [x] JSONL export works via `GET /sessions?id=N`
- [x] Max 50 sessions stored; oldest auto-deleted when exceeded
- [ ] Plain text / human-readable export – not yet implemented
- [ ] Live scrolling event log in UI during recording – not yet implemented
- [ ] Session history browser page (list + delete) – not yet implemented
- [ ] Live scroll pauses on manual scroll-up – not yet implemented
