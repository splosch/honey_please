/**
 * StatusDisplay.js — Motor state indicator + ramp progress bar
 * ============================================================
 * Pure presentational component. All business logic lives in
 * useSimulation.js; this component only renders what it receives.
 */
export default {
    name: 'StatusDisplay',
    template: '#status-display-tpl',
    props: {
        stateId:       { type: String, required: true },
        colorBox:      { type: String, required: true },
        colorPing:     { type: String, required: true },
        colorDot:      { type: String, required: true },
        colorBar:      { type: String, required: true },
        showPing:      { type: Boolean, default: false },
        statusText:    { type: String, required: true },
        statusDesc:    { type: String, required: true },
        isRamping:     { type: Boolean, default: false },
        progress:      { type: Number, default: 0 },
        rampLabel:     { type: String, default: '' }
    },
    computed: {
        pct: function() {
            return Math.round(this.progress * 100);
        }
    }
};
