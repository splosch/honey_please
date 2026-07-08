/**
 * WiringTable.js — Static wiring connection table
 * ===============================================
 * Pure presentational. The table data is a static array of row objects,
 * matching the Verkabelungsliste in the original HTML.
 */
export default {
    name: 'WiringTable',
    template: '#wiring-table-tpl',
    data: function() {
        return {
            rows: [
                {
                    quelle: 'Folientaster 1 (Richtung)',
                    pin: 'Pin 1 (Masse)',
                    ziel: 'Arduino <strong class="text-gray-300">GND</strong> (Masserückleitung)',
                    zweck: 'Gemeinsame Masse für den Richtungsschalter',
                    color: 'text-purple-400'
                },
                {
                    quelle: 'Folientaster 1 (Links)',
                    pin: 'Pin 2',
                    ziel: 'Arduino <strong class="text-purple-300">D4</strong>',
                    zweck: 'Standby: Linkslauf (CCW) vorwählen · Im Betrieb (CW): Richtungswechsel → Bremsrampe → Auto-Neustart CCW',
                    color: 'text-purple-400'
                },
                {
                    quelle: 'Folientaster 1 (Rechts)',
                    pin: 'Pin 3',
                    ziel: 'Arduino <strong class="text-purple-300">D5</strong>',
                    zweck: 'Standby: Rechtslauf (CW) vorwählen · Im Betrieb (CCW): Richtungswechsel → Bremsrampe → Auto-Neustart CW',
                    color: 'text-purple-400'
                },
                {
                    quelle: 'Folientaster 2 (Steuerung)',
                    pin: 'Pin 1 (Masse)',
                    ziel: 'Folientaster 1 <strong class="text-gray-300">GND Pin 1</strong>',
                    zweck: 'Masseweiterleitung (Daisy-Chain)',
                    color: 'text-emerald-400',
                    muted: true
                },
                {
                    quelle: 'Folientaster 2 (Rot)',
                    pin: 'Pin 2',
                    ziel: 'Arduino <strong class="text-emerald-300">D6</strong>',
                    zweck: 'STOP – aktiv in ANLAUFEN &amp; LÄUFT: Bremsrampe (15 s) → Standby',
                    color: 'text-emerald-400',
                    muted: true
                },
                {
                    quelle: 'Folientaster 2 (Gelb 1)',
                    pin: 'Pin 3',
                    ziel: 'Arduino <strong class="text-emerald-300">D7</strong>',
                    zweck: 'Programmtaster 1 / Geschwindigkeit 1',
                    color: 'text-emerald-400',
                    muted: true
                },
                {
                    quelle: 'Folientaster 2 (Gelb 2)',
                    pin: 'Pin 4',
                    ziel: 'Arduino <strong class="text-emerald-300">D8</strong>',
                    zweck: 'Programmtaster 2 / Geschwindigkeit 2',
                    color: 'text-emerald-400',
                    muted: true
                },
                {
                    quelle: 'Folientaster 2 (Grün)',
                    pin: 'Pin 5',
                    ziel: 'Arduino <strong class="text-emerald-300">D9</strong>',
                    zweck: 'START – nur in STANDBY: REL1 (X1) AN → Anlauframpe 15 s → LÄUFT',
                    color: 'text-emerald-400',
                    muted: true
                },
                {
                    quelle: 'Arduino D4 (Relais M1)',
                    pin: 'D4',
                    ziel: '4-Kanal Relais-Bank <strong class="text-amber-300">Kanal 3 IN</strong> → Treiber <strong class="text-amber-300">M1</strong>',
                    zweck: 'Speed Bit 0 – selektiert dAtA-Preset (mit M2): LOW/LOW=dAtA0(750), LOW/HIGH=dAtA4(2500)',
                    color: 'text-amber-400'
                },
                {
                    quelle: 'Arduino D5 (Relais M2)',
                    pin: 'D5',
                    ziel: '4-Kanal Relais-Bank <strong class="text-amber-300">Kanal 4 IN</strong> → Treiber <strong class="text-amber-300">M2</strong>',
                    zweck: 'Speed Bit 1 – HIGH bei Preset 2 (Gelb-2 / dAtA 4 / 2500 r/min)',
                    color: 'text-amber-400'
                },
                {
                    quelle: 'Treiber M0 (Hardwire)',
                    pin: 'M0',
                    ziel: 'Treiber <strong class="text-gray-300">IN-COM</strong> (GND)',
                    zweck: 'Fest auf GND verdrahtet (LOW) – Binär-Adressierung: M0=0, M1/M2 variabel',
                    color: 'text-gray-400',
                    muted: true
                }
            ]
        };
    }
};
