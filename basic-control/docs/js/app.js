/**
 * app.js — Vue 3 application bootstrap
 * =====================================
 * Creates the root component, registers all child components, wires up
 * the useSimulation composable, and mounts to #app.
 *
 * This is the only file that:
 *   - Calls Vue.createApp()
 *   - Instantiates useSimulation()
 *   - Connects component events to the state machine
 *
 * Loaded as type="module" — the single JS entry point.
 */

import HoneyConfig from '../honey_config.js';
import useSimulation from './composables/useSimulation.js';
import StatusDisplay from './components/StatusDisplay.js';
import ControlPanel from './components/ControlPanel.js';
import SchematicCanvas from './components/SchematicCanvas.js';
import StateMachineLegend from './components/StateMachineLegend.js';
import WiringTable from './components/WiringTable.js';

// ── Root component ──────────────────────────────────────────────────
const RootComponent = {
    template: '#root-tpl',

    setup: function() {
        // Create the simulation bridge
        var sim = useSimulation(HoneyConfig);

        // ── Tab state ───────────────────────────────────────────
        var currentTab = Vue.ref('wiring');

        // ── Button event handlers ─────────────────────────────────
        function onDirLeft()   { sim.handleInput({ dirLeftPressed: true }); }
        function onDirRight()  { sim.handleInput({ dirRightPressed: true }); }
        function onStop()      { sim.handleInput({ stopPressed: true }); }
        function onStart()     { sim.handleInput({ startPressed: true }); }
        function onPreset1()   { sim.handleInput({ preset1Pressed: true }); }
        function onPreset2()   { sim.handleInput({ preset2Pressed: true }); }
        function onToggleLock(){ sim.toggleLock(); }
        function onToggleSpeed(){ sim.toggleSpeed(); }

        // ── Lifecycle: start / stop polling & animation ───────────
        Vue.onMounted(function() {
            sim.startPolling();
        });

        Vue.onUnmounted(function() {
            sim.stopPolling();
        });

        // ── Expose to template ────────────────────────────────────
        return {
            currentTab: currentTab,
            simState:  sim.simState,
            uiLocked:  sim.uiLocked,
            simSpeed:  sim.simSpeed,
            presets:   HoneyConfig.presets,
            onDirLeft: onDirLeft,
            onDirRight: onDirRight,
            onStop: onStop,
            onStart: onStart,
            onPreset1: onPreset1,
            onPreset2: onPreset2,
            onToggleLock: onToggleLock,
            onToggleSpeed: onToggleSpeed
        };
    }
};

// ── Create + mount ──────────────────────────────────────────────────
var app = Vue.createApp(RootComponent);

// Register all components (PascalCase names auto-match kebab-case in DOM templates)
app.component('StatusDisplay',      StatusDisplay);
app.component('ControlPanel',       ControlPanel);
app.component('SchematicCanvas',    SchematicCanvas);
app.component('StateMachineLegend', StateMachineLegend);
app.component('WiringTable',        WiringTable);

app.mount('#app');
