/**
 * routing.js — Shared wire-routing helpers
 * =========================================
 * Computes waypoint coordinates from component geometry so that moving a
 * component origin automatically recalculates every affected wire route.
 */

/**
 * Compute the X coordinate of the nth routing column in the gap between
 * two horizontally-adjacent components. Columns are evenly spaced.
 *
 * @param {{ origin: {x:number}, bounds: {width:number} }} fromComp
 * @param {{ origin: {x:number} }} toComp
 * @param {number} n — 1-based column index
 * @param {number} total — total number of columns needed in this gap
 * @returns {number} absolute X coordinate
 */
export function channelX(fromComp, toComp, n, total) {
    var gapStart = fromComp.origin.x + fromComp.bounds.width;
    var gapEnd = toComp.origin.x;
    var step = (gapEnd - gapStart) / (total + 1);
    return Math.round(gapStart + step * n);
}

/**
 * Build an SVG path `d` string for a horizontal-then-vertical route.
 * Goes from the start pin sideways to `via` (X), then vertically to the
 * target Y, then horizontally to the end pin.
 *
 * @param {{ absX:number, absY:number }} from — start pin
 * @param {{ absX:number, absY:number }} to   — end pin
 * @param {number} via — X coordinate of the vertical routing channel
 * @returns {string} SVG path d attribute
 */
export function routeHorizontal(from, to, via) {
    return `M ${from.absX},${from.absY} L ${via},${from.absY} L ${via},${to.absY} L ${to.absX},${to.absY}`;
}

/**
 * Build an SVG path `d` string for a vertical-then-horizontal route.
 *
 * @param {{ absX:number, absY:number }} from — start pin
 * @param {{ absX:number, absY:number }} to   — end pin
 * @param {number} via — Y coordinate of the horizontal routing channel
 * @returns {string} SVG path d attribute
 */
export function routeVertical(from, to, via) {
    return `M ${from.absX},${from.absY} L ${from.absX},${via} L ${to.absX},${via} L ${to.absX},${to.absY}`;
}
