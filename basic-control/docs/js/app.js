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
import useRecording from './composables/useRecording.js';
import StatusDisplay from './components/StatusDisplay.js';
import ControlPanel from './components/ControlPanel.js';
import SchematicCanvas from './components/SchematicCanvas.js';
import StateMachineLegend from './components/StateMachineLegend.js';
import LedMatrixDisplay from './components/LedMatrixDisplay.js';
import WiringTable from './components/WiringTable.js';

// ── Root component ──────────────────────────────────────────────────
const RootComponent = {
    template: '#root-tpl',

    setup: function() {
        // ── Kombi-Tasten (GELB x + GRÜN gleichzeitig) ──────────────
        // Spiegelt die physische Folientaster-Interaktion: die Eingänge sind
        // pegelgesteuert. Solange die Kombi-Taste gehalten wird, bleiben
        // presetXPressed + startPressed aktiv (konstanter BTN-Press); erst
        // beim Loslassen werden beide Pegel weggenommen → Programm startet.
        var heldInputs = { preset1Pressed: false, preset2Pressed: false, startPressed: false };
        var heldCombo  = Vue.ref(null);   // 'PROG_1' | 'PROG_2' | null

        // Create the simulation bridge (poll ticks re-send heldInputs)
        var sim = useSimulation(HoneyConfig, heldInputs);

        // ── Tab state ───────────────────────────────────────────
        var currentTab = Vue.ref('wiring');

        // ── Recording composable ──────────────────────────────────
        var rec = useRecording();

        // ── Button event handlers (wrapped with recording) ──────
        function onDirLeft()   { rec.recordEvent('dirLeft');   sim.handleInput({ dirLeftPressed: true }); }
        function onDirRight()  { rec.recordEvent('dirRight');  sim.handleInput({ dirRightPressed: true }); }
        function onStop()      { rec.recordEvent('stop');      sim.handleInput({ stopPressed: true }); }
        function onStart()     { rec.recordEvent('start');     sim.handleInput({ startPressed: true }); }
        function onPreset1()   { rec.recordEvent('preset1');   sim.handleInput({ preset1Pressed: true }); }
        function onPreset2()   { rec.recordEvent('preset2');   sim.handleInput({ preset2Pressed: true }); }
        function onToggleLock(){ sim.toggleLock(); }
        function onToggleSpeed(){ sim.toggleSpeed(); }

        // ── Kombi-Tasten: konstanter BTN-Press bis zum Loslassen ──
        function onComboPress(id) {
            if (sim.uiLocked.value) return;
            heldInputs.preset1Pressed = (id === 'PROG_1');
            heldInputs.preset2Pressed = (id === 'PROG_2');
            heldInputs.startPressed = true;
            heldCombo.value = id;
            // Zwei Events im selben elapsedMs-Tick → BMP-Replay legt beide
            // Eingänge gleichzeitig an (Combo, wie Szenario 29/30).
            rec.recordEvent(id === 'PROG_1' ? 'preset1' : 'preset2');
            rec.recordEvent('start');
            sim.handleInput({});
        }

        function onComboRelease() {
            if (heldCombo.value === null) { return; }  // idempotent (pointerup + pointerleave)
            heldInputs.preset1Pressed = false;
            heldInputs.preset2Pressed = false;
            heldInputs.startPressed = false;
            heldCombo.value = null;
            sim.handleInput({});   // alle Tasten losgelassen → Programm startet
        }

        function onCombo1Press() { onComboPress('PROG_1'); }
        function onCombo2Press() { onComboPress('PROG_2'); }

        // ── Recording control handlers ──────────────────────────
        function onStartRecording() { rec.startRecording(); }
        function onStopRecording()  { rec.stopRecording(); }
        function onClearBmp()       { rec.clearBmp(); }

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
            heldCombo: heldCombo,
            onDirLeft: onDirLeft,
            onDirRight: onDirRight,
            onStop: onStop,
            onStart: onStart,
            onPreset1: onPreset1,
            onPreset2: onPreset2,
            onToggleLock: onToggleLock,
            onToggleSpeed: onToggleSpeed,
            onCombo1Press: onCombo1Press,
            onCombo2Press: onCombo2Press,
            onComboRelease: onComboRelease,
            // Recording
            isRecording: rec.isRecording,
            isGenerating: rec.isGenerating,
            bmpDataUrl: rec.bmpDataUrl,
            bmpWidth: rec.bmpWidth,
            bmpHeight: rec.bmpHeight,
            recordedEventCount: rec.recordedEvents,
            onStartRecording: onStartRecording,
            onStopRecording: onStopRecording,
            onClearBmp: onClearBmp
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
app.component('LedMatrixDisplay',   LedMatrixDisplay);
app.component('WiringTable',        WiringTable);

app.mount('#app');
