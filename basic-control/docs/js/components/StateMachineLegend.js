/**
 * StateMachineLegend.js — 6-state reference with active-state highlight
 * =====================================================================
 * Compact display of the 6 states in the state machine. Accepts the
 * current stateId and running direction to highlight the active state.
 *
 * RUNNING_CW and RUNNING_CCW are merged into a single "LÄUFT" row that
 * dynamically shows the active direction (CW or CCW) — never both.
 */
export default {
    name: 'StateMachineLegend',
    template: '#state-machine-legend-tpl',
    props: {
        stateId: { type: String, required: true },
        runningCCW: { type: Boolean, default: false }
    },
    data: function() {
        return {
            states: [
                { id: 'LOCKED',       color: 'bg-red-500',    label: 'GESPERRT',    desc: 'X2 offen' },
                { id: 'STANDBY',      color: 'bg-amber-500',  label: 'STANDBY',     desc: 'Richtung wählen, Preset, Start' },
                { id: 'ACCELERATING', color: 'bg-yellow-400', label: 'ANLAUFEN',    desc: 'dAtA-gesteuert, Stop/Richtungswechsel möglich' },
                { id: 'RUNNING',      color: 'bg-green-500',  label: 'LÄUFT',       desc: '' },
                { id: 'DECELERATING', color: 'bg-orange-400', label: 'ABBREMSEN',   desc: 'proportional zur Rampe, Eingaben gesperrt' },
                { id: 'WAITING',      color: 'bg-amber-400',  label: 'WARTEN',      desc: '150 ms Sicherheitspause (Hardware)' }
            ]
        };
    },
    methods: {
        isActive: function(stateId) {
            if (stateId === 'RUNNING') {
                return this.stateId === 'RUNNING_CW' || this.stateId === 'RUNNING_CCW';
            }
            return this.stateId === stateId;
        }
    }
};
