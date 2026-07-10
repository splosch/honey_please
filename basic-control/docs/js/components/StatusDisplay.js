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
        stateId:           { type: String, required: true },
        colorBox:          { type: String, required: true },
        colorPing:         { type: String, required: true },
        colorDot:          { type: String, required: true },
        colorBar:          { type: String, required: true },
        showPing:          { type: Boolean, default: false },
        statusText:        { type: String, required: true },
        statusDesc:        { type: String, required: true },
        isRamping:         { type: Boolean, default: false },
        progress:          { type: Number, default: 0 },
        rampLabel:         { type: String, default: '' },
        selectedRunDataset: { type: String, required: true },
        preset1Dataset:    { type: String, required: true },
        preset2Dataset:    { type: String, required: true }
    },
    computed: {
        pct: function() {
            return Math.round(this.progress * 100);
        },
        activePreset: function() {
            if (this.selectedRunDataset === this.preset2Dataset) return 'preset2';
            return 'preset1';
        },
        preset1Label: function() {
            return this.preset1Dataset.replace('DATASET_', 'dAtA ');
        },
        preset2Label: function() {
            return this.preset2Dataset.replace('DATASET_', 'dAtA ');
        }
    }
};
