/**
 * LedMatrixDisplay.js — live 8×12 LED matrix visualization
 * ========================================================
 * Shows exactly what the physical Arduino LED matrix shows, computed by
 * the pure mirror in lib/led_matrix.js (led_animation.cpp). This component
 * only draws: a rAF loop reads the shared simState snapshot, advances the
 * animation frame, and paints it to a canvas — the analogue of
 * ledMatrix.renderBitmap(frame, 8, 12) in main.cpp:109,124.
 *
 * LOCKED is a UI-only state (no firmware equivalent — the Wippschalter X2
 * cuts power), so the matrix is drawn dark (feature_matrix_simulation.md R7).
 * The icon blink stays wall-clock while ring speed follows simState.progress
 * (simSpeed-scaled), per feature_matrix_simulation.md R8.
 */
import { makeInitialLedAnimationState, updateLedAnimationFrame } from '../lib/led_matrix.js';

const CELL    = 10;        // logical px per LED (12 × 10 = 120, 8 × 10 = 80)
const LED_ON  = '#fbbf24'; // amber-400 — Uno R4 matrix look
const LED_OFF = '#27272a'; // gray-800

function drawFrame(ctx, frame) {
    for (var r = 0; r < 8; r++) {
        for (var c = 0; c < 12; c++) {
            ctx.fillStyle = frame[r][c] ? LED_ON : LED_OFF;
            ctx.fillRect(c * CELL + 0.5, r * CELL + 0.5, CELL - 1, CELL - 1);
        }
    }
}

export default {
    name: 'LedMatrixDisplay',
    template: '#led-matrix-tpl',
    props: {
        simState: { type: Object, required: true }
    },
    mounted: function() {
        var self = this;
        var anim = makeInitialLedAnimationState();
        var ctx  = this.$refs.ledCanvas.getContext('2d');

        function frame() {
            var s = self.simState;
            if (s.id === 'LOCKED') {
                ctx.fillStyle = LED_OFF;
                ctx.fillRect(0, 0, 12 * CELL, 8 * CELL);
            } else {
                updateLedAnimationFrame(anim, s, Date.now());
                drawFrame(ctx, anim.frame);
            }
            self._rafId = requestAnimationFrame(frame);
        }
        frame();
    },
    unmounted: function() {
        if (this._rafId !== undefined) { cancelAnimationFrame(this._rafId); }
    }
};
