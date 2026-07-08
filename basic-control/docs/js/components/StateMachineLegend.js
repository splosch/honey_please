/**
 * StateMachineLegend.js — 6-state reference with active-state highlight
 * =====================================================================
 * Static display of the 6 states in the state machine. Accepts the
 * current stateId to highlight the active state.
 */
export default {
    name: 'StateMachineLegend',
    template: '#state-machine-legend-tpl',
    props: {
        stateId: { type: String, required: true }
    },
    data: function() {
        return {
            states: [
                { id: 'LOCKED',    color: 'bg-red-500',    label: 'GESPERRT',    desc: 'X2 offen' },
                { id: 'STANDBY',   color: 'bg-amber-500',  label: 'STANDBY',     desc: 'Richtung wählen, Preset, Start' },
                { id: 'ACCELERATING', color: 'bg-yellow-400', label: 'ANLAUFEN', desc: 'dAtA-gesteuert, Stop/Richtungswechsel möglich' },
                { id: 'RUNNING_CW',  color: 'bg-green-500',  label: 'LÄUFT',     desc: 'Stop/Richtungswechsel/Preset (CW)' },
                { id: 'RUNNING_CCW', color: 'bg-green-500',  label: 'LÄUFT',     desc: 'Stop/Richtungswechsel/Preset (CCW)' },
                { id: 'DECELERATING', color: 'bg-orange-400', label: 'ABBREMSEN', desc: 'proportional zur Rampe, Eingaben gesperrt' },
                { id: 'WAITING',   color: 'bg-amber-400',  label: 'WARTEN',      desc: '150 ms Sicherheitspause (Hardware)' }
            ]
        };
    },
    methods: {
        isActive: function(stateId) {
            // RUNNING_CW and RUNNING_CCW both map to the "LÄUFT" row
            if (stateId === 'RUNNING_CW' || stateId === 'RUNNING_CCW') {
                return this.stateId === 'RUNNING_CW' || this.stateId === 'RUNNING_CCW';
            }
            return this.stateId === stateId;
        }
    }
};
