/**
 * useSnapshotComparison.js — Snapshot comparison composable
 * ==========================================================
 * Extracted from CompareAllSzenarios.html. Provides side-by-side
 * comparison of two BMP snapshot manifests loaded via fetch.
 *
 * Consumed by the browser-side Vue 3 global-build app (CDN).
 * Receives Vue APIs via dependency injection to avoid a second
 * Vue instance from a separate ESM import.
 *
 * All watchers are registered internally — the composable is
 * fully self-contained once created. Errors during compare-manifest
 * fetch are forwarded to the optional `onError` callback so the
 * host can display them.
 *
 * @example
 *   import { useSnapshotComparison } from '../docs/js/composables/useSnapshotComparison.js';
 *   const cmp = useSnapshotComparison(
 *       { ref, computed, watch },
 *       {
 *           baseUrl, snapshots, selectedSha, currentManifest,
 *           onError: (msg) => { error.value = msg; }
 *       }
 *   );
 */

// ── Helpers ──────────────────────────────────────────────────────────────

/**
 * Extract a numeric sort key from a scenario name so the merged
 * scenario list appears in a natural order.
 *
 * "1. Normalfahrt CW"            → 1
 * "H1. M2 stuck HIGH"            → 1001  (HW-fault group after normals)
 * "H13. Preset 1→2→1: …"        → 1013
 * Unrecognised patterns          → 9000  (tail)
 *
 * @param {string} name
 * @returns {number}
 */
function extractSortKey(name) {
    if (!name) return 9000;
    var hwMatch = name.match(/^H(\d+)\./);
    if (hwMatch) return 1000 + parseInt(hwMatch[1], 10);
    var numMatch = name.match(/^(\d+)\./);
    if (numMatch) return parseInt(numMatch[1], 10);
    return 9000;
}

// ── Build merged scenario list (pure function, no Vue dependency) ────────

/**
 * Build the union of two manifests' scenario arrays into a sorted list
 * suitable for side-by-side rendering.
 *
 * @param {object|null} manifestA — base manifest (with .scenarios array)
 * @param {object|null} manifestB — compare manifest
 * @returns {Array<{id:string, name:string, left:object|null, right:object|null, onlyOneSide:boolean}>}
 */
function buildMergedScenarios(manifestA, manifestB) {
    if (!manifestA || !manifestB) return [];

    var mapA = {};
    var mapB = {};

    for (var i = 0; i < manifestA.scenarios.length; i++) {
        mapA[manifestA.scenarios[i].id] = manifestA.scenarios[i];
    }
    for (var j = 0; j < manifestB.scenarios.length; j++) {
        mapB[manifestB.scenarios[j].id] = manifestB.scenarios[j];
    }

    var allIds = {};
    var keysA = Object.keys(mapA);
    var keysB = Object.keys(mapB);
    for (var ka = 0; ka < keysA.length; ka++) { allIds[keysA[ka]] = true; }
    for (var kb = 0; kb < keysB.length; kb++) { allIds[keysB[kb]] = true; }

    var idList = Object.keys(allIds);
    var result = [];
    for (var k = 0; k < idList.length; k++) {
        var id    = idList[k];
        var left  = mapA[id] || null;
        var right = mapB[id] || null;
        var name  = (left || right).name;
        result.push({
            id:          id,
            name:        name,
            left:        left,
            right:       right,
            onlyOneSide: !left || !right
        });
    }

    result.sort(function (a, b) {
        return extractSortKey(a.name) - extractSortKey(b.name);
    });

    return result;
}

// ── Composable ───────────────────────────────────────────────────────────

/**
 * @param {object}   vue — { ref, computed, watch } from the Vue global
 * @param {object}   opts
 * @param {string}   opts.baseUrl          — path prefix for BMP snapshot files
 * @param {import('vue').Ref<Array>}  opts.snapshots       — snapshot index entries
 * @param {import('vue').Ref<string>} opts.selectedSha     — currently selected base SHA
 * @param {import('vue').Ref<object>} opts.currentManifest — loaded base manifest
 * @param {(msg:string)=>void} [opts.onError]              — error callback for fetch failures
 * @returns {object} comparison state and methods
 */
export function useSnapshotComparison(vue, opts) {
    var ref      = vue.ref;
    var computed = vue.computed;
    var watch    = vue.watch;

    var baseUrl         = opts.baseUrl;
    var snapshots       = opts.snapshots;
    var selectedSha     = opts.selectedSha;
    var currentManifest = opts.currentManifest;
    var onError         = opts.onError || function () {};

    // ── Comparison state ───────────────────────────────────────────────

    /** @type {import('vue').Ref<boolean>} */
    var compareMode = ref(false);

    /** @type {import('vue').Ref<string|null>} */
    var compareSha = ref(null);

    /** @type {import('vue').Ref<object|null>} */
    var compareManifest = ref(null);

    // ── Fetch comparison manifest ──────────────────────────────────────

    /**
     * Fetch and parse the manifest for the given SHA.
     * Does NOT touch the global `loading` flag to avoid flickering
     * the base snapshot view while the comparison manifest loads.
     * Errors are forwarded to `onError`.
     *
     * @param {string|null} sha
     * @returns {Promise<void>}
     */
    async function loadCompareManifest(sha) {
        if (!sha) {
            compareManifest.value = null;
            return;
        }
        try {
            var resp = await fetch(baseUrl + sha + '/manifest.json');
            if (!resp.ok) throw new Error('HTTP ' + resp.status);
            compareManifest.value = await resp.json();
        } catch (err) {
            compareManifest.value = null;
            onError('Vergleichs-Snapshot "' + sha + '" nicht ladbar: ' + err.message);
        }
    }

    // ── Derived ────────────────────────────────────────────────────────

    /**
     * Snapshots eligible for comparison: all snapshots EXCEPT the
     * currently selected base SHA (no self-comparison).
     */
    var comparisonCandidates = computed(function () {
        return snapshots.value.filter(function (s) {
            return s.sha !== selectedSha.value;
        });
    });

    /**
     * Union of both manifests' scenarios, sorted, with per-side presence.
     * Reactive on both currentManifest and compareManifest.
     */
    var mergedScenarios = computed(function () {
        return buildMergedScenarios(currentManifest.value, compareManifest.value);
    });

    // ── Actions ────────────────────────────────────────────────────────

    /** Toggle comparison mode on/off. Resets state when leaving. */
    function toggleCompareMode() {
        compareMode.value = !compareMode.value;
        if (!compareMode.value) {
            compareSha.value = null;
            compareManifest.value = null;
        }
    }

    // ── Watchers (registered eagerly) ──────────────────────────────────

    /**
     * When the base SHA changes, clear the compare selection if it
     * now matches the base (self-comparison guard).
     */
    watch(selectedSha, function (sha) {
        if (compareMode.value && compareSha.value === sha) {
            compareSha.value = null;
            compareManifest.value = null;
        }
    });

    /** Load the comparison manifest whenever the compare SHA changes. */
    watch(compareSha, function (sha) {
        loadCompareManifest(sha);
    });

    // ── Public API ─────────────────────────────────────────────────────

    return {
        // state
        compareMode:          compareMode,
        compareSha:           compareSha,
        compareManifest:      compareManifest,

        // derived
        comparisonCandidates: comparisonCandidates,
        mergedScenarios:      mergedScenarios,

        // actions
        toggleCompareMode:    toggleCompareMode,

        // utilities
        /** Build a BMP URL for a given filename + SHA. */
        bmpUrl: function (filename, sha) {
            return baseUrl + sha + '/' + filename;
        }
    };
}
