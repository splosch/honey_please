/**
 * ControlPanel.js — Interactive simulation controls
 * ==================================================
 * Contains: DirectionKeypad (Folientaster 1), ControlKeypad (Folientaster 2),
 * and HardwareSwitch (X2 Wippschalter).
 *
 * All buttons emit events upward; this component has no state of its own.
 * The only prop is uiLocked, used to dim/disable buttons appropriately.
 */
export default {
    name: 'ControlPanel',
    template: '#control-panel-tpl',
    props: {
        uiLocked: { type: Boolean, required: true }
    },
    emits: ['dir-left', 'dir-right', 'stop', 'start', 'preset1', 'preset2', 'toggle-lock']
};
