/**
 * wires.js — Wire path definitions + reactive helpers
 * ===================================================
 * Every <path> in the SVG schematic is defined here as data.
 * The SchematicCanvas component loops over these with v-for.
 *
 * Each wire object:
 *   id             — SVG element id (matches original HTML)
 *   path           — SVG path d attribute
 *   strokeWidth    — line thickness (preserved from original)
 *   defaultColor   — color when inactive / static
 *   activeColor    — (optional) color when wire-active class is applied
 *   activeWhen     — (optional) function(simState, uiLocked) → boolean
 *   alwaysAnimated — (optional) if true, wire-active is permanently on
 *
 * Static wires (no activeWhen, no alwaysAnimated):
 *   → class="wire", defaultColor, no dash animation
 *
 * Reactive wires (activeWhen set):
 *   → class="wire" + "wire-active" toggled, color swaps
 *
 * Always-animated wires (alwaysAnimated: true):
 *   → class="wire wire-active", defaultColor, dash always runs
 *
 * Coordinate reference (absolute SVG positions):
 *   Arduino D2: (235,106)  D3: (235,131)  D4: (235,336)  D5: (235,361)
 *   Relay INs:  R1 (480,168)  R2 (480,248)  R3 (480,328)  R4 (480,408)
 *   Relay NOs:  R1 (685,132)  R2 (685,212)  R3 (685,292)  R4 (685,372)
 *   Relay COMs: R1 (685,154)  R2 (685,234)  R3 (685,314)  R4 (685,394)
 *   WAGO contacts 1-7: (505,487) (540,487) (575,487) (610,487) (645,487) (680,487) (715,487)
 *   Driver X1:(905,132.5) X2:(905,187.5) X3:(905,242.5) IN-COM:(905,297.5)
 *          X0:(905,352.5) M1:(905,407.5) M2:(905,462.5) M0:(905,517.5)
 *   Switch contacts: 1:(910,590) 2:(1050,590)
 */

