/**
 * SchematicCanvas.js — Full SVG wiring diagram
 * =============================================
 * Composes 7 schematic sub-components (Arduino, RelayBank, MotorDriver,
 * Keypads, WagoBus, ManualSwitch) whose SVG templates now live co-located
 * in their respective js/schematic/*.js files.
 *
 * Props:
 *   simState  — reactive state from useSimulation (used for wire conditions)
 *   uiLocked  — boolean ref for X2 switch rendering
 */

import { WIRE_DEFS, JUNCTION_DOTS } from './wires.js';
import { ORIGIN, PINS } from './pinLayout.js';
import { LEFT_PINS as ARDUINO_LEFT_PINS, RIGHT_PINS as ARDUINO_RIGHT_PINS } from '../schematic/Arduino.js';
import { CHANNELS as RELAY_CHANNELS, POWER_PINS as RELAY_POWER_PINS } from '../schematic/RelayBank.js';
import { PORTS as DRIVER_PORTS } from '../schematic/MotorDriver.js';
import { CONTACTS as WAGO_CONTACTS } from '../schematic/WagoBus.js';
import { CONTACT_PINS as FT1_CONTACT_PINS } from '../schematic/KeypadDirection.js';
import { CONTACT_PINS as FT2_CONTACT_PINS } from '../schematic/KeypadControl.js';
import { CONTACTS as SWITCH_CONTACTS } from '../schematic/ManualSwitch.js';

// ── Sub-component definitions (template literals, co-located) ─────────
import { component as ArduinoComponent }    from '../schematic/Arduino.js';
import { component as RelayBankComponent }  from '../schematic/RelayBank.js';
import { component as MotorDriverComponent } from '../schematic/MotorDriver.js';
import { component as KeypadDirComponent }  from '../schematic/KeypadDirection.js';
import { component as KeypadCtrlComponent } from '../schematic/KeypadControl.js';
import { component as WagoBusComponent }    from '../schematic/WagoBus.js';
import { component as SwitchComponent }     from '../schematic/ManualSwitch.js';

export default {
    name: 'SchematicCanvas',
    template: '#schematic-canvas-tpl',
    components: {
        'arduino-uno':       ArduinoComponent,
        'relay-bank':        RelayBankComponent,
        'motor-driver':      MotorDriverComponent,
        'keypad-direction':  KeypadDirComponent,
        'keypad-control':    KeypadCtrlComponent,
        'wago-bus':          WagoBusComponent,
        'manual-switch':     SwitchComponent
    },
    props: {
        simState:  { type: Object, required: true },
        uiLocked:  { type: Boolean, required: true }
    },
    emits: ['toggle-lock'],
    data: function() {
        return {
            wireDefs: WIRE_DEFS,
            junctions: JUNCTION_DOTS,
            origin: ORIGIN,
            pins: PINS,
            arduinoLeftPins: ARDUINO_LEFT_PINS,
            arduinoRightPins: ARDUINO_RIGHT_PINS,
            relayChannels: RELAY_CHANNELS,
            relayPowerPins: RELAY_POWER_PINS,
            driverPorts: DRIVER_PORTS,
            wagoContacts: WAGO_CONTACTS,
            ft1ContactPins: FT1_CONTACT_PINS,
            ft2ContactPins: FT2_CONTACT_PINS,
            switchContacts: SWITCH_CONTACTS
        };
    },
    computed: {
        wireStates: function() {
            var self = this;
            var states = {};
            this.wireDefs.forEach(function(w) {
                var active;
                if (w.alwaysAnimated) {
                    active = true;
                } else if (typeof w.activeWhen === 'function') {
                    active = w.activeWhen(self.simState, self.uiLocked);
                } else {
                    active = false;
                }
                states[w.id] = {
                    active: active,
                    color: active && w.activeColor ? w.activeColor : w.defaultColor
                };
            });
            return states;
        }
    }
};
