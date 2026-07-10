/**
 * KeypadControl.js — Folientaster 2 (Steuerung / Control keypad)
 * Origin, pins, and iterable arrays for the SVG schematic.
 */
const origin = { x: 30, y: 560 };
const bounds = { width: 210, height: 120 };

const PIN_GROUP_X = 25;
const PIN_GROUP_Y = 105;

const pins = {
    ft2Gnd: {
        relX: 0, relY: 0,
        absX: origin.x + PIN_GROUP_X,
        absY: origin.y + PIN_GROUP_Y,
        label: 'GND', color: '#4B5563'
    },
    ft2Rot: {
        relX: 40, relY: 0,
        absX: origin.x + PIN_GROUP_X + 40,
        absY: origin.y + PIN_GROUP_Y,
        label: 'R', color: '#EF4444'
    },
    ft2Yel1: {
        relX: 80, relY: 0,
        absX: origin.x + PIN_GROUP_X + 80,
        absY: origin.y + PIN_GROUP_Y,
        label: 'Y1', color: '#F59E0B'
    },
    ft2Yel2: {
        relX: 120, relY: 0,
        absX: origin.x + PIN_GROUP_X + 120,
        absY: origin.y + PIN_GROUP_Y,
        label: 'Y2', color: '#F59E0B'
    },
    ft2Grn: {
        relX: 160, relY: 0,
        absX: origin.x + PIN_GROUP_X + 160,
        absY: origin.y + PIN_GROUP_Y,
        label: 'G', color: '#10B981'
    },
};

export { origin, bounds, pins };

export const FT2_GND = pins.ft2Gnd;
export const FT2_ROT = pins.ft2Rot;
export const FT2_Y1  = pins.ft2Yel1;
export const FT2_Y2  = pins.ft2Yel2;
export const FT2_GRN = pins.ft2Grn;

export const CONTACT_PINS = [
    { id: 'gnd',  cx: 0,   label: 'GND', color: '#4B5563', textColor: '#9CA3AF' },
    { id: 'rot',  cx: 40,  label: 'R',   color: '#EF4444', textColor: '#EF4444' },
    { id: 'yel1', cx: 80,  label: 'Y1',  color: '#F59E0B', textColor: '#F59E0B' },
    { id: 'yel2', cx: 120, label: 'Y2',  color: '#F59E0B', textColor: '#F59E0B' },
    { id: 'grn',  cx: 160, label: 'G',   color: '#10B981', textColor: '#10B981' }
];

// ── Vue component definition ──────────────────────────────────────────
export const component = {
    template: `
      <g :transform="groupTransform">
        <rect width="210" height="120" rx="6" fill="#111827" fill-opacity="0.35" stroke="#10B981" stroke-width="2"></rect>
        <text x="105" y="20" fill="#10B981" font-weight="bold" font-size="10" text-anchor="middle">FOLIEN-PROG-TASTER (5 PIN)</text>
        <circle cx="35" cy="52" r="11" fill="#EF4444"></circle><text x="35" y="55" fill="#FFF" font-size="7" font-weight="bold" text-anchor="middle">ROT</text>
        <circle cx="80" cy="52" r="11" fill="#F59E0B"></circle><text x="80" y="55" fill="#FFF" font-size="7" font-weight="bold" text-anchor="middle">Y1</text>
        <circle cx="125" cy="52" r="11" fill="#F59E0B"></circle><text x="125" y="55" fill="#FFF" font-size="7" font-weight="bold" text-anchor="middle">Y2</text>
        <circle cx="170" cy="52" r="11" fill="#10B981"></circle><text x="170" y="55" fill="#FFF" font-size="7" font-weight="bold" text-anchor="middle">GRN</text>
        <g transform="translate(25, 105)">
          <template v-for="pin in contactPins" :key="pin.id">
            <circle :id="'pin-f2-' + pin.id" :cx="pin.cx" cy="0" r="4.5" :fill="pin.color" stroke="#FFF" stroke-width="0.75"></circle>
            <text :x="pin.cx" y="-10" :fill="pin.textColor" font-size="8" text-anchor="middle">{{ pin.label }}</text>
          </template>
        </g>
      </g>`,
    props: {
        origin:      { type: Object, required: true },
        contactPins: { type: Array, required: true }
    },
    computed: {
        groupTransform: function() {
            return `translate(${this.origin.x}, ${this.origin.y})`;
        }
    }
};
