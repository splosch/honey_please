/**
 * SchematicCanvas.js — Full SVG wiring diagram
 * =============================================
 * The largest component. SVG static blocks are preserved verbatim from
 * the original HTML. Only the wire paths and X2 switch graphic are reactive.
 *
 * Props:
 *   simState  — reactive state from useSimulation (used for wire conditions)
 *   uiLocked  — boolean ref for X2 switch rendering
 */

import { WIRE_DEFS, JUNCTION_DOTS } from './wires.js';

export default {
    name: 'SchematicCanvas',
    template: '#schematic-canvas-tpl',
    props: {
        simState:  { type: Object, required: true },
        uiLocked:  { type: Boolean, required: true }
    },
    emits: ['toggle-lock'],
    data: function() {
        return {
            wireDefs: WIRE_DEFS,
            junctions: JUNCTION_DOTS
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
        },

        // X2 switch graphic (inside SVG)
        switchLeverY2:    function() { return this.uiLocked ? '50' : '30'; },
        switchLeverColor: function() { return this.uiLocked ? '#EF4444' : '#10B981'; },
        switchText:       function() { return this.uiLocked ? 'AUS (Gesperrt)' : 'EIN (Freigegeben)'; },
        switchTextColor:  function() { return this.uiLocked ? '#EF4444' : '#10B981'; }
    }
};
