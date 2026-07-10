# Interactive Docs — Developer Readme

Zero-build Vue 3 app (ES modules + DOM templates). Simulates the motor-controller state machine with an interactive SVG wiring schematic.

## File Tree

```
docs/
├── InteractiveDocumentation.html  ← HTML shell: <template> elements, CSS, Vue CDN
├── honey_config.js                            ← JS mirror of C++ config.h + speed_dataset.cpp
├── honey_state_machine.js                     ← Pure state machine (6 states, no DOM/Vue deps)
│
├── js/
│   ├── app.js                                 ← Bootstrap: createApp, register components, mount
│   ├── composables/
│   │   ├── useSimulation.js                   ← Reactive bridge: state machine ↔ Vue (swap for real HW)
│   │   └── useBmpSimulation.js                ← Headless batch simulator for BMP export
│   ├── components/
│   │   ├── SchematicCanvas.js                 ← SVG coordinator: registers 7 schematic sub-components
│   │   ├── wires.js                           ← ALL wire path defs + junction dots + WiringTable metadata
│   │   ├── pinLayout.js                       ← Re-export barrel (legacy compat — prefer schematic/ imports)
│   │   ├── WiringTable.js                     ← Auto-generated from WIRE_DEFS (filters wires with `purpose`)
│   │   ├── ControlPanel.js                    ← Buttons + X2 lock switch
│   │   ├── StatusDisplay.js                   ← State dot, status text, ramp progress bar
│   │   └── StateMachineLegend.js              ← 6-state reference with active highlight
│   │
│   ├── lib/
│   │   ├── simulationScenarios.js             ← 41 scenario definitions + BMP color palette
│   │   ├── hardwareFaultScenarios.js          ← Hardware fault injection scenarios (H1–H13)
│   │   ├── bmpWriter.js                       ← Pure BMP byte-stream writer (browser + Node.js)
│   │   └── hardware_fault_injector.js         ← Relay fault model (STUCK_AT, GLITCH, CROSSTALK, …)
│   │
│   └── schematic/                             ← Per-component: origin, bounds, pins, SVG template
│       ├── Arduino.js
│       ├── RelayBank.js
│       ├── MotorDriver.js
│       ├── KeypadDirection.js
│       ├── KeypadControl.js
│       ├── WagoBus.js
│       ├── ManualSwitch.js
│       └── routing.js                         ← channelX(), routeHorizontal() — derived waypoints

../VisualizeStateTransitions/
├── SequenzeVisualizer.html                    ← Single-scenario BMP generator (Vue 3 + Canvas)
├── CompareAllSzenarios.html                   ← Snapshot viewer: dense 1:1 table, multi-version
├── generate_all_bmps.js                       ← npm run snapshot: headless batch → bmp_snapshots/
└── bmp_snapshots/<sha>/                       ← Generated BMPs + manifest.json (gitignored)
```

## Data Flow

```
honey_config.js ──→ useSimulation() ──→ reactive simState ──→ Vue components
                        ↑                                      │
                   sm.tick(inputs)                              │
                        ↑                                      ↓
              user button press ←── @events ─── ControlPanel
```

### BMP Snapshot Pipeline

`npm run snapshot` → `generate_all_bmps.js` runs all 41 scenarios headless through `useBmpSimulation.js` → `bmpWriter.js` → versioned BMP folder. The viewer (`CompareAllSzenarios.html`) renders the latest snapshot as a dense 1:1 table.

> Full pipeline diagram, directory layout, and technical details: [ImplementationQuestions.md](../VisualizeStateTransitions/ImplementationQuestions.md#10-snapshot-system)

## Concepts

### Component-based separation
Each visual component (`schematic/*.js`) owns its **origin**, **bounds**, **pins** (with `absX`/`absY`), and **SVG template**. Things that change together live together — moving a component means editing one file.

### Derived wire waypoints
`routing.js` computes routing columns from component bounds (`channelX()`, `routeHorizontal()`). No hardcoded magic numbers. If you move a component, all wires re-route automatically.

### Auto-generated WiringTable
Every wire in `wires.js` that carries a `purpose` field auto-generates a row in the WiringTable component. Add `quelle`, `quellePin`, `ziel`, `purpose`, `color` (and optional `muted`) to make a wire appear in the table. No separate table data to keep in sync.

### Zero build step
ES modules + DOM `<template>` elements. Serve the directory with any static HTTP server.

## Where to Change What

| Task | Files to touch |
|---|---|
| **Move a component** | Its `schematic/<Component>.js` — change `origin`. Wires follow automatically. |
| **Add a component** | New `schematic/<Name>.js` + register in `SchematicCanvas.js` + wire it in `wires.js` |
| **Change a pin assignment** | `honey_config.js` + the component file in `schematic/`. WiringTable updates automatically. |
| **Add/edit a wire** | `wires.js` — use `routeHorizontal()` or manual paths. Add table fields if it should appear in WiringTable. |
| **Edit a component's SVG look** | Its `schematic/<Component>.js` — the `component.template` string. |
| **Change ramp timing** | `honey_config.js` (mirrors C++ `config.h`; change C++ first). |
| **Change state machine logic** | `honey_state_machine.js` — zero DOM/Vue deps, unit-testable. |
| **Swap simulation for real HW** | Replace `useSimulation.js` — no component changes needed. |
| **Add a simulation scenario** | `simulationScenarios.js` or `hardwareFaultScenarios.js` — no code changes needed elsewhere. |
| **Generate version snapshots** | `npm run snapshot` — runs `generate_all_bmps.js`, writes to `bmp_snapshots/<sha>/`. |
| **Compare two versions** | Open `CompareAllSzenarios.html` (📋 tab) — load two snapshot SHAs side-by-side. |
| **Change BMP color palette** | `simulationScenarios.js` → `STATE_COLORS`, `EVENT_COLOR`, `HW_FAULT_COLOR`. |
