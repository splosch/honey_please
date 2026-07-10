/**
 * ControlPanel.js — Interactive simulation controls
 * ==================================================
 * Contains: DirectionKeypad (Folientaster 1), ControlKeypad (Folientaster 2),
 * and HardwareSwitch (X2 Wippschalter).
 *
 * All buttons emit events upward; this component has no state of its own.
 * Props:
 *   uiLocked          — disables all buttons when true (X2 switch off)
 *   selectedRunDataset — which speed preset is currently selected (DATASET_0 or DATASET_4)
 *   presets            — { preset1, preset2 } mapping from HoneyConfig
 */
export default {
    name: 'ControlPanel',
    template: '#control-panel-tpl',
    props: {
        uiLocked:           { type: Boolean, required: true },
        selectedRunDataset: { type: String, required: true },
        presets:            { type: Object, required: true }
    },
    emits: ['dir-left', 'dir-right', 'stop', 'start', 'preset1', 'preset2', 'toggle-lock'],
    computed: {
        preset1Active: function() {
            return this.selectedRunDataset === this.presets.preset1;
        },
        preset2Active: function() {
            return this.selectedRunDataset === this.presets.preset2;
        }
    }
};
