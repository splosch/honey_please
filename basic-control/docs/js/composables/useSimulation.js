/**
 * useSimulation.js — Vue composable wrapping HoneyStateMachine
 * ============================================================
 * The single bridge between the pure-JS state machine and the Vue UI.
 * To swap from simulation to real hardware, replace this file with
 * a useHardwareBridge that exposes the same reactive interface.
 *
 * Depends on: Vue (global), HoneyStateMachine, HoneyConfig
 */

import HoneyStateMachine from '../../honey_state_machine.js';

// ── State → UI display mapping ──────────────────────────────────────
const STATE_UI = {
    STANDBY:      { color:'amber',  ping:false, text:'Standby – Bereit',       desc:'Richtung wählen (LINKS/RECHTS), dann GRÜN drücken.' },
    ACCELERATING: { color:'yellow', ping:true,  text:'⬆ ANLAUFEN …',          desc:'Anlauframpe läuft. STOP oder Gegenrichtungs-Taste → proportionale Bremsrampe.' },
    RUNNING_CW:   { color:'green',  ping:true,  text:'LÄUFT: RECHTS (CW)',    desc:'Motor dreht CW. LINKS-Taste → Richtungswechsel + Auto-Neustart CCW.' },
    RUNNING_CCW:  { color:'green',  ping:true,  text:'LÄUFT: LINKS (CCW)',    desc:'Motor dreht CCW. RECHTS-Taste → Richtungswechsel + Auto-Neustart CW.' },
    DECELERATING: { color:'orange', ping:true,  text:'⬇ ABBREMSEN …',         desc:'Bremsrampe läuft. Alle Eingaben gesperrt.' },
    WAITING:      { color:'amber',  ping:false, text:'Sicherheitspause …',     desc:'Motor steht still, Mechanik beruhigt sich.' }
};

const LOCKED_UI = { color:'red', ping:true, text:'Gesperrt (X2 aus)', desc:'Wippschalter X2 geöffnet – Motor blockiert sofort.' };

const COLOR_MAP = {
    red:    { box:'text-red-500',    ping:'bg-red-400',    dot:'bg-red-500',    bar:'bg-red-400'    },
    amber:  { box:'text-amber-500',  ping:'',              dot:'bg-amber-500',  bar:'bg-amber-400'  },
    yellow: { box:'text-yellow-400', ping:'bg-yellow-400', dot:'bg-yellow-400', bar:'bg-yellow-400' },
    green:  { box:'text-green-500',  ping:'bg-green-400',  dot:'bg-green-500',  bar:'bg-green-400'  },
    orange: { box:'text-orange-400', ping:'bg-orange-400', dot:'bg-orange-400', bar:'bg-orange-400' }
};

const RAMPING_STATES = ['ACCELERATING','DECELERATING','WAITING'];

// ── Factory ─────────────────────────────────────────────────────────

/**
 * @param {object} config - HoneyConfig object
 * @returns {{ simState, uiLocked, handleInput, toggleLock, startPolling, stopPolling }}
 */
