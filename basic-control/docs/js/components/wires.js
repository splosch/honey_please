/**
 * wires.js — Wire path definitions + reactive helpers
 * ===================================================
 * Every <path> in the SVG schematic is defined here as data.
 * The SchematicCanvas component loops over these with v-for.
 *
 * All pin positions come from per-component files in js/schematic/.
 * Routing waypoints are derived from component geometry via routing.js
 * so that moving a component origin automatically recalculates every
 * affected wire route.
 *
 * Each wire object:
 *   id             — SVG element id
 *   path           — SVG path d attribute
 *   strokeWidth    — line thickness
 *   defaultColor   — color when inactive / static
 *   activeColor    — (optional) color when wire-active class is applied
 *   activeWhen     — (optional) function(simState, uiLocked) → boolean
 *   alwaysAnimated — (optional) if true, wire-active is permanently on
 *
 *   Table-display fields (optional — if purpose is set, the wire
 *   generates a row in the WiringTable component):
 *     quelle    — human-readable source name
 *     quellePin — source pin identifier
 *     ziel      — human-readable destination (HTML ok)
 *     purpose   — description of what this connection does
 *     color     — Tailwind text color class for the quelle column
 *     muted     — if true, dim the row background
 */

import * as Arduino         from '../schematic/Arduino.js';
import * as RelayBank       from '../schematic/RelayBank.js';
import * as MotorDriver     from '../schematic/MotorDriver.js';
import * as KeypadDirection  from '../schematic/KeypadDirection.js';
import * as KeypadControl    from '../schematic/KeypadControl.js';
import * as WagoBus          from '../schematic/WagoBus.js';
import * as ManualSwitch     from '../schematic/ManualSwitch.js';
import { channelX, routeHorizontal } from '../schematic/routing.js';

import { A5V, AGND, D2, D3, D4, D5, D6, D7, D8, D9, D10, D11 } from '../schematic/Arduino.js';
import { R1, R2, R3, R4, RLY_DCP, RLY_DCM } from '../schematic/RelayBank.js';
import { DRV_X1, DRV_X2, DRV_X3, DRV_X0, DRV_M1, DRV_M2, DRV_M0, DRV_INCOM } from '../schematic/MotorDriver.js';
import { FT1_GND, FT1_L, FT1_R } from '../schematic/KeypadDirection.js';
import { FT2_GND, FT2_ROT, FT2_Y1, FT2_Y2, FT2_GRN } from '../schematic/KeypadControl.js';
import { W1, W2, W3, W4, W5, W6 } from '../schematic/WagoBus.js';
import { SW1, SW2 } from '../schematic/ManualSwitch.js';

// ── Page-layout constants derived from component positions ──────────
var LEFT_BUS   = Arduino.origin.x - 15;      // left-side GND/VCC bus
var RAIL_VCC_Y = Arduino.origin.y - 15;      // top VCC rail
var RAIL_GND_Y = Arduino.origin.y - 30;      // top GND rail

// ── Routing column helpers ───────────────────────────────────────────
// Evenly-spaced columns between two component edges
var colAR = function(n) { return channelX(Arduino, RelayBank, n, 10); };     // 10 Arduino right-side routes
var colRD = function(n) { return channelX(RelayBank, MotorDriver, n, 8); };  // 8 right-side routes

// Keypad entry Y — route below the keypad body, then come up to the pins
var ft1Below = function(n) { return KeypadDirection.origin.y + KeypadDirection.bounds.height + 15 + n * 10; };
var ft2Below = function(n) { return KeypadControl.origin.y + KeypadControl.bounds.height + 25 + n * 10; };

// Bottom edge of the manual switch (for wire-x2 routing)
var switchBottom = ManualSwitch.origin.y + ManualSwitch.bounds.height;

