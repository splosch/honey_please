# WebSocket Protocol

**Parent:** [Web UI README](./README.md) | [ARCHITECTURE.md](../../ARCHITECTURE.md)

Endpoint: `ws://<board-ip>/ws`  
Rate: 10 Hz (every 100 ms, board → browser)  
Format: JSON, UTF-8

---

## Board → Browser: State Frame

Sent at 10 Hz. All fields always present.

```json
{
  "state":      "IDLE",          // motor state machine state (see State Values)
  "rpm":        0.0,             // current RPM (float)
  "target":     0.0,             // target RPM (float)
  "direction":  "CW",           // "CW" or "CCW"
  "sim":        true,            // true = simulation mode active
  "error":      0,               // error code (0 = no error; see Error Codes)
  "ramp_pct":   0,               // ramp progress 0–100 (int)
  "ramp_eta_s": 0,               // ramp ETA in seconds (int)
  "program": {
    "active":   false,           // true = program runner active
    "step":     0,               // current step index (0-based)
    "total":    6                // total steps
  },
  "session": {
    "active":   false,           // true = extraction session recording
    "id":       0,               // session ID
    "entries":  0                // number of entries in ring buffer
  },
  "uptime_s":   1234,            // board uptime in seconds
  "ram_free":   20480            // free SRAM in bytes
}
```

---

> **State strings** are defined in `src/error_handler.h` (error codes) and serialised in `src/web_api.cpp`. Those are the source of truth — read them when adding a new state or error code.

---

## Browser → Board: Commands

Send as JSON string over the WebSocket connection.

```json
{ "cmd": "start",   "direction": "CW"  }   // start motor CW
{ "cmd": "start",   "direction": "CCW" }   // start motor CCW
{ "cmd": "stop"                        }   // normal stop (ramp down)
{ "cmd": "estop"                       }   // emergency stop (immediate)
{ "cmd": "reset_fault"                 }   // clear error state
{ "cmd": "set_target", "rpm": 150.0    }   // change target RPM
{ "cmd": "set_param",  "key": "accel_rpm_per_s", "value": 10.0 }
{ "cmd": "session_start"               }   // begin extraction session
{ "cmd": "session_stop"                }   // end extraction session
{ "cmd": "program_start"               }   // start multi-step program
{ "cmd": "program_abort"               }   // abort running program
```

---

## HTTP Endpoints

| Method | Path | Response |
|---|---|---|
| `GET` | `/status` | JSON snapshot (same schema as WS frame) + CORS headers |
| `GET` | `/` | `200 OK` info text (not a 404) |
| `GET` | `/sessions` | JSON array of session summaries |
| `GET` | `/sessions?id=N` | JSONL export of session N entries |
| `OPTIONS` | `*` | `200 OK` + CORS headers (preflight) |

---

## CORS Policy

Every HTTP response includes:
```
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, POST, OPTIONS
Access-Control-Allow-Headers: Content-Type
```

See [AGENTS.md – CORS section](../../AGENTS.md) for rationale.
