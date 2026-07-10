/**
 * pinLayout.js — Re-export barrel (Phase 1: backwards-compatible)
 * =================================================================
 * After the Phase 1 component extraction, this file re-exports the
 * same public API from the per-component files in js/schematic/.
 *
 * New code should import directly from js/schematic/<Component>.js.
 * This barrel exists so that consumers with existing imports continue
 * to work unchanged.
 */
import * as Ard   from '../schematic/Arduino.js';
import * as Rel   from '../schematic/RelayBank.js';
import * as Drv   from '../schematic/MotorDriver.js';
import * as FT1   from '../schematic/KeypadDirection.js';
import * as FT2   from '../schematic/KeypadControl.js';
import * as Wago  from '../schematic/WagoBus.js';
import * as Sw    from '../schematic/ManualSwitch.js';

// ── ORIGIN (combined from all components) ──────────────────────────
export const ORIGIN = {
    ARDUINO:      Ard.origin,
    RELAIS_BANK:  Rel.origin,
    DRIVER:       Drv.origin,
    FT1:          FT1.origin,
    FT2:          FT2.origin,
    WAGO:         Wago.origin,
    SWITCH:       Sw.origin
};

// ── PINS (combined flat registry) ──────────────────────────────────
export const PINS = {
    ...Ard.pins,
    ...Rel.pins,
    ...Drv.pins,
    ...FT1.pins,
    ...FT2.pins,
    ...Wago.pins,
    ...Sw.pins
};

// ── Arduino convenience aliases ────────────────────────────────────
export { A5V, AGND, D2, D3, D4, D5, D6, D7, D8, D9, D10, D11 } from '../schematic/Arduino.js';

// ── Relay convenience aliases ──────────────────────────────────────
export { R1, R2, R3, R4, RLY_DCP, RLY_DCM } from '../schematic/RelayBank.js';

// ── Driver convenience aliases ─────────────────────────────────────
export { DRV_X1, DRV_X2, DRV_X3, DRV_X0, DRV_M1, DRV_M2, DRV_M0, DRV_INCOM } from '../schematic/MotorDriver.js';

// ── Keypad convenience aliases ─────────────────────────────────────
export { FT1_GND, FT1_L, FT1_R } from '../schematic/KeypadDirection.js';
export { FT2_GND, FT2_ROT, FT2_Y1, FT2_Y2, FT2_GRN } from '../schematic/KeypadControl.js';

// ── WAGO convenience aliases ───────────────────────────────────────
export { W1, W2, W3, W4, W5, W6, W7 } from '../schematic/WagoBus.js';

// ── Switch convenience aliases ─────────────────────────────────────
export { SW1, SW2 } from '../schematic/ManualSwitch.js';

// ── Iterable arrays (renamed to keep old public names) ─────────────
export { RIGHT_PINS as ARDUINO_RIGHT_PINS, LEFT_PINS as ARDUINO_LEFT_PINS } from '../schematic/Arduino.js';
export { CHANNELS as RELAY_CHANNELS, POWER_PINS as RELAY_POWER_PINS } from '../schematic/RelayBank.js';
export { PORTS as DRIVER_PORTS } from '../schematic/MotorDriver.js';
export { CONTACT_PINS as FT1_CONTACT_PINS } from '../schematic/KeypadDirection.js';
export { CONTACT_PINS as FT2_CONTACT_PINS } from '../schematic/KeypadControl.js';
export { CONTACTS as WAGO_CONTACTS } from '../schematic/WagoBus.js';
export { CONTACTS as SWITCH_CONTACTS } from '../schematic/ManualSwitch.js';
