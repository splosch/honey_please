# F07 – Web UI Schematic View

**Status:** ✅ Implemented on ESP32 (v1.4.0) | ⚠️ R4 port pending – `web_api.cpp` / `main.cpp` rewrite required (Phase 6: M6.4–M6.7)  
Web UI files (`data/`) carry over unchanged. Board-side WebSocket server and HTTP endpoints need rewrite.  
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
│    [ R4 WiFi ]       │  [ MOTOR CTRL ]      │   [ HONIGSCHLEUDER ]  │  ← Component row
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

### 3.1 R4 WiFi Component Box

Shows the pin diagram of all motor-relevant GPIOs (pin numbers are TBD placeholders until schematic confirmed):

```
┌─────────────────────────┐
│ ⬡ R4 WiFi / RA4M1    │ ● GREEN
├─────────────────────────┤
│ Pin 5   PWM     ██░░░░ │  ← duty cycle bar (live)
│ Pin 7   DIR_A   [HIGH] │  ← live HIGH/LOW badge
│ Pin 8   DIR_B   [LOW]  │
│ Pin 6   ENABLE  [HIGH] │
│ Pin 2   RPM IN  ~~~~   │  ← waveform indicator (pulse activity)
│ Pin 4   FAULT   [HIGH] │  ← HIGH = OK, LOW = FAULT
├─────────────────────────┤
│ IP: <board-ip>         │
│ WiFi: ████ -65 dBm      │
│ Uptime: 00:42:17       │
│ Free SRAM: ~20 kB      │
└─────────────────────────┘
```

- Each pin row lights up with the color corresponding to its active state.
- PWM pin shows an animated duty cycle bar that reflects actual PWM value.
- RPM input shows a small animated waveform when pulses are detected.
- Pin numbers are TBD; update the UI constants in `app.js` when schematic is finalized.

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

- R4 WiFi PWM pin → Motor Controller PWM input: animated dashed line (dash flows in data direction)
- R4 WiFi DIR pins → Motor Controller DIR: static lines
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
| Served from | Developer's local machine (VS Code Live Server / `npx serve` / Python http.server) | Board has no filesystem; client-hosted approach avoids 256 KB flash constraint |
| UI framework | Vanilla JS + SVG | Minimal payload, no npm bundle step |
| WebSocket client | Native `WebSocket` API | No dependencies |
| Styling | CSS custom properties | Theming, component state via CSS classes |
| Charts | Canvas 2D API (custom) | Lightweight, no library overhead |
| CORS | All board HTTP responses include `Access-Control-Allow-Origin: *` | Required for cross-origin browser→board requests from localhost |

> **Note:** Web UI files live in `data/` in the repo. They are **never** uploaded to the board.

---

## 8. Acceptance Criteria

> \u26a0\ufe0f Criteria marked [x] were verified on the ESP32 build. The Web UI files (`data/`) work as-is. The board-side WebSocket/HTTP must be re-verified on R4 after Phase 6 (M6.4\u2013M6.7).

- [x] All three component boxes visible on 1024\u00d7768 and mobile portrait *(UI verified on ESP32)*
- [x] GPIO states update within 200 ms of pin change *(verified on ESP32)*
- [x] Basket SVG animation speed proportional to current RPM *(verified on ESP32)*
- [x] RPM gauge arc updates at \u2265 10 Hz *(replaced by large numerical RPM display + sparkline)*
- [x] CRITICAL error triggers red full-screen overlay within 500 ms *(verified on ESP32)*
- [ ] Web UI served from local dev server (no files on board) \u2013 **architecture change; not yet tested with R4**
- [ ] WebSocket reconnect is automatic and transparent (< 3 s) \u2013 **must re-verify on R4 (M6.5)**
- [x] E-STOP button always interactive (not disabled by any state) *(verified on ESP32)*
- [ ] *(optional)* PAUSE / RESUME buttons in control bar (M3.8)
- [ ] *(optional)* WARNING (yellow banner) and ERROR (orange banner) overlays differentiated from CRITICAL (M3.9)
- [ ] *(optional)* Parameters panel: sliders for max\_rpm, accel, decel, dir\_pause with live WS `set_param` dispatch (M3.10)

---

## 9. Implementation Notes (v1.3.0)

- UI split into three files in `data/`: `index.html` (structure), `style.css` (theme + layout), `app.js` (WebSocket + render loop).
- `app.js` connects to `ws://<board-ip>/ws`, auto-reconnects every 2 s on close.
- Board IP is configured as a constant in `app.js` (or read from a URL param like `?ip=192.168.x.x`).
- Basket SVG uses `requestAnimationFrame`; angle advances by `rpm × dt / 60 000 × 360°` per frame.
- Sparkline uses Canvas 2D, 30 s rolling buffer at 500 ms resolution (60 samples).
- Fault injection panel is hidden when `state.sim === false`; buttons toggle `inject_fault` WS commands.
- `set_param` WS command is implemented in `web_api.cpp` (key/value dispatch + EEPROM save). UI panel pending.
