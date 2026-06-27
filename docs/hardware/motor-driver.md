# Motor Driver – Oriental Motor BLF

**Parent:** [Hardware README](./README.md) | [ARCHITECTURE.md](../../ARCHITECTURE.md)

> **Interactive reference:** [ErsteInbetriebnahmeMotorundSteuerung.html](../ErsteInbetriebnahmeMotorundSteuerung.html) — animated state machine with relay and driver terminal wiring. This is the authoritative wiring diagram; read it before touching the relay circuit.

**Operating Manual:** [HM-5073-4E.pdf](./HM-5073-4E.pdf) — I/O terminal wiring, input electrical specs, 2-wire/3-wire input modes, SPEED-OUT signal, speed adjustment wiring.

---

## Why 3-Wire Relay Logic?

The BLF driver uses **active-HIGH logic inputs** (X1, X2, X3) to control start, safety-lock, and direction. Instead of driving these directly with GPIO (which would tie the Arduino GND to the driver's signal common and expose it to motor noise), the design uses:

- **Two relay modules** (Relay 1 = start, Relay 2 = direction) for electrical isolation between Arduino logic and the driver's signal circuit.
- **A WAGO C0-bus** (5-way terminal) to tie all relay COM contacts and the X2 return path to the driver's `IN-COM` — keeping the switched-signal ground loop tight and separate from Arduino GND.
- **X2 via a manual Wippschalter** (not a relay) — this is the hardware safety lock. When the operator opens X2, the driver brakes immediately regardless of firmware state. Software cannot override it.

This means: **no Arduino firmware bug can prevent the brake**. X2 must be physically closed for the motor to run.

---

## Control Terminal Summary

| Driver Terminal | Function | Switched by |
|---|---|---|
| `X1` | START / STOP | Relay 1 (Arduino D2) |
| `X2` | RUN / BRAKE (safety lock) | Manual Wippschalter |
| `X3` | CW / CCW direction | Relay 2 (Arduino D3) |
| `IN-COM` | Signal return (GND) | WAGO C0-bus |

For the full state-to-pin mapping see `src/motor_driver.h` and the interactive diagram.

---

## Relay Module Configuration

Both relay modules use the **`H` (HIGH-level trigger) jumper**. The relay energises when the Arduino output is HIGH:

- **X1 active** (motor runs) = Arduino D2 HIGH = Relay 1 NO contact closed.
- **X3 active** (CW direction) = Arduino D3 HIGH = Relay 2 NO contact closed; CCW = LOW = NC contact (default).

If the relay module loses power or the Arduino resets, both relays de-energise → X1 goes LOW → motor stops. Fail-safe by default.

---

## Open Questions (Phase 5 blockers)

See [FEATURE-OVERVIEW.md – Phase 5](../FEATURE-OVERVIEW.md) for the full list. Hardware-specific blockers:

- **Q1:** Exact BLF driver model/part number — needed to confirm X1/X3 input voltage spec.
- **Q2:** Motor rated voltage and maximum current — needed for driver power stage selection.
- **Q5:** Does X1 require a maintained contact or a pulse? (Some BLF variants toggle on pulse.)

---

## Input Electrical Specifications (Manual Section 6.4)

The BLF driver control inputs (X1–X5) use **photocoupler isolation** with an internal +14 V supply and 3.3 kΩ series resistor per channel:

- Relay contact closure from input terminal to `IN-COM` turns the input ON (~4.2 mA LED current through the photocoupler).
- The relay contact never carries mains voltage — input voltage is fully internal to the driver.
- External signal range: 4.5–26.4 VDC, or a relay contact with no external supply needed.

This confirms the 3-wire relay design is electrically compatible.

---

## Input Mode — 3-Wire Mode Required

The BLF driver ships from the factory in **2-wire input mode**:
- 2-wire: X1 = CW (maintained ON = run), X2 = CCW (maintained ON = run)

The current hardware design (X1 = START/STOP, X2 = BRAKE, X3 = CW/CCW) matches **3-wire input mode**.

> ⚠️ **Action required before first run:** Set the driver to 3-wire mode via the digital operator: parameter `inMd` → `3wir`.

In 3-wire mode (Manual Section 9.10):

| Terminal | Function | Behavior |
|---|---|---|
| X1 | START / STOP | **Maintained** — ON = run, OFF = deceleration stop |
| X2 | RUN / BRAKE | **Maintained** — ON = run, OFF = instantaneous stop |
| X3 | CW / CCW | **Maintained** — ON = CW, OFF = CCW |

Q5 resolved: X1 requires a **maintained contact**, not a pulse. The relay design is correct.

---

## SPEED-OUT Signal (Y0) — Built-in RPM Source

From Manual Section 8.6: The driver outputs **30 pulses per motor-shaft revolution** on terminal Y0.

- Output type: open-collector transistor, 4.5–26.4 VDC, max 50 mA.
- A pull-up resistor to 5 V (1–10 kΩ) is required on the Arduino side.
- Wire Y0 to an Arduino interrupt-capable pin (D2 or D4).

> **No external Hall sensor or encoder is needed.** The built-in SPEED-OUT replaces the separate RPM sensor assumed in the Phase 5 blockers (Q3).

---

## Speed Control — No PWM from Arduino

The BLF driver does **not** accept a PWM signal from a microcontroller. Speed is set via:

1. **Internal potentiometer** (manual knob on the digital operator) — simplest option, no extra wiring.
2. **External analog voltage** on VH / VM / VL terminals (0–5 V range → 0 to rated speed).
3. **Digital operator** front-panel buttons.

For Arduino-controlled variable speed: route a filtered PWM output (RC low-pass) to the VM terminal. VH must be tied to 5 V (max-speed reference) and VL to GND.

> Q5 (formerly "PWM frequency for driver") is resolved: standard Arduino PWM through an RC filter on VM is the correct approach.

---

## Power Supply Notes (Q2 resolved)

The BLF unit is **AC mains-powered** — the driver has its own AC input terminal (L, N, GND). The Arduino supplies no motor power. Motor output power is 30–400 W depending on the model variant:

| Model suffix | AC input |
|---|---|
| A (e.g. BLFD120A2) | Single-phase 100–120 V |
| C | Single-phase 200–240 V |
| S | Three-phase 200–240 V |

Read the exact model number and voltage rating from the driver nameplate before connecting mains.
