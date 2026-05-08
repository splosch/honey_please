# F07 – Web UI Schematic View

**Status:** Done – M3.1–7, M3.11 complete ┃ M3.8 / M3.9 / M3.10 optional (deferred)  
**Depends on:** [F01](./F01-motor-control-architecture.md), [F02](./F02-rpm-monitoring.md), [F03](./F03-acceleration-deceleration-ramps.md), [F04](./F04-direction-control.md), [F05](./F05-error-states.md), [F06](./F06-rpm-limits-and-params.md)  
**Referenced by:** [Feature Overview](./FEATURE-OVERVIEW.md)

---

## 1. Design Philosophy

The Web UI is a **live system schematic**, not a control panel. The operator should be able to determine the full system state at a glance – without reading any text. Controls are secondary to information. Errors and deviations must be visually dominant.

---

## 2. Layout Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│  honey_please  ●CONNECTED    [SIM]  [⚙ PARAMS]  [SESSION ▶]       │  ← Top bar
├──────────────────────┬──────────────────────┬───────────────────────┤
│                      │                      │                       │
│    [ ESP32 ]         │  [ MOTOR CTRL ]      │   [ HONIGSCHLEUDER ]  │  ← Component row
│                      │        │             │                       │
│  Pin Diagram         │  PWM ══╗             │    ↺  LEFT / CCW     │
│  GPIO 18 ▪ PWM       │  DIR ══╝             │                       │
│  GPIO 19 ▪ DIR_A     │                      │    ████  45 RPM       │
│  GPIO 21 ▪ DIR_B     │  STATUS: OK ●        │    ████  → 80 RPM    │
│  GPIO 22 ▪ ENABLE    │  Temp: 42°C (est.)   │    [=========░░░] ▲  │
│  GPIO 34 ▪ RPM IN    │                      │    ETA: 3.5 s         │
│  GPIO 35 ▪ FAULT IN  │                      │                       │
│                      │                      │    ○──────────○       │  ← wire connectors
│  WiFi: 192.168.x.x   │                      │                       │
│  Uptime: 00:42:17    │                      │                       │
└──────────────────────┴──────────────────────┴───────────────────────┘
│                                                                     │
│  ◄ LEFT                  [PAUSE]  [■ STOP]  [🚨 E-STOP]   RIGHT ► │  ← Controls
│                                                                     │
│  RPM ─────────────────────────────────────────────────────────     │  ← Sparkline
│       ╱──────────────────────────╲                                  │
│      ╱                            ╲─────                            │
│                                                                     │
├─────────────────────────────────────────────────────────────────────┤
│  SESSION LOG  ▼                                                     │  ← Collapsible
│  [12:34:05] START  [12:34:15] RPM 45  [12:34:20] RAMP→80          │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 3. Component Boxes

Each component is rendered as an SVG or HTML panel with a colored status ring:

| Ring Color | Meaning |
|---|---|
| Green solid | Component healthy, active |
| Green pulsing | Idle / standby |
| Yellow | Warning (non-critical) |
| Orange | Error (non-critical, motor may run) |
| Red flashing | CRITICAL / FAULT_STOP |
| Gray | Offline / unknown |

### 3.1 ESP32 Component Box

Shows the pin diagram of all motor-relevant GPIOs:

```
┌─────────────────────────┐
│ ⬡ ESP32                 │ ● GREEN
├─────────────────────────┤
│ GPIO 18  PWM     ██░░░░ │  ← duty cycle bar (live)
│ GPIO 19  DIR_A   [HIGH] │  ← live HIGH/LOW badge
│ GPIO 21  DIR_B   [LOW]  │
│ GPIO 22  ENABLE  [HIGH] │
│ GPIO 34  RPM IN  ~~~~   │  ← waveform indicator (pulse activity)
│ GPIO 35  FAULT   [HIGH] │  ← HIGH = OK, LOW = FAULT
├─────────────────────────┤
│ IP: 192.168.178.64      │
│ WiFi: ████ -65 dBm      │
│ Uptime: 00:42:17        │
│ Free RAM: 178 kB        │
└─────────────────────────┘
```

- Each GPIO row lights up with the color corresponding to its active state.
- PWM pin shows an animated duty cycle bar that reflects actual PWM value.
- RPM input shows a small animated waveform when pulses are detected.

### 3.2 Motor Controller Component Box

```
┌─────────────────────────┐
│ ⚡ MOTOR CTRL           │ ● GREEN
├─────────────────────────┤
│ PWM IN:   ██████░░ 75%  │
│ DIR:      CW (→)        │
│ ENABLE:   ON   ●        │
│ nFAULT:   OK   ●        │
├─────────────────────────┤
│ Driver: [TBD]           │
│ Est. Load: ~1.2 A       │
└─────────────────────────┘
```

