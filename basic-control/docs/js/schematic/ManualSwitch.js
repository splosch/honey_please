/**
 * ManualSwitch.js — Manueller Wippschalter X2 component
 * Origin, contacts, and iterable arrays for the SVG schematic.
 */
const origin = { x: 860, y: 540 };
const bounds = { width: 240, height: 80 };

const CONTACT1_CX = 50;
const CONTACT2_CX = 190;
const CONTACT_CY = 50;

const pins = {
    switchContact1: {
        absX: origin.x + CONTACT1_CX,
        absY: origin.y + CONTACT_CY
    },
    switchContact2: {
        absX: origin.x + CONTACT2_CX,
        absY: origin.y + CONTACT_CY
    }
};

export { origin, bounds, pins };

export const SW1 = pins.switchContact1;
export const SW2 = pins.switchContact2;

export const CONTACTS = [
    { id: '1', cx: 50,  cy: 50 },
    { id: '2', cx: 190, cy: 50 }
];

// ── Vue component definition ──────────────────────────────────────────
export const component = {
    template: `
      <g class="cursor-pointer" @click="$emit('toggle-lock')" :transform="groupTransform">
        <rect width="240" height="80" rx="6" fill="#111827" fill-opacity="0.35" stroke="#9CA3AF" stroke-width="2"></rect>
        <text x="120" y="22" fill="#9CA3AF" font-weight="bold" font-size="11" text-anchor="middle">MANUELLER WIPPSCHALTER (X2)</text>
        <circle v-for="ct in contacts" :key="ct.id" :id="'switch-contact-' + ct.id" :cx="ct.cx" :cy="ct.cy" r="8" fill="#374151" stroke="#FFF"></circle>
        <line x1="50" y1="50" :y2="leverY2" x2="190" :stroke="leverColor" stroke-width="3"></line>
        <text x="120" y="55" :fill="textColor" font-weight="bold" font-size="12" text-anchor="middle">{{ switchLabel }}</text>
      </g>`,
    props: {
        origin:   { type: Object, required: true },
        contacts: { type: Array, required: true },
        uiLocked: { type: Boolean, required: true }
    },
    emits: ['toggle-lock'],
    computed: {
        groupTransform: function() {
            return `translate(${this.origin.x}, ${this.origin.y})`;
        },
        leverY2: function() {
            return this.uiLocked ? '50' : '30';
        },
        leverColor: function() {
            return this.uiLocked ? '#EF4444' : '#10B981';
        },
        switchLabel: function() {
            return this.uiLocked ? 'AUS (Gesperrt)' : 'EIN (Freigegeben)';
        },
        textColor: function() {
            return this.uiLocked ? '#EF4444' : '#10B981';
        }
    }
};
