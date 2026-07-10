/**
 * useRecording.js — Vue composable for recording state machine interactions
 * ========================================================================
 * Captures live button-press events during interactive use, then converts
 * the recorded timeline into a BMP visualization via the existing headless
 * simulation pipeline (useBmpSimulation.js + bmpWriter.js).
 *
 * Design:
 *   - Recording start timestamps every event relative to start time.
 *   - On stop, events are mapped to simulation ticks and fed through
 *     runHeadlessSimulation() → generateBmpBuffer() → Blob → Object URL.
 *   - The resulting BMP is displayed as an overlay on the wiring schematic.
 *   - Only one recording can exist at a time; starting a new one clears
 *     any previous BMP.
 *
 * @module useRecording
 */

import { runHeadlessSimulation } from './useBmpSimulation.js';
import { generateBmpBuffer } from '../lib/bmpWriter.js';

/** Tick duration in ms for event-to-scenario conversion. */
var TICK_DURATION_MS = 50;

/** Extra ticks appended after the last event to show final state. */
var PADDING_TICKS = 20;

/**
 * @returns {{
 *   isRecording:       import('vue').Ref<boolean>,
 *   recordedEvents:    import('vue').Ref<Array<{elapsedMs:number, type:string}>>,
 *   bmpDataUrl:        import('vue').Ref<string|null>,
 *   bmpWidth:          import('vue').Ref<number>,
 *   bmpHeight:         import('vue').Ref<number>,
 *   isGenerating:      import('vue').Ref<boolean>,
 *   startRecording:    () => void,
 *   stopRecording:     () => void,
 *   recordEvent:       (type: string) => void,
 *   clearBmp:          () => void
 * }}
 */
export default function useRecording() {
    var isRecording    = Vue.ref(false);
    var recordedEvents = Vue.ref([]);
    var recordingStartMs = Vue.ref(0);
    var bmpDataUrl     = Vue.ref(null);
    var bmpWidth       = Vue.ref(0);
    var bmpHeight      = Vue.ref(0);
    var isGenerating   = Vue.ref(false);

    // ── Internal: convert recorded events → scenario → BMP → Object URL ──

    function generateBmp() {
        var events = recordedEvents.value;
        if (!events || events.length === 0) {
            return;
        }

        isGenerating.value = true;

        // Defer heavy computation so Vue can flush the "Generating BMP…" UI
        // update before we block the main thread with the simulation loop.
        setTimeout(function() {
            try {
                // 1. Determine total duration from last event
                var totalDurationMs = events[events.length - 1].elapsedMs;

                // 2. Build tick-based scenario
                var totalTicks = Math.ceil(totalDurationMs / TICK_DURATION_MS) + PADDING_TICKS;

                // 3. Map recorded events to atTick
                var scenarioEvents = [];
                for (var i = 0; i < events.length; i++) {
                    scenarioEvents.push({
                        atTick: Math.max(0, Math.round(events[i].elapsedMs / TICK_DURATION_MS)),
                        type: events[i].type
                    });
                }

                var scenario = {
                    totalTicks: totalTicks,
                    tickDurationMs: TICK_DURATION_MS,
                    events: scenarioEvents
                };

                // 4. Run headless simulation → color matrix
                var result = runHeadlessSimulation(scenario);

                // 5. Generate BMP buffer → Blob → Object URL
                var buffer = generateBmpBuffer(result.matrix, result.width, result.height);
                var blob = new Blob([buffer], { type: 'image/bmp' });

                // Revoke previous URL to prevent memory leaks
                if (bmpDataUrl.value) {
                    URL.revokeObjectURL(bmpDataUrl.value);
                }

                bmpDataUrl.value = URL.createObjectURL(blob);
                bmpWidth.value  = result.width;
                bmpHeight.value = result.height;
            } finally {
                isGenerating.value = false;
            }
        }, 0);
    }

    // ── Public API ──────────────────────────────────────────────────────

    function startRecording() {
        // Clear any previous BMP
        clearBmp();

        recordedEvents.value = [];
        recordingStartMs.value = Date.now();
        isRecording.value = true;
    }

    function stopRecording() {
        if (!isRecording.value) { return; }
        isRecording.value = false;
        generateBmp();
    }

    /**
     * Record a single event. Called from button handlers alongside
     * sim.handleInput(). Silently ignored when not recording.
     *
     * @param {string} type — event type: 'dirLeft','dirRight','start','stop','preset1','preset2'
     */
    function recordEvent(type) {
        if (!isRecording.value) { return; }
        recordedEvents.value.push({
            elapsedMs: Date.now() - recordingStartMs.value,
            type: type
        });
    }

    function clearBmp() {
        if (bmpDataUrl.value) {
            URL.revokeObjectURL(bmpDataUrl.value);
        }
        bmpDataUrl.value = null;
        bmpWidth.value = 0;
        bmpHeight.value = 0;
    }

    return {
        isRecording: isRecording,
        recordedEvents: recordedEvents,
        bmpDataUrl: bmpDataUrl,
        bmpWidth: bmpWidth,
        bmpHeight: bmpHeight,
        isGenerating: isGenerating,
        startRecording: startRecording,
        stopRecording: stopRecording,
        recordEvent: recordEvent,
        clearBmp: clearBmp
    };
}
