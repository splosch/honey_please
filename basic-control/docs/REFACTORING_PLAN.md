# Refactoring Status: ErsteInbetriebnahmeMotorundSteuerung.html

## Completed (2026-07-08)

Split the 780-line monolithic HTML into modular Vue 3 components using
**ES modules + `<template>` elements** — zero build step, native browser support.

## Architecture

```
basic-control/docs/
├── ErsteInbetriebnahmeMotorundSteuerung.html   ← thin shell (~40 lines body + 6 <template> elements)
├── honey_config.js                              ← ES module: export default HoneyConfig
├── honey_state_machine.js                       ← ES module: export default HoneyStateMachine
│
├── js/
│   ├── app.js                                   ← single entry point (type="module")
│   ├── composables/
│   │   └── useSimulation.js                     ← wraps HoneyStateMachine, exposes reactive state
│   │
│   └── components/
│       ├── ControlPanel.js                      ← buttons, X2 switch (template: #control-panel-tpl)
│       ├── StatusDisplay.js                     ← state dot, text, ramp bar (template: #status-display-tpl)
│       ├── StateMachineLegend.js                ← 6-state reference (template: #state-machine-legend-tpl)
│       ├── SchematicCanvas.js                   ← SVG root with data-driven wires (template: #schematic-canvas-tpl)
│       ├── WiringTable.js                       ← connection table (template: #wiring-table-tpl)
│       └── wires.js                             ← wire path definitions + junction dots (named exports)
```

## Data Flow

```
honey_config.js ──→ useSimulation() ──→ reactive simState ──→ Vue components
                        ↑                                      │
                   sm.tick(inputs)                              │
                        ↑                                      ↓
                   user button press ←── @events ─── ControlPanel
```

## What Changed

### Before (IIFE + string templates)
- 11 `<script>` tags loaded in specific order via globals (`window.HoneyComponents.*`)
- All HTML templates were JS string concatenation (`'<div>' + '<span>' + ...`)
- No syntax highlighting or multi-line editing for templates
- Manual dependency order management

### After (ES modules + DOM templates)
- **1** `<script type="module">` entry point — dependencies resolved via `import`/`export`
- All HTML templates live in `<template id="...">` elements — real HTML with proper indentation
- SVG elements use explicit closing tags (no self-closing syntax) for HTML5 parser compatibility
- Components use kebab-case in DOM templates (`<control-panel>`, `<status-display>`, etc.)
- Vue 3 auto-matches PascalCase component registrations to kebab-case DOM usage

## Key Abstraction: useSimulation composable

This is the swappable bridge. To go from simulation → real hardware:
replace `useSimulation` with `useHardwareBridge` — same reactive interface,
components don't change.

## How to Test

ES modules require a local server (CORS policy blocks `file://` imports):

```bash
cd basic-control/docs
npx serve .           # or: python -m http.server 8000
# Open http://localhost:3000 (or 8000) in browser
```