export default function useSimulation(config) {
    var sm = new HoneyStateMachine(config);
    var uiLocked = Vue.ref(true);
    var simSpeed = Vue.ref(config.simSpeed);

    var simState = Vue.reactive({
        // -- Status display --
        id:            'LOCKED',
        colorKey:      'red',
        colorBox:      COLOR_MAP.red.box,
        colorPing:     COLOR_MAP.red.ping,
        colorDot:      COLOR_MAP.red.dot,
        colorBar:      COLOR_MAP.red.bar,
        showPing:      true,
        statusText:    LOCKED_UI.text,
        statusDesc:    LOCKED_UI.desc,

        // -- Ramp --
        isRamping:     false,
        progress:      0,
        rampLabel:     '',

        // -- SVG wires --
        dirRelayCCW:   false,
        startRelayOn:  false,
        m1RelayOn:     false,
        m2RelayOn:     false,

        // -- Dataset labels for ramp --
        selectedRunDataset: config.presets.preset1,
        activeDataset:      config.presets.standby,

        // -- LED matrix snapshot fields (lib/led_matrix.js) --
        targetDirection:  'CW',
        runningDirection: 'CW',
        restartIntent:    'NONE'
    });

    // ── Internal helpers ────────────────────────────────────────────

    function applyUI(s) {
        var ui = STATE_UI[s.id] || STATE_UI.STANDBY;
        var c  = COLOR_MAP[ui.color];

        simState.id       = s.id;
        simState.colorKey = ui.color;
        simState.colorBox = c.box;
        simState.colorPing = c.ping;
        simState.colorDot = c.dot;
        simState.colorBar = c.bar;
        simState.showPing = ui.ping;
        simState.statusText = ui.text;
        simState.statusDesc = ui.desc;
        simState.progress = s.progress;
        simState.isRamping = RAMPING_STATES.indexOf(s.id) !== -1;
        simState.dirRelayCCW = s.dirRelayCCW;
        simState.startRelayOn = s.startRelayOn;
        simState.selectedRunDataset = s.selectedRunDataset;
        simState.activeDataset = s.activeDataset;
        simState.targetDirection = s.targetDirection;
        simState.runningDirection = s.runningDirection;
        simState.restartIntent = s.restartIntent;

        // M1/M2 relay states derived from active dataset
        var ds = config.datasets[s.activeDataset];
        simState.m1RelayOn = ds ? ds.m1 : false;
        simState.m2RelayOn = ds ? ds.m2 : false;

        if (s.id === 'ACCELERATING') {
            simState.rampLabel = `Anlauframpe (${s.selectedRunDataset})`;
        } else if (s.id === 'DECELERATING') {
            simState.rampLabel = `Bremsrampe (von ${s.activeDataset})`;
        } else if (s.id === 'WAITING') {
            simState.rampLabel = 'Sicherheitspause';
        } else {
            simState.rampLabel = '';
        }
    }

    function applyLocked() {
        var c = COLOR_MAP.red;
        simState.id       = 'LOCKED';
        simState.colorKey = 'red';
        simState.colorBox = c.box;
        simState.colorPing = c.ping;
        simState.colorDot = c.dot;
        simState.colorBar = c.bar;
        simState.showPing = LOCKED_UI.ping;
        simState.statusText = LOCKED_UI.text;
        simState.statusDesc = LOCKED_UI.desc;
        simState.progress = 0;
        simState.isRamping = false;
        simState.rampLabel = '';
        simState.dirRelayCCW = false;
        simState.startRelayOn = false;
        simState.m1RelayOn = false;
        simState.m2RelayOn = false;
        simState.targetDirection = 'CW';
        simState.runningDirection = 'CW';
        simState.restartIntent = 'NONE';
    }

    function syncFromSM(nowMs) {
        if (uiLocked.value) {
            applyLocked();
        } else {
            applyUI(sm.getState(nowMs));
        }
    }

    // ── Polling & animation ─────────────────────────────────────────

    var pollTimer = null;
    var rafId = null;

    function tick() {
        sm.tick({}, Date.now());
        syncFromSM(Date.now());
    }

    function animationFrame() {
        syncFromSM(Date.now());
        rafId = requestAnimationFrame(animationFrame);
    }

    function startPolling() {
        pollTimer = setInterval(tick, 100);
        rafId = requestAnimationFrame(animationFrame);
    }

    function stopPolling() {
        if (pollTimer !== null) { clearInterval(pollTimer); pollTimer = null; }
        if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
    }

    // ── Public methods ──────────────────────────────────────────────

    function handleInput(inputs) {
        if (uiLocked.value) return;
        sm.tick(inputs, Date.now());
        syncFromSM(Date.now());
    }

    function toggleLock() {
        uiLocked.value = !uiLocked.value;
        sm.reset();
        syncFromSM(Date.now());
    }

    function toggleSpeed() {
        // Toggle between fast demo (0.2×) and real-time (1.0×)
        var newSpeed = config.simSpeed === 1.0 ? 0.2 : 1.0;
        config.simSpeed = newSpeed;
        simSpeed.value = newSpeed;
    }

    function setSpeed(multiplier) {
        config.simSpeed = multiplier;
        simSpeed.value = multiplier;
    }

    // initial paint
    syncFromSM(Date.now());

    return {
        simState: simState,
        uiLocked: uiLocked,
        simSpeed: simSpeed,
        handleInput: handleInput,
        toggleLock: toggleLock,
        toggleSpeed: toggleSpeed,
        setSpeed: setSpeed,
        startPolling: startPolling,
        stopPolling: stopPolling
    };
}
