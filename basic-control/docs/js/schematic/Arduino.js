/**
 * Arduino.js — Arduino UNO R4 WiFi component
 * Origin, pins, bounds, and iterable arrays for the SVG schematic.
 */
const origin = { x: 30, y: 40 };
const bounds = { width: 210, height: 340 };

const LEFT_RAIL_X = 0;
const LEFT_RAIL_Y = 50;
const RIGHT_IO_X = 200;
const RIGHT_IO_Y = 50;
const PIN_CX = 5;

function leftPin(yOffset, label, color) {
    return {
        relX: PIN_CX, relY: yOffset,
        absX: origin.x + LEFT_RAIL_X + PIN_CX,
        absY: origin.y + LEFT_RAIL_Y + yOffset,
        label, color
    };
}

function rightPin(yOffset, label, color) {
    return {
        relX: PIN_CX, relY: yOffset,
        absX: origin.x + RIGHT_IO_X + PIN_CX,
        absY: origin.y + RIGHT_IO_Y + yOffset,
        label, color
    };
}

const pins = {
    arduino5v:  leftPin(6,   '5V OUT',               '#EF4444'),
    arduinoGnd: leftPin(36,  'GND',                  '#4B5563'),

    arduinoD2:  rightPin(16,  'D2 (Rel 1 / X1)',      '#F59E0B'),
    arduinoD3:  rightPin(41,  'D3 (Rel 2 / X3)',      '#3B82F6'),
    arduinoD4:  rightPin(66,  'D4 (Rel M1 / Speed 0)', '#F59E0B'),
    arduinoD5:  rightPin(91,  'D5 (Rel M2 / Speed 1)', '#F59E0B'),
    arduinoD6:  rightPin(126, 'D6 (Links / CCW)',      '#A855F7'),
    arduinoD7:  rightPin(151, 'D7 (Rechts / CW)',      '#A855F7'),
    arduinoD8:  rightPin(176, 'D8 (Key Rot-Stop)',     '#EF4444'),
    arduinoD9:  rightPin(201, 'D9 (Key Gelb 1)',       '#F59E0B'),
    arduinoD10: rightPin(226, 'D10 (Key Gelb 2)',      '#F59E0B'),
    arduinoD11: rightPin(251, 'D11 (Key Grn-Start)',   '#10B981'),
};

export { origin, bounds, pins };

export const A5V  = pins.arduino5v;
export const AGND = pins.arduinoGnd;
export const D2   = pins.arduinoD2;
export const D3   = pins.arduinoD3;
export const D4   = pins.arduinoD4;
export const D5   = pins.arduinoD5;
export const D6   = pins.arduinoD6;
export const D7   = pins.arduinoD7;
export const D8   = pins.arduinoD8;
export const D9   = pins.arduinoD9;
export const D10  = pins.arduinoD10;
export const D11  = pins.arduinoD11;

export const RIGHT_PINS = [
    pins.arduinoD2, pins.arduinoD3, pins.arduinoD4, pins.arduinoD5,
    pins.arduinoD6, pins.arduinoD7, pins.arduinoD8, pins.arduinoD9,
    pins.arduinoD10, pins.arduinoD11
];

export const LEFT_PINS = [
    { id: '5v',  label: '5V OUT', color: '#EF4444', relY: 6 },
    { id: 'gnd', label: 'GND',     color: '#4B5563', relY: 36 }
];

// ── Vue component definition ──────────────────────────────────────────
export const component = {
    template: `
      <g :transform="groupTransform">
        <rect width="210" height="340" rx="10" fill="#1E293B" fill-opacity="0.35" stroke="#0EA5E9" stroke-width="2.5"></rect>
        <text x="105" y="25" fill="#0EA5E9" font-weight="bold" font-size="12" text-anchor="middle">ARDUINO UNO R4 WIFI</text>
        <g transform="translate(0, 50)">
          <template v-for="pin in leftPins" :key="pin.id">
            <rect x="0" :y="pin.relY - 6" width="10" height="12" :fill="pin.color"></rect>
            <circle :id="'pin-ard-' + pin.id" cx="5" :cy="pin.relY" r="3.5" :fill="pin.color" stroke="#FFF" stroke-width="0.75"></circle>
            <text x="18" :y="pin.relY + 4" fill="#FFF" font-size="9" text-anchor="start">{{ pin.label }}</text>
          </template>
        </g>
        <g transform="translate(200, 50)">
          <template v-for="pin in rightPins" :key="pin.label">
            <rect x="0" :y="pin.relY - 6" width="10" height="12" :fill="pin.color"></rect>
            <circle :id="'pin-ard-' + pin.label.split(' ')[0].toLowerCase()" cx="5" :cy="pin.relY" r="3.5" :fill="pin.color" stroke="#FFF" stroke-width="0.75"></circle>
            <text x="-12" :y="pin.relY + 4" fill="#FFF" font-size="9" text-anchor="end">{{ pin.label }}</text>
          </template>
        </g>
      </g>`,
    props: {
        origin:    { type: Object, required: true },
        leftPins:  { type: Array, required: true },
        rightPins: { type: Array, required: true }
    },
    computed: {
        groupTransform: function() {
            return `translate(${this.origin.x}, ${this.origin.y})`;
        }
    }
};
