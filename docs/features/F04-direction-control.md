# F04 – Direction Control

**Status:** Planning  
**Depends on:** [F01 – Motor Control Architecture](./F01-motor-control-architecture.md), [F03 – Acceleration/Deceleration Ramps](./F03-acceleration-deceleration-ramps.md)  
**Referenced by:** [Feature Overview](./FEATURE-OVERVIEW.md), [F09 – Multi-Step Program](./F09-multistep-program.md)

---

## 1. Goal

Allow the operator to run the Honigschleuder in both directions (CW / CCW). Direction changes must never occur while the motor is spinning – the system enforces a safe sequence: **decelerate → pause at 0 RPM → flip direction → accelerate**.

---

## 2. Directions

| Label | DIR_A pin | DIR_B pin | Basket rotation |
|---|---|---|---|
| CW (Clockwise / "Right") | HIGH | LOW | Right |
| CCW (Counter-clockwise / "Left") | LOW | HIGH | Left |
| COAST (unpowered) | LOW | LOW | Free-wheel |
| BRAKE (active stop) | HIGH | HIGH | Braking (driver-dependent) |

> ⚠️ Confirm CW/CCW polarity with physical test after first wiring.  
> Swap DIR_A / DIR_B in `motor_config.h` if rotation is inverted.

---

## 3. Direction Change Sequence

```
Operator requests direction change (RUNNING, dir = CW → CCW)
        │
        ▼
[1] State → RAMPING_DOWN
    Ramp current RPM → 0 using decel_rate
        │
        ▼ (RPM == 0)
[2] State → DIR_CHANGE_PAUSE
    Hold 0 RPM for dir_change_pause_ms (default 2000 ms)
    UI shows: "Direction changing... X ms"
        │
        ▼ (timer elapsed)
[3] Set GPIO: DIR_A = LOW, DIR_B = HIGH  (CW → CCW)
    State → RAMPING_UP
    Ramp 0 → previous_target_rpm using accel_rate
        │
        ▼ (target reached)
[4] State → RUNNING (new direction)
```

The pause duration is configurable (`dir_change_pause_ms` in F06).

---

## 4. Safety Interlock

Direction change is **rejected** if:

| Condition | Response |
|---|---|
| Current state is `FAULT_STOP` | Reject with `ERR_FAULT_ACTIVE` |
| RPM > 5 when GPIO flip is attempted | Re-enter RAMPING_DOWN (race condition guard) |
| EMERGENCY_STOP is active | Reject with `ERR_EMERGENCY_ACTIVE` |

The interlock is enforced in firmware, not just in the UI.

---

## 5. Manual Override

The operator can:
- Cancel a direction change in progress → RAMPING_DOWN toward 0 still completes but ramp-up is skipped → returns to IDLE.
- Request direction change while already in DIR_CHANGE_PAUSE → direction is updated (if not yet applied) and sequence continues seamlessly.

---

## 6. Web UI Representation

### Direction Indicator (on Motor component in schematic)

```
    ┌─────────────────────┐
    │    HONIGSCHLEUDER   │
    │                     │
    │    ↺  CCW / LEFT    │   ← animated rotation arrow, color = current direction
    │    45 RPM           │
    └─────────────────────┘
```

- Animated rotation arrow (CSS animation on basket SVG) follows actual rotation direction.
- Arrow color: Blue = CW, Purple = CCW.
- Arrow freezes + pulsates during DIR_CHANGE_PAUSE.

### Direction Change Progress

During the direction change sequence, the UI shows a three-step indicator:

```
  [DECELERATING ████████░░░░] → [PAUSE ••••] → [ACCELERATING ░░░░████████]
         Step 1                    Step 2               Step 3
```

Active step is highlighted, completed steps are dimmed.

### Direction Toggle Button

- Large toggle button: ◄ LEFT | RIGHT ►
- Disabled (greyed out) during FAULT_STOP or EMERGENCY_STOP states.
- During a direction change, the button shows the target direction and is non-interactive until sequence completes.

---

## 7. Multi-Step Program Integration

The multi-step program (F09) relies on this sequence for every direction transition in the sequence. Steps: L-Slow → R-Slow → L-Mid → R-Mid → L-Fast → R-Fast each involve a direction change.

The ramp controller (F03) handles the speed change; this module handles the GPIO flip at the safe moment.

---

## 8. Acceptance Criteria

- [ ] Direction GPIOs never flip while RPM > 5
- [ ] DIR_CHANGE_PAUSE enforced with configurable duration
- [ ] Direction change sequence visible step-by-step in Web UI
- [ ] Direction change can be cancelled by operator before GPIO flip
- [ ] Actual rotation direction confirmed via RPM sensor response after flip (if encoder)
- [ ] All direction events logged to session protocol with timestamp
