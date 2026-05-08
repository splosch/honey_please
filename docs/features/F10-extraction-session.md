# F10 – Honey Extraction Session

**Status:** Planning  
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

| Event | Logged when |
|---|---|
| `SESSION_START` | Operator starts session |
| `SESSION_STOP` | Operator stops or program completes |
| `SESSION_PAUSE` | Operator pauses |
| `SESSION_RESUME` | Operator resumes |
| `RPM_SAMPLE` | Every 5 seconds (configurable) during RUNNING |
| `RPM_TARGET_SET` | Any time target RPM changes |
| `DIRECTION_CHANGE` | Direction change initiated |
| `DIRECTION_APPLIED` | GPIO flip applied (after pause) |
| `RAMP_START` | Ramp begins (up or down) |
| `RAMP_COMPLETE` | Target RPM reached |
| `STEP_START` | Multi-step program step begins |
| `STEP_COMPLETE` | Multi-step program step ends |
| `PROGRAM_START` | Multi-step program started |
| `PROGRAM_COMPLETE` | Multi-step program finished |
| `PROGRAM_ABORT` | Operator aborted program mid-run |
| `PARAM_CHANGE` | Any parameter change applied |
| `ERROR` | Any error condition triggered |
| `ERROR_CLEARED` | Error resolved/reset |
| `EMERGENCY_STOP` | E-Stop triggered |

---

## 4. Log Entry Format

```json
{
  "ts":    84521,
  "type":  "RPM_SAMPLE",
  "rpm":   45.2,
  "dir":   "CCW",
  "state": "RUNNING"
}
```

```json
{
  "ts":    91204,
  "type":  "ERROR",
  "code":  "E06_DRIVER_FAULT",
  "msg":   "nFAULT pin LOW – driver thermal shutdown"
}
```

All timestamps are milliseconds since session start (`millis()` offset).

---

## 5. Storage

Sessions are stored in **LittleFS** on the ESP32:

```
/sessions/
  session_001.json
  session_002.json
  ...
```

Each file is a JSON array of log entries, written incrementally (appended as events occur).

**Storage limits:**
- Max entries per session: 10 000
- Max sessions stored: 50 (oldest deleted when limit reached)
- Each entry ~80 bytes → 10 000 entries ≈ 800 kB per session
- Total budget ≈ 40 MB (requires 4 MB flash partition for LittleFS, verify partition table)

> ⚠️ Verify partition table allocates sufficient LittleFS space.  
> Default ESP32 4MB split: 1.5 MB app + 1.5 MB SPIFFS = OK for ~10 sessions of typical length.

---

## 6. Session Summary

On `SESSION_STOP`, the firmware generates a summary block appended to the session file:

```json
{
  "type": "SESSION_SUMMARY",
  "duration_s":  584,
  "avg_rpm":     61.3,
  "max_rpm":     100.0,
  "min_rpm":     0.0,
  "dir_changes": 5,
  "errors":      0,
  "steps_done":  6
}
```

---

## 7. Web UI – Session Panel

### Live Log (during session)

A collapsible panel at the bottom of the schematic view:

```
┌─────────────────────────────────────────────────────────┐
│ 📋 SESSION #007  ●RECORDING   00:08:41      [STOP]     │
├─────────────────────────────────────────────────────────┤
│ T+00:00  SESSION START   max_rpm=100, steps=6           │
│ T+00:02  PROGRAM START                                  │
│ T+00:02  STEP 1 START    CCW  30 RPM                    │
│ T+00:14  RAMP COMPLETE   30 RPM reached                 │
│ T+01:14  STEP 1 DONE     avg 29.9 RPM                   │
│ T+01:14  DIR CHANGE      CCW → CW                       │
│ T+01:20  STEP 2 START    CW   30 RPM                    │
│  ...                                                    │
│ T+08:41  [LIVE ●]                                       │
└─────────────────────────────────────────────────────────┘
```

Auto-scrolls to bottom. Operator can scroll up to review history.

### Session History (dedicated page `/sessions`)

Lists all stored sessions as cards:

```
Session #007  –  2026-05-08 14:22  –  09:44  –  6 steps  –  0 errors  [VIEW] [EXPORT] [DELETE]
Session #006  –  2026-05-06 10:05  –  07:12  –  4 steps  –  1 error   [VIEW] [EXPORT] [DELETE]
```

---

## 8. Export Format

### JSON

Full event log as downloaded JSON file: `session_007.json`

### Plain Text

Human-readable summary:

```
honey_please – Session Report
Session #007  |  2026-05-08 14:22  |  Duration: 9 min 44 s
Firmware: v1.0.0  |  Max RPM configured: 100

TIMELINE
--------
T+00:00  Session start
T+00:02  Program start (6 steps, max 100 RPM)
...

SUMMARY
-------
Average RPM:    61.3
Max RPM:       100.0
Direction changes: 5
Errors:          0
Steps completed: 6/6
```

Export is triggered via:
- `GET /sessions/007/export?format=json`
- `GET /sessions/007/export?format=txt`

---

## 9. Acceptance Criteria

- [ ] Session starts/stops on operator command or program completion
- [ ] RPM samples written every 5 seconds during RUNNING
- [ ] All errors logged with code, message, and timestamp
- [ ] Session file survives power loss mid-session (LittleFS flush after each append)
- [ ] Session summary generated on every STOP
- [ ] Session history accessible at `/sessions`
- [ ] Export works for both JSON and plain text
- [ ] Max 50 sessions stored; oldest auto-deleted when exceeded
- [ ] Live log auto-scrolls in UI; scroll-up pauses auto-scroll