export var WIRE_DEFS = [

    // ── 5V Rail (VCC) — static ───────────────────────────────────────
    {
        id: 'wire-vcc-1',
        path: `M ${A5V.absX},${A5V.absY} L ${LEFT_BUS},${A5V.absY} L ${LEFT_BUS},${RAIL_VCC_Y} L ${RLY_DCP.absX},${RAIL_VCC_Y} L ${RLY_DCP.absX},${RLY_DCP.absY}`,
        strokeWidth: 1.5, defaultColor: '#EF4444'
    },

    // ── Ground Rail (GND) — static, clean left-side routing ──────────
    {
        id: 'wire-gnd-1',
        path: `M ${AGND.absX},${AGND.absY} L ${LEFT_BUS},${AGND.absY} L ${LEFT_BUS},${RAIL_GND_Y} L ${RLY_DCM.absX},${RAIL_GND_Y} L ${RLY_DCM.absX},${RLY_DCM.absY}`,
        strokeWidth: 1.5, defaultColor: '#4B5563'
    },
    {
        id: 'wire-gnd-2',
        path: `M ${LEFT_BUS},${AGND.absY} L ${LEFT_BUS},${FT1_GND.absY} L ${FT1_GND.absX},${FT1_GND.absY}`,
        strokeWidth: 1.5, defaultColor: '#4B5563',
        quelle: 'Folientaster 1 (Richtung)',
        quellePin: 'Pin 1 (Masse)',
        ziel: 'Arduino <strong class="text-gray-300">GND</strong> (Masserückleitung)',
        purpose: 'Gemeinsame Masse für den Richtungsschalter',
        color: 'text-purple-400'
    },
    {
        id: 'wire-gnd-3',
        path: `M ${LEFT_BUS},${FT1_GND.absY} L ${LEFT_BUS},${FT2_GND.absY} L ${FT2_GND.absX},${FT2_GND.absY}`,
        strokeWidth: 1.5, defaultColor: '#4B5563',
        quelle: 'Folientaster 2 (Steuerung)',
        quellePin: 'Pin 1 (Masse)',
        ziel: 'Folientaster 1 <strong class="text-gray-300">GND Pin 1</strong>',
        purpose: 'Masseweiterleitung (Daisy-Chain)',
        color: 'text-emerald-400',
        muted: true
    },

    // ── Arduino digital signal wires → Relay Bank IN pins ────────────
    {
        id: 'wire-d2-r1',
        path: routeHorizontal(D2, R1.in, colAR(1)),
        strokeWidth: 1.8, defaultColor: '#F59E0B'
    },
    {
        id: 'wire-d3-r2',
        path: routeHorizontal(D3, R2.in, colAR(2)),
        strokeWidth: 1.8, defaultColor: '#3B82F6'
    },
    {
        id: 'wire-d4-r3',
        path: routeHorizontal(D4, R3.in, colAR(3)),
        strokeWidth: 1.8, defaultColor: '#F59E0B',
        quelle: 'Arduino D4 (Relais M1)',
        quellePin: 'D4',
        ziel: '4-Kanal Relais-Bank <strong class="text-amber-300">Kanal 3 IN</strong> → Treiber <strong class="text-amber-300">M1</strong>',
        purpose: 'Speed Bit 0 – selektiert dAtA-Preset (mit M2): LOW/LOW=dAtA0(750), LOW/HIGH=dAtA4(2500)',
        color: 'text-amber-400'
    },
    {
        id: 'wire-d5-r4',
        path: routeHorizontal(D5, R4.in, colAR(4)),
        strokeWidth: 1.8, defaultColor: '#F59E0B',
        quelle: 'Arduino D5 (Relais M2)',
        quellePin: 'D5',
        ziel: '4-Kanal Relais-Bank <strong class="text-amber-300">Kanal 4 IN</strong> → Treiber <strong class="text-amber-300">M2</strong>',
        purpose: 'Speed Bit 1 – HIGH bei Preset 2 (Gelb-2 / dAtA 4 / 2500 r/min)',
        color: 'text-amber-400'
    },

    // ── Keypad Direction (FT1) → Arduino ─────────────────────────────
    {
        id: 'wire-d6-left',
        path: `M ${D6.absX},${D6.absY} L ${colAR(5)},${D6.absY} L ${colAR(5)},${ft1Below(0)} L ${FT1_L.absX},${ft1Below(0)} L ${FT1_L.absX},${FT1_L.absY}`,
        strokeWidth: 1.5, defaultColor: '#A855F7',
        quelle: 'Folientaster 1 (Links)',
        quellePin: 'Pin 2',
        ziel: 'Arduino <strong class="text-purple-300">D6</strong>',
        purpose: 'Standby: Linkslauf (CCW) vorwählen · Im Betrieb (CW): Richtungswechsel → Bremsrampe → Auto-Neustart CCW',
        color: 'text-purple-400'
    },
    {
        id: 'wire-d7-right',
        path: `M ${D7.absX},${D7.absY} L ${colAR(6)},${D7.absY} L ${colAR(6)},${ft1Below(1)} L ${FT1_R.absX},${ft1Below(1)} L ${FT1_R.absX},${FT1_R.absY}`,
        strokeWidth: 1.5, defaultColor: '#A855F7',
        quelle: 'Folientaster 1 (Rechts)',
        quellePin: 'Pin 3',
        ziel: 'Arduino <strong class="text-purple-300">D7</strong>',
        purpose: 'Standby: Rechtslauf (CW) vorwählen · Im Betrieb (CCW): Richtungswechsel → Bremsrampe → Auto-Neustart CW',
        color: 'text-purple-400'
    },

    // ── Keypad Control (FT2) → Arduino ───────────────────────────────
    {
        id: 'wire-d8-red',
        path: `M ${D8.absX},${D8.absY} L ${colAR(7)},${D8.absY} L ${colAR(7)},${ft2Below(0)} L ${FT2_ROT.absX},${ft2Below(0)} L ${FT2_ROT.absX},${FT2_ROT.absY}`,
        strokeWidth: 1.5, defaultColor: '#EF4444',
        quelle: 'Folientaster 2 (Rot)',
        quellePin: 'Pin 2',
        ziel: 'Arduino <strong class="text-emerald-300">D8</strong>',
        purpose: 'STOP – aktiv in ANLAUFEN &amp; LÄUFT: Bremsrampe (dAtA-proportional) → Standby',
        color: 'text-emerald-400',
        muted: true
    },
    {
        id: 'wire-d9-y1',
        path: `M ${D9.absX},${D9.absY} L ${colAR(8)},${D9.absY} L ${colAR(8)},${ft2Below(1)} L ${FT2_Y1.absX},${ft2Below(1)} L ${FT2_Y1.absX},${FT2_Y1.absY}`,
        strokeWidth: 1.5, defaultColor: '#F59E0B',
        quelle: 'Folientaster 2 (Gelb 1)',
        quellePin: 'Pin 3',
        ziel: 'Arduino <strong class="text-emerald-300">D9</strong>',
        purpose: 'Programmtaster 1 / Geschwindigkeit 1',
        color: 'text-emerald-400',
        muted: true
    },
    {
        id: 'wire-d10-y2',
        path: `M ${D10.absX},${D10.absY} L ${colAR(9)},${D10.absY} L ${colAR(9)},${ft2Below(2)} L ${FT2_Y2.absX},${ft2Below(2)} L ${FT2_Y2.absX},${FT2_Y2.absY}`,
        strokeWidth: 1.5, defaultColor: '#F59E0B',
        quelle: 'Folientaster 2 (Gelb 2)',
        quellePin: 'Pin 4',
        ziel: 'Arduino <strong class="text-emerald-300">D10</strong>',
        purpose: 'Programmtaster 2 / Geschwindigkeit 2',
        color: 'text-emerald-400',
        muted: true
    },
    {
        id: 'wire-d11-grn',
        path: `M ${D11.absX},${D11.absY} L ${colAR(10)},${D11.absY} L ${colAR(10)},${ft2Below(3)} L ${FT2_GRN.absX},${ft2Below(3)} L ${FT2_GRN.absX},${FT2_GRN.absY}`,
        strokeWidth: 1.5, defaultColor: '#10B981',
        quelle: 'Folientaster 2 (Grün)',
        quellePin: 'Pin 5',
        ziel: 'Arduino <strong class="text-emerald-300">D11</strong>',
        purpose: 'START – nur in STANDBY: REL1 (X1) AN → Anlauframpe (dAtA-proportional) → LÄUFT',
        color: 'text-emerald-400',
        muted: true
    },

    // ── Relay COM → WAGO bus ─────────────────────────────────────────
    {
        id: 'wire-rel1-com',
        path: routeHorizontal(R1.com, W1, colRD(4)),
        strokeWidth: 2, defaultColor: '#F97316'
    },
    {
        id: 'wire-rel2-com',
        path: routeHorizontal(R2.com, W2, colRD(3)),
        strokeWidth: 2, defaultColor: '#F97316'
    },
    {
        id: 'wire-rel3-com',
        path: routeHorizontal(R3.com, W3, colRD(2)),
        strokeWidth: 2, defaultColor: '#F97316'
    },
    {
        id: 'wire-rel4-com',
        path: routeHorizontal(R4.com, W4, colRD(1)),
        strokeWidth: 2, defaultColor: '#F97316'
    },
    {
        id: 'wire-switch-com',
        path: routeHorizontal(SW1, W6, colRD(4)),
        strokeWidth: 2, defaultColor: '#F97316'
    },

    // ── Driver IN-COM → WAGO bus ─────────────────────────────────────
    {
        id: 'wire-incom',
        path: routeHorizontal(DRV_INCOM, W5, colRD(5)),
        strokeWidth: 2.5, defaultColor: '#10B981'
    },

    // ── X0 → IN-COM (Error bypass) — always animated ─────────────────
    {
        id: 'wire-x0-bypass',
        path: `M ${DRV_X0.absX},${DRV_X0.absY} L ${DRV_INCOM.absX},${DRV_INCOM.absY}`,
        strokeWidth: 2, defaultColor: '#10B981', alwaysAnimated: true
    },

    // ── M0 → IN-COM (Hardwire GND) — static, always connected ────────
    {
        id: 'wire-m0-gnd',
        path: `M ${DRV_M0.absX},${DRV_M0.absY} L ${DRV_INCOM.absX},${DRV_INCOM.absY}`,
        strokeWidth: 2, defaultColor: '#4B5563', alwaysAnimated: false,
        quelle: 'Treiber M0 (Hardwire)',
        quellePin: 'M0',
        ziel: 'Treiber <strong class="text-gray-300">IN-COM</strong> (GND)',
        purpose: 'Fest auf GND verdrahtet (LOW) – Binär-Adressierung: M0=0, M1/M2 variabel',
        color: 'text-gray-400',
        muted: true
    },

    // ── RELAY NO → DRIVER (reactive) ─────────────────────────────────
    {
        id: 'wire-x1',
        path: routeHorizontal(R1.no, DRV_X1, colRD(6)),
        strokeWidth: 2.5, defaultColor: '#EF4444', activeColor: '#EF4444',
        activeWhen: function(simState, uiLocked) {
            return !uiLocked && ['ACCELERATING','RUNNING_CW','RUNNING_CCW'].indexOf(simState.id) !== -1;
        }
    },
    {
        id: 'wire-x2',
        path: `M ${SW2.absX},${SW2.absY} L ${SW2.absX},${switchBottom} L ${colRD(7)},${switchBottom} L ${colRD(7)},${DRV_X2.absY} L ${DRV_X2.absX},${DRV_X2.absY}`,
        strokeWidth: 2.5, defaultColor: '#10B981', activeColor: '#10B981',
        activeWhen: function(simState, uiLocked) { return !uiLocked; }
    },
    {
        id: 'wire-x3',
        path: routeHorizontal(R2.no, DRV_X3, colRD(3)),
        strokeWidth: 2.5, defaultColor: '#3B82F6', activeColor: '#3B82F6',
        activeWhen: function(simState, uiLocked) { return !uiLocked && simState.dirRelayCCW; }
    },
    {
        id: 'wire-m1',
        path: routeHorizontal(R3.no, DRV_M1, colRD(2)),
        strokeWidth: 2.5, defaultColor: '#F59E0B', activeColor: '#F59E0B',
        activeWhen: function(simState, uiLocked) { return !uiLocked && simState.m1RelayOn; }
    },
    {
        id: 'wire-m2',
        path: routeHorizontal(R4.no, DRV_M2, colRD(1)),
        strokeWidth: 2.5, defaultColor: '#F59E0B', activeColor: '#F59E0B',
        activeWhen: function(simState, uiLocked) { return !uiLocked && simState.m2RelayOn; }
    }
];

/** Junction dots — small circles at wire branch points (static) */
export var JUNCTION_DOTS = [
    { cx: RLY_DCP.absX, cy: RLY_DCP.absY, r: 3.5, fill: '#EF4444' },
    { cx: LEFT_BUS, cy: AGND.absY, r: 3.5, fill: '#4B5563' },
    { cx: RLY_DCM.absX, cy: RLY_DCM.absY, r: 3.5, fill: '#4B5563' },
    { cx: LEFT_BUS, cy: FT1_GND.absY, r: 3.5, fill: '#4B5563' },
    { cx: DRV_INCOM.absX, cy: DRV_INCOM.absY, r: 3.5, fill: '#10B981' },
    { cx: DRV_M0.absX, cy: DRV_M0.absY, r: 3.5, fill: '#4B5563' },
    { cx: DRV_X0.absX, cy: DRV_X0.absY, r: 3.5, fill: '#10B981' }
];
