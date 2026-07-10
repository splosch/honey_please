/**
 * WiringTable.js — Auto-generated wiring connection table
 * =======================================================
 * Rows are derived from WIRE_DEFS (single source of truth).
 * Every wire with a `purpose` field generates a table row.
 * Changing a pin assignment in the wire definition automatically
 * updates the table — no stale data possible.
 *
 * Pure presentational. The table data is a computed property
 * derived from the wire definitions in wires.js.
 */
import { WIRE_DEFS } from './wires.js';

export default {
    name: 'WiringTable',
    template: '#wiring-table-tpl',
    computed: {
        rows: function() {
            return WIRE_DEFS
                .filter(function(w) { return w.purpose; })
                .map(function(w) {
                    return {
                        quelle: w.quelle,
                        pin:    w.quellePin,
                        ziel:   w.ziel,
                        zweck:  w.purpose,
                        color:  w.color,
                        muted:  w.muted || false
                    };
                });
        }
    }
};
