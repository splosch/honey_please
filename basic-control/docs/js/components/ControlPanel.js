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
 *   heldCombo          — 'PROG_1' | 'PROG_2' | null — Kombi-Taste wird gerade
 *                        gehalten; hebt GELB x + GRÜN physisch gedrückt hervor
 */
export default {
    name: 'ControlPanel',
    template: '#control-panel-tpl',
    props: {
        uiLocked:           { type: Boolean, required: true },
        selectedRunDataset: { type: String, required: true },
        presets:            { type: Object, required: true },
        heldCombo:          { type: String, default: null }
    },
    emits: ['dir-left', 'dir-right', 'stop', 'start', 'preset1', 'preset2', 'toggle-lock',
            'combo-1-press', 'combo-1-release', 'combo-2-press', 'combo-2-release'],
    computed: {
        preset1Active: function() {
            return this.selectedRunDataset === this.presets.preset1;
        },
        preset2Active: function() {
            return this.selectedRunDataset === this.presets.preset2;
        },
        // Kombi-Haltezustand: zeigt die physisch "gedrückten" Folientaster an.
        gelb1Active: function() {
            return this.preset1Active || this.heldCombo === 'PROG_1';
        },
        gelb2Active: function() {
            return this.preset2Active || this.heldCombo === 'PROG_2';
        },
        gruenActive: function() {
            return this.heldCombo !== null;
        }
    }
};