export const WIRE_DEFS = [
    // ── 5V Rail (VCC) — static ──────────────────────────────────────────
    {
        id: 'wire-vcc-1', path: 'M 35,96 L 15,96 L 15,20 L 250,20 L 250,120 L 475,120',
        strokeWidth: 1.5, defaultColor: '#EF4444'
    },
    {
        id: 'wire-vcc-2', path: 'M 250,120 L 250,340 L 475,340',
        strokeWidth: 1.5, defaultColor: '#EF4444'
    },

    // ── Ground Rail (GND) — static ─────────────────────────────────────
    {
        id: 'wire-gnd-1', path: 'M 35,126 L 10,126 L 10,10 L 265,10 L 265,145 L 475,145',
        strokeWidth: 1.5, defaultColor: '#4B5563'
    },
    {
        id: 'wire-gnd-2', path: 'M 265,145 L 265,365 L 475,365',
        strokeWidth: 1.5, defaultColor: '#4B5563'
    },
    {
        id: 'wire-gnd-3', path: 'M 265,365 L 265,510 L 75,510 L 75,495',
        strokeWidth: 1.5, defaultColor: '#4B5563'
    },
    {
        id: 'wire-gnd-4', path: 'M 75,495 L 75,510 L 15,510 L 15,700 L 55,700 L 55,665',
        strokeWidth: 1.5, defaultColor: '#4B5563'
    },

    // ── Arduino digital signal wires → Relay Bank IN pins ──────────────
    {
        id: 'wire-d2-r1', path: 'M 235,106 L 290,106 L 290,168 L 475,168',
        strokeWidth: 1.8, defaultColor: '#F59E0B'
    },
    {
        id: 'wire-d3-r2', path: 'M 235,131 L 300,131 L 300,248 L 475,248',
        strokeWidth: 1.8, defaultColor: '#3B82F6'
    },
    {
        id: 'wire-d4-r3', path: 'M 235,336 L 310,336 L 310,328 L 475,328',
        strokeWidth: 1.8, defaultColor: '#F59E0B'
    },
    {
        id: 'wire-d5-r4', path: 'M 235,361 L 320,361 L 320,408 L 475,408',
        strokeWidth: 1.8, defaultColor: '#F59E0B'
    },

    // ── Folientaster 1 → Arduino (unchanged) ───────────────────────────
    {
        id: 'wire-d6-left', path: 'M 230,166 L 315,166 L 315,530 L 120,530 L 120,495',
        strokeWidth: 1.5, defaultColor: '#A855F7'
    },
    {
        id: 'wire-d7-right', path: 'M 230,191 L 325,191 L 325,540 L 165,540 L 165,495',
        strokeWidth: 1.5, defaultColor: '#A855F7'
    },

    // ── Folientaster 2 → Arduino (unchanged) ───────────────────────────
    {
        id: 'wire-d8-red', path: 'M 230,226 L 335,226 L 335,710 L 95,710 L 95,665',
        strokeWidth: 1.5, defaultColor: '#EF4444'
    },
    {
        id: 'wire-d9-y1', path: 'M 230,251 L 345,251 L 345,720 L 135,720 L 135,665',
        strokeWidth: 1.5, defaultColor: '#F59E0B'
    },
    {
        id: 'wire-d10-y2', path: 'M 230,276 L 355,276 L 355,730 L 175,730 L 175,665',
        strokeWidth: 1.5, defaultColor: '#F59E0B'
    },
    {
        id: 'wire-d11-grn', path: 'M 230,301 L 365,301 L 365,740 L 215,740 L 215,665',
        strokeWidth: 1.5, defaultColor: '#10B981'
    },

    // ── Relay COM → WAGO bus ───────────────────────────────────────────
    {
        id: 'wire-rel1-com', path: 'M 685,154 L 750,154 L 750,487 L 510,487',
        strokeWidth: 2, defaultColor: '#F97316'
    },
    {
        id: 'wire-rel2-com', path: 'M 685,234 L 740,234 L 740,487 L 545,487',
        strokeWidth: 2, defaultColor: '#F97316'
    },
    {
        id: 'wire-rel3-com', path: 'M 685,314 L 720,314 L 720,487 L 685,487',
        strokeWidth: 2, defaultColor: '#F97316'
    },
    {
        id: 'wire-rel4-com', path: 'M 685,394 L 710,394 L 710,487 L 720,487',
        strokeWidth: 2, defaultColor: '#F97316'
    },
    {
        id: 'wire-switch-com', path: 'M 910,590 L 790,590 L 790,487 L 580,487',
        strokeWidth: 2, defaultColor: '#F97316'
    },

    // ── Driver IN-COM → WAGO bus ──────────────────────────────────────
    {
        id: 'wire-incom', path: 'M 905,297.5 L 815,297.5 L 815,487 L 615,487',
        strokeWidth: 2.5, defaultColor: '#10B981'
    },

    // ── X0 → IN-COM (Error bypass) — always animated ──────────────────
    {
        id: 'wire-x0-bypass', path: 'M 905,352.5 L 905,297.5',
        strokeWidth: 2, defaultColor: '#10B981', alwaysAnimated: true
    },

    // ── M0 → IN-COM (Hardwire GND) — static, always connected ─────────
    {
        id: 'wire-m0-gnd', path: 'M 895,517.5 L 895,297.5',
        strokeWidth: 2, defaultColor: '#4B5563', alwaysAnimated: false
    },

    // ── RELAY NO → DRIVER (reactive) ───────────────────────────────────
    {
        id: 'wire-x1', path: 'M 685,132 L 820,132 L 820,132.5 L 900,132.5',
        strokeWidth: 2.5, defaultColor: '#EF4444', activeColor: '#EF4444',
        activeWhen: function(simState, uiLocked) {
            return !uiLocked && ['ACCELERATING','RUNNING_CW','RUNNING_CCW'].indexOf(simState.id) !== -1;
        }
    },
    {
        id: 'wire-x2', path: 'M 1050,590 L 1050,620 L 830,620 L 830,187.5 L 900,187.5',
        strokeWidth: 2.5, defaultColor: '#10B981', activeColor: '#10B981',
        activeWhen: function(simState, uiLocked) { return !uiLocked; }
    },
    {
        id: 'wire-x3', path: 'M 685,212 L 780,212 L 780,242.5 L 900,242.5',
        strokeWidth: 2.5, defaultColor: '#3B82F6', activeColor: '#3B82F6',
        activeWhen: function(simState, uiLocked) { return !uiLocked && simState.dirRelayCCW; }
    },
    {
        id: 'wire-m1', path: 'M 685,292 L 770,292 L 770,407.5 L 900,407.5',
        strokeWidth: 2.5, defaultColor: '#F59E0B', activeColor: '#F59E0B',
        activeWhen: function(simState, uiLocked) { return !uiLocked && simState.m1RelayOn; }
    },
    {
        id: 'wire-m2', path: 'M 685,372 L 760,372 L 760,462.5 L 900,462.5',
        strokeWidth: 2.5, defaultColor: '#F59E0B', activeColor: '#F59E0B',
        activeWhen: function(simState, uiLocked) { return !uiLocked && simState.m2RelayOn; }
    }
];

/** Junction dots — small circles at wire branch points (static) */
export const JUNCTION_DOTS = [
    { cx: 250, cy: 120, r: 3.5, fill: '#EF4444' },
    { cx: 250, cy: 340, r: 3.5, fill: '#EF4444' },
    { cx: 265, cy: 145, r: 3.5, fill: '#4B5563' },
    { cx: 265, cy: 365, r: 3.5, fill: '#4B5563' },
    { cx: 905, cy: 297.5, r: 3.5, fill: '#10B981' },
    { cx: 905, cy: 352.5, r: 3.5, fill: '#10B981' },
    { cx: 895, cy: 297.5, r: 3.5, fill: '#4B5563' },
    { cx: 895, cy: 517.5, r: 3.5, fill: '#4B5563' }
];
