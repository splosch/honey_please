# Hardware – Domain Overview

**Parent:** [ARCHITECTURE.md](../../ARCHITECTURE.md)

This folder covers all physical hardware aspects of the honey_please project: board pinout, motor driver wiring, and the honey extractor control panel.

---

## Contents

| Document | Description |
|---|---|
| [motor-driver.md](./motor-driver.md) | Oriental Motor BLF — 3-wire relay logic, input electrical specs, 3-wire mode, SPEED-OUT (Y0), speed control |
| [HM-5073-4E.pdf](./HM-5073-4E.pdf) | **Oriental Motor BLF Series Operating Manual (HM-5073-4)** — official datasheet: I/O terminal wiring, input specs, 2-wire/3-wire modes, SPEED-OUT, speed adjustment |

> **Pin assignments** live in `platformio.ini` (comment block near top). That is the single source of truth for `PIN_*` numbers.

## Interactive Reference

- [Wiring Schematic (interactive HTML)](../ErsteInbetriebnahmeMotorundSteuerung.html) — animated state machine diagram with relay layout, membrane keypad, and motor driver terminal mapping

---

## Key Constraints

> Board specs (MCU, Flash, SRAM, pin assignments) are in `platformio.ini` header — that is the source of truth.

- **5 V GPIO:** Motor driver can be driven directly without level-shifter.
- **USB power budget:** 500 mA max from the 5 V pin. Motor driver must have its own power rail.
- **No OTA on renesas-ra PlatformIO:** Flash via USB COM port only (`npm run deploy`).
- **Internal ESP32-S3:** NOT wired externally. Used only as WiFi co-processor.

---

## Phase 5 Hardware Integration

All six prerequisite questions (Q1–Q6) must be answered before writing `RealMotorDriver` or `RealRpmSource`. See [FEATURE-OVERVIEW.md – Phase 5](../FEATURE-OVERVIEW.md) for the full blocker list.
