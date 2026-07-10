/**
 * KeypadDirection.js — Folientaster 1 (Richtung / Direction keypad)
 * Origin, pins, and iterable arrays for the SVG schematic.
 */
const origin = { x: 30, y: 400 };
const bounds = { width: 180, height: 110 };

const PIN_GROUP_X = 45;
const PIN_GROUP_Y = 95;

const pins = {
    ft1Gnd: {
        relX: 0, relY: 0,
        absX: origin.x + PIN_GROUP_X,
        absY: origin.y + PIN_GROUP_Y,
        label: 'GND', color: '#4B5563'
    },
    ft1Links: {
        relX: 45, relY: 0,
        absX: origin.x + PIN_GROUP_X + 45,
        absY: origin.y + PIN_GROUP_Y,
        label: 'LINKS', color: '#A855F7'
    },
    ft1Rechts: {
        relX: 90, relY: 0,
        absX: origin.x + PIN_GROUP_X + 90,
        absY: origin.y + PIN_GROUP_Y,
        label: 'RECHTS', color: '#A855F7'
    },
};

export { origin, bounds, pins };

export const FT1_GND = pins.ft1Gnd;
export const FT1_L   = pins.ft1Links;
export const FT1_R   = pins.ft1Rechts;

export const CONTACT_PINS = [
    { id: 'gnd',    cx: 0,  label: 'GND',    color: '#4B5563', textColor: '#9CA3AF' },
    { id: 'links',  cx: 45, label: 'LINKS',  color: '#A855F7', textColor: '#A855F7' },
    { id: 'rechts', cx: 90, label: 'RECHTS', color: '#A855F7', textColor: '#A855F7' }
];

// ── Vue component definition ──────────────────────────────────────────
export const component = {
    template: `
      <g :transform="groupTransform">
        <rect width="180" height="110" rx="6" fill="#111827" fill-opacity="0.35" stroke="#A855F7" stroke-width="2"></rect>
        <text x="90" y="20" fill="#A855F7" font-weight="bold" font-size="10" text-anchor="middle">FOLIEN-RICHTUNGSTASTER</text>
        <circle cx="45" cy="50" r="14" fill="#3B82F6" stroke="#93C5FD" stroke-width="1.2"></circle><text x="45" y="53" fill="#FFF" font-weight="bold" font-size="9" text-anchor="middle">◀</text>
        <circle cx="135" cy="50" r="14" fill="#3B82F6" stroke="#93C5FD" stroke-width="1.2"></circle><text x="135" y="53" fill="#FFF" font-weight="bold" font-size="9" text-anchor="middle">▶</text>
        <g transform="translate(45, 95)">
          <template v-for="pin in contactPins" :key="pin.id">
            <circle :id="'pin-f1-' + pin.id" :cx="pin.cx" cy="0" r="4.5" :fill="pin.color" stroke="#FFF" stroke-width="0.75"></circle>
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
