/**
 * MotorDriver.js — Oriental Motor BLF Driver component
 * Origin, control ports, and iterable arrays for the SVG schematic.
 */
const origin = { x: 860, y: 40 };
const bounds = { width: 300, height: 500 };

const PORT_GROUP_X = 30;
const PORT_GROUP_Y = 75;
const PORT_SPACING = 55;
const PORT_CX = 15;
const PORT_CY_OFF = 17.5;

function port(index) {
    var rectY = index * PORT_SPACING;
    return {
        absX: origin.x + PORT_GROUP_X + PORT_CX,
        absY: origin.y + PORT_GROUP_Y + rectY + PORT_CY_OFF
    };
}

const pins = {
    driverX1:    port(0),
    driverX2:    port(1),
    driverX3:    port(2),
    driverX0:    port(3),
    driverM1:    port(4),
    driverM2:    port(5),
    driverM0:    port(6),
    driverInCom: port(7),
};

export { origin, bounds, pins };

export const DRV_X1    = pins.driverX1;
export const DRV_X2    = pins.driverX2;
export const DRV_X3    = pins.driverX3;
export const DRV_X0    = pins.driverX0;
export const DRV_M1    = pins.driverM1;
export const DRV_M2    = pins.driverM2;
export const DRV_M0    = pins.driverM0;
export const DRV_INCOM = pins.driverInCom;

export const PORTS = [
    { id: 'x1',    rectY: 0,   label: 'X1', desc: 'START/STOP',        color: '#10B981', pin: pins.driverX1,    rectW: 60 },
    { id: 'x2',    rectY: 55,  label: 'X2', desc: 'RUN/BRAKE',         color: '#10B981', pin: pins.driverX2,    rectW: 60 },
    { id: 'x3',    rectY: 110, label: 'X3', desc: 'CW/CCW',            color: '#10B981', pin: pins.driverX3,    rectW: 60 },
    { id: 'x0',    rectY: 165, label: 'X0', desc: 'Error Port',        color: '#10B981', pin: pins.driverX0,    rectW: 85 },
    { id: 'm1',    rectY: 220, label: 'M1', desc: 'Speed Bit 0 (D4)',  color: '#F59E0B', pin: pins.driverM1,    rectW: 85 },
    { id: 'm2',    rectY: 275, label: 'M2', desc: 'Speed Bit 1 (D5)',  color: '#F59E0B', pin: pins.driverM2,    rectW: 85 },
    { id: 'm0',    rectY: 330, label: 'M0', desc: 'GND (Hardwire)',    color: '#4B5563', pin: pins.driverM0,    rectW: 85 },
    { id: 'incom', rectY: 385, label: 'IN-COM', desc: 'MASSE',         color: '#10B981', pin: pins.driverInCom, rectW: 85 }
];

// ── Vue component definition ──────────────────────────────────────────
export const component = {
    template: `
      <g :transform="groupTransform">
        <rect width="300" height="500" rx="8" fill="#1E293B" fill-opacity="0.35" stroke="#10B981" stroke-width="3"></rect>
        <text x="150" y="25" fill="#10B981" font-weight="bold" font-size="13" text-anchor="middle">ORIENTAL MOTOR BLF</text>
        <text x="150" y="42" fill="#86EFAC" font-size="10" text-anchor="middle">Steuerungsklemmen (Control I/O)</text>
        <g transform="translate(30, 75)" fill="#374151">
          <g v-for="port in ports" :key="port.id" :transform="'translate(0, ' + port.rectY + ')'">
            <rect x="0" y="0" :width="port.rectW" height="35" rx="3" stroke="#4B5563"></rect>
            <circle :id="'pin-driver-' + port.id" cx="15" cy="17.5" r="5" :fill="port.color" stroke="#FFF" stroke-width="1"></circle>
            <text x="35" y="22" fill="#FFF" font-weight="bold" font-size="12">{{ port.label }}</text>
            <text :x="port.rectW === 60 ? 75 : 95" y="22" fill="#9CA3AF" font-size="10">{{ port.desc }}</text>
          </g>
        </g>
      </g>`,
    props: {
        origin: { type: Object, required: true },
        ports:  { type: Array, required: true }
    },
    computed: {
        groupTransform: function() {
            return `translate(${this.origin.x}, ${this.origin.y})`;
        }
    }
};
