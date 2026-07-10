/**
 * RelayBank.js — 4-Channel Relay Bank component
 * Origin, channels, pin helpers, and iterable arrays for the SVG schematic.
 */
const origin = { x: 470, y: 40 };
const bounds = { width: 260, height: 380 };

const POWER_X = 5;
const POWER_Y = 45;
const CHANNEL_TOP = 78;
const CHANNEL_SPACING = 72;
const IN_CX = 10;
const IN_CY = 50;
const TERMINAL_X = 185;
const NO_CY = 14;
const COM_CY = 36;
const TERMINAL_CX = 30;

function powerPin(yOffset, label, color) {
    return {
        relX: POWER_X, relY: yOffset,
        absX: origin.x + POWER_X,
        absY: origin.y + POWER_Y + yOffset,
        label, color
    };
}

function channel(index) {
    var chY = CHANNEL_TOP + index * CHANNEL_SPACING;
    return {
        in: {
            absX: origin.x + IN_CX,
            absY: origin.y + chY + IN_CY
        },
        no: {
            absX: origin.x + TERMINAL_X + TERMINAL_CX,
            absY: origin.y + chY + NO_CY
        },
        com: {
            absX: origin.x + TERMINAL_X + TERMINAL_CX,
            absY: origin.y + chY + COM_CY
        }
    };
}

const pins = {
    relayDcPlus:  powerPin(5,  'DC+', '#EF4444'),
    relayDcMinus: powerPin(28, 'DC-', '#4B5563'),
    relayR1: channel(0),
    relayR2: channel(1),
    relayR3: channel(2),
    relayR4: channel(3),
};

export { origin, bounds, pins };

export const R1 = pins.relayR1;
export const R2 = pins.relayR2;
export const R3 = pins.relayR3;
export const R4 = pins.relayR4;

export const RLY_DCP = pins.relayDcPlus;
export const RLY_DCM = pins.relayDcMinus;

export const CHANNELS = [
    { id: 'r1', yOffset: 78,  label: 'K1: START/STOP (X1)',  color: '#F59E0B', pins: pins.relayR1 },
    { id: 'r2', yOffset: 150, label: 'K2: CW/CCW (X3)',      color: '#3B82F6', pins: pins.relayR2 },
    { id: 'r3', yOffset: 222, label: 'K3: M1 (Speed Bit 0)',  color: '#F59E0B', pins: pins.relayR3 },
    { id: 'r4', yOffset: 294, label: 'K4: M2 (Speed Bit 1)',  color: '#F59E0B', pins: pins.relayR4 }
];

export const POWER_PINS = [
    { id: 'vcc', label: 'DC+', color: '#EF4444', relY: 5 },
    { id: 'gnd', label: 'DC-', color: '#4B5563', relY: 28 }
];

// ── Vue component definition ──────────────────────────────────────────
export const component = {
    template: `
      <g :transform="groupTransform">
        <rect width="260" height="380" rx="8" fill="#1E293B" fill-opacity="0.35" stroke="#F97316" stroke-width="2.5"></rect>
        <text x="130" y="22" fill="#F97316" font-weight="bold" font-size="11" text-anchor="middle">4-KANAL RELAIS-BANK</text>
        <g transform="translate(5, 45)">
          <template v-for="pin in powerPins" :key="pin.id">
            <circle :id="'pin-rbank-' + pin.id" cx="5" :cy="pin.relY" r="4.5" :fill="pin.color" stroke="#FFF" stroke-width="0.75"></circle>
            <text x="18" :y="pin.relY + 3" :fill="pin.color" font-size="9" font-weight="bold">{{ pin.label }}</text>
          </template>
        </g>
        <g v-for="ch in channels" :key="ch.id" :transform="'translate(0, ' + ch.yOffset + ')'">
          <rect x="15" y="5" width="40" height="20" rx="3" fill="#111827"></rect>
          <rect x="29" y="8" width="12" height="14" fill="#EF4444" rx="1"></rect>
          <text x="35" y="18" fill="#FFF" font-size="7" font-weight="bold" text-anchor="middle">H</text>
          <text x="70" y="18" :fill="ch.color" font-size="9" font-weight="bold">{{ ch.label }}</text>
          <circle :id="'pin-' + ch.id + '-in'" cx="10" cy="50" r="4.5" :fill="ch.color" stroke="#FFF" stroke-width="0.75"></circle>
          <text x="23" y="53" :fill="ch.color" font-size="9" font-weight="bold">IN</text>
          <g transform="translate(185, 0)">
            <rect width="60" height="68" rx="4" fill="#0284C7"></rect>
            <circle :id="'pin-' + ch.id + '-no'" cx="30" cy="14" r="5" :fill="ch.color" stroke="#FFF" stroke-width="1"></circle>
            <text x="15" y="18" fill="#FFF" font-size="8" text-anchor="end">NO</text>
            <circle :id="'pin-' + ch.id + '-com'" cx="30" cy="36" r="5" fill="#F97316" stroke="#FFF" stroke-width="1"></circle>
            <text x="15" y="40" fill="#FFF" font-size="8" text-anchor="end">COM</text>
            <circle cx="30" cy="58" r="5" fill="#6B7280" stroke="#FFF" stroke-width="1"></circle>
            <text x="15" y="62" fill="#FFF" font-size="8" text-anchor="end">NC</text>
          </g>
        </g>
      </g>`,
    props: {
        origin:    { type: Object, required: true },
        powerPins: { type: Array, required: true },
        channels:  { type: Array, required: true }
    },
    computed: {
        groupTransform: function() {
            return `translate(${this.origin.x}, ${this.origin.y})`;
        }
    }
};
