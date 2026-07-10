/**
 * WagoBus.js — WAGO C0-Bus (7-contact terminal block)
 * Origin, contacts, and iterable arrays for the SVG schematic.
 */
const origin = { x: 470, y: 445 };
const bounds = { width: 260, height: 100 };

const CONTACT_GROUP_X = 15;
const CONTACT_GROUP_Y = 52;
const CONTACT_CY = 15;
const CONTACT_SPACING = 35;
const CONTACT_FIRST_X = 20;

function contact(index) {
    return {
        absX: origin.x + CONTACT_GROUP_X + CONTACT_FIRST_X + index * CONTACT_SPACING,
        absY: origin.y + CONTACT_GROUP_Y + CONTACT_CY
    };
}

const pins = {
    wago1: contact(0),
    wago2: contact(1),
    wago3: contact(2),
    wago4: contact(3),
    wago5: contact(4),
    wago6: contact(5),
    wago7: contact(6),
};

export { origin, bounds, pins };

export const W1 = pins.wago1;
export const W2 = pins.wago2;
export const W3 = pins.wago3;
export const W4 = pins.wago4;
export const W5 = pins.wago5;
export const W6 = pins.wago6;
export const W7 = pins.wago7;

export const CONTACTS = [
    pins.wago1, pins.wago2, pins.wago3, pins.wago4,
    pins.wago5, pins.wago6, pins.wago7
];

// ── Vue component definition ──────────────────────────────────────────
export const component = {
    template: `
      <g :transform="groupTransform">
        <rect width="260" height="100" rx="6" fill="#F97316" fill-opacity="0.35" stroke="#C2410C" stroke-width="2"></rect>
        <text x="130" y="24" fill="#FFF" font-weight="bold" font-size="11" text-anchor="middle">C0-BUS (WAGO 7-fach)</text>
        <g transform="translate(15, 52)">
          <circle v-for="(ct, idx) in contacts" :key="'wago-' + (idx + 1)"
            :id="'wago-contact-' + (idx + 1)"
            :cx="20 + idx * 35" cy="15" r="7"
            fill="#4B5563" stroke="#FFF" stroke-width="1.2"></circle>
        </g>
      </g>`,
    props: {
        origin:   { type: Object, required: true },
        contacts: { type: Array, required: true }
    },
    computed: {
        groupTransform: function() {
            return `translate(${this.origin.x}, ${this.origin.y})`;
        }
    }
};