- Goes RED with fault overlay when nFAULT triggers.
- Est. Load is a calculated estimate (not measured), based on PWM duty.

### 3.3 Honigschleuder Component Box

```
┌─────────────────────────┐
│ 🍯 HONIGSCHLEUDER       │ ● GREEN
├─────────────────────────┤
│                         │
│      ↺  CCW / LEFT      │  ← animated basket SVG
│                         │
│  ┌──────────────────┐   │
│  │ 45 RPM → 80 RPM  │   │  ← current + target
│  └──────────────────┘   │
│  [====█████░░░░░░░░]    │  ← ramp bar (blue = ramping)
│  ETA: 3.5 s             │
│                         │
│  ○─────────────────○    │  ← wire connector to motor ctrl
└─────────────────────────┘
```

- Basket SVG rotates at a speed proportional to current RPM.
- Rotation direction follows actual direction setting.
- Rotation freezes (and box pulses gray) during DIR_CHANGE_PAUSE.

---

## 4. Connection Lines (Wiring Visualization)

SVG lines between component boxes represent physical wiring:

- ESP32 PWM pin → Motor Controller PWM input: animated dashed line (dash flows in data direction)
- ESP32 DIR pins → Motor Controller DIR: static lines
- Motor Controller output → Motor: thick line, color reflects active power (gray = idle, green = powered, red = fault)

---

## 5. Control Bar

Fixed at bottom, always visible:

| Button | State | Action |
|---|---|---|
| ◄ LEFT | Active during CW | Request CCW (triggers F04 sequence) |
| ► RIGHT | Active during CCW | Request CW (triggers F04 sequence) |
| ❙❙ PAUSE | Always visible | Pause at current RPM (ramp to 0, hold) |
| ▶ RESUME | Visible when PAUSED | Ramp back to pre-pause RPM |
| ■ STOP | Always visible | Controlled ramp to 0 → IDLE |
| 🚨 E-STOP | Always visible, red | Immediate PWM cut → FAULT_STOP |
| [RESET FAULT] | Visible only in FAULT_STOP | Clears fault, returns to IDLE |

---

## 6. RPM Sparkline

- 30-second rolling window
- 500 ms resolution
- Colored fill: green = target zone, blue = ramping, red = overspeed
- Projected ramp overlaid as dashed line
- Tooltip on hover: exact RPM + timestamp

---

## 7. Technology Stack

| Layer | Technology | Rationale |
|---|---|---|
| Served from ESP32 | LittleFS + AsyncWebServer | Single device, no external hosting |
| UI framework | Vanilla JS + SVG | Minimal payload, no npm bundle step |
| WebSocket client | Native `WebSocket` API | No dependencies |
| Styling | CSS custom properties | Theming, component state via CSS classes |
| Charts | Canvas 2D API (custom) | Lightweight, no library overhead |

> Alternative: **HTMX + minimal CSS** for even simpler state management. Evaluate during prototyping.

---

## 8. Acceptance Criteria

- [x] All three component boxes visible on 1024×768 and mobile portrait
- [x] GPIO states update within 200 ms of pin change
- [x] Basket SVG animation speed proportional to current RPM
- [x] RPM gauge arc updates at ≥ 10 Hz *(replaced by large numerical RPM display + sparkline)*
- [x] CRITICAL error triggers red full-screen overlay within 500 ms
- [x] UI works offline (served from ESP32 LittleFS, no CDN)
- [x] WebSocket reconnect is automatic and transparent (< 3 s)
- [x] E-STOP button always interactive (not disabled by any state)
- [ ] *(optional)* PAUSE / RESUME buttons in control bar (M3.8)
- [ ] *(optional)* WARNING (yellow banner) and ERROR (orange banner) overlays differentiated from CRITICAL (M3.9)
- [ ] *(optional)* Parameters panel: sliders for max\_rpm, accel, decel, dir\_pause with live WS `set_param` dispatch (M3.10)

---

## 9. Implementation Notes (v1.3.0)

- UI split into three LittleFS files: `index.html` (structure), `style.css` (theme + layout), `app.js` (WebSocket + render loop).
- `app.js` connects to `ws://<host>/ws`, auto-reconnects every 2 s on close.
- Basket SVG uses `requestAnimationFrame`; angle advances by `rpm × dt / 60 000 × 360°` per frame.
- Sparkline uses Canvas 2D, 30 s rolling buffer at 500 ms resolution (60 samples).
- Fault injection panel is hidden when `state.sim === false`; buttons toggle `inject_fault` WS commands.
- `set_param` WS command is implemented in `web_api.cpp` (key/value dispatch + NVS save). UI panel pending.
