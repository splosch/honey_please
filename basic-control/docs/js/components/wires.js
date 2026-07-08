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
 */

export const WIRE_DEFS = [
    // ── 5V Rail (VCC) — static ──────────────────────────────────────────
    {
        id: 'wire-vcc-1', path: 'M 35,96 L 15,96 L 15,20 L 250,20 L 250,120 L 485,120',
        strokeWidth: 1.5, defaultColor: '#EF4444'
    },
    {
        id: 'wire-vcc-2', path: 'M 250,120 L 250,340 L 485,340',
        strokeWidth: 1.5, defaultColor: '#EF4444'
    },

    // ── Ground Rail (GND) — static ─────────────────────────────────────
    {
        id: 'wire-gnd-1', path: 'M 35,126 L 10,126 L 10,10 L 265,10 L 265,145 L 485,145',
        strokeWidth: 1.5, defaultColor: '#4B5563'
    },
    {
        id: 'wire-gnd-2', path: 'M 265,145 L 265,365 L 485,365',
        strokeWidth: 1.5, defaultColor: '#4B5563'
    },
    {
        id: 'wire-gnd-3', path: 'M 265,365 L 265,520 L 75,520 L 75,495',
        strokeWidth: 1.5, defaultColor: '#4B5563'
    },
    {
        id: 'wire-gnd-4', path: 'M 75,495 L 75,520 L 15,520 L 15,700 L 55,700 L 55,665',
        strokeWidth: 1.5, defaultColor: '#4B5563'
    },

    // ── Arduino digital signal wires — static ──────────────────────────
    {
        id: 'wire-d2-r1', path: 'M 230,106 L 285,106 L 285,170 L 485,170',
        strokeWidth: 1.8, defaultColor: '#F59E0B'
    },
    {
        id: 'wire-d3-r2', path: 'M 230,131 L 295,131 L 295,390 L 485,390',
        strokeWidth: 1.8, defaultColor: '#3B82F6'
    },

    // ── Folientaster 1 → Arduino ───────────────────────────────────────
    {
        id: 'wire-d6-left', path: 'M 230,166 L 315,166 L 315,530 L 120,530 L 120,495',
        strokeWidth: 1.5, defaultColor: '#A855F7'
    },
    {
        id: 'wire-d7-right', path: 'M 230,191 L 325,191 L 325,540 L 165,540 L 165,495',
        strokeWidth: 1.5, defaultColor: '#A855F7'
    },

    // ── Folientaster 2 → Arduino ───────────────────────────────────────
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

    // ── Relay COM → WAGO ───────────────────────────────────────────────
    {
        id: 'wire-rel1-com', path: 'M 707.5,130 L 760,130 L 760,590 L 520,590 L 520,547',
        strokeWidth: 2, defaultColor: '#F97316'
    },
    {
        id: 'wire-rel2-com', path: 'M 707.5,350 L 750,350 L 750,600 L 560,600 L 560,547',
        strokeWidth: 2, defaultColor: '#F97316'
    },
    {
        id: 'wire-switch-com', path: 'M 910,530 L 800,530 L 800,610 L 600,610 L 600,547',
        strokeWidth: 2, defaultColor: '#F97316'
    },

    // ── Driver IN-COM → WAGO ──────────────────────────────────────────
    {
        id: 'wire-incom', path: 'M 905,297.5 L 815,297.5 L 815,620 L 680,620 L 680,547',
        strokeWidth: 2.5, defaultColor: '#10B981'
    },

    // ── X0 → IN-COM (Error bypass) — always animated ──────────────────
    {
        id: 'wire-x0-bypass', path: 'M 905,352.5 L 905,297.5',
        strokeWidth: 2, defaultColor: '#10B981', alwaysAnimated: true
    },

    // ── RELAY OUTPUTS → DRIVER (reactive) ─────────────────────────────
    {
        id: 'wire-x1', path: 'M 707.5,100 L 825,100 L 825,132.5 L 890,132.5',
        strokeWidth: 2.5, defaultColor: '#EF4444', activeColor: '#EF4444',
        activeWhen: function(simState, uiLocked) {
            return !uiLocked && ['ACCELERATING','RUNNING_CW','RUNNING_CCW'].indexOf(simState.id) !== -1;
        }
    },
    {
        id: 'wire-x2', path: 'M 1050,530 L 1050,580 L 830,580 L 830,187.5 L 890,187.5',
        strokeWidth: 2.5, defaultColor: '#10B981', activeColor: '#10B981',
        activeWhen: function(simState, uiLocked) { return !uiLocked; }
    },
    {
        id: 'wire-x3', path: 'M 707.5,320 L 780,320 L 780,242.5 L 890,242.5',
        strokeWidth: 2.5, defaultColor: '#3B82F6', activeColor: '#3B82F6',
        activeWhen: function(simState, uiLocked) { return !uiLocked && simState.dirRelayCCW; }
    }
];

/** Junction dots — small circles at wire branch points (static) */
export const JUNCTION_DOTS = [
    { cx: 250, cy: 120, r: 3.5, fill: '#EF4444' },
    { cx: 265, cy: 145, r: 3.5, fill: '#4B5563' },
    { cx: 265, cy: 365, r: 3.5, fill: '#4B5563' },
    { cx: 905, cy: 297.5, r: 3.5, fill: '#10B981' },
    { cx: 905, cy: 352.5, r: 3.5, fill: '#10B981' }
];
