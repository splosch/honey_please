/**
 * ESP32 Self-Check Script
 * ========================
 * Prüft HTTP-Erreichbarkeit, WebSocket Read und WebSocket Write des WebSerial-Interfaces.
 * Ausführen: node tests/selfcheck.js [IP]
 *
 * Voraussetzung: npm install ws  (einmalig im Projektordner oder global)
 * Beispiel:      node tests/selfcheck.js 192.168.178.64
 */

const http = require("http");
const WebSocket = require("ws");

const IP = process.argv[2] || "192.168.178.64";
const HTTP_URL = `http://${IP}/webserial`;
const WS_URL = `ws://${IP}/wserial`;
const TIMEOUT_MS = 7000;

let results = { http: "FAIL", wsWrite: "FAIL", wsRead: "FAIL" };

function printResult() {
  console.log("\n--- SELFCHECK RESULT ---");
  console.log(
    `HTTP  /webserial : ${results.http === "OK" ? "[OK]" : "[FAIL]"} ${results.http}`
  );
  console.log(
    `WS    Write      : ${results.wsWrite === "OK" ? "[OK]" : "[FAIL]"} ${results.wsWrite}`
  );
  console.log(
    `WS    Read       : ${results.wsRead === "OK" ? "[OK]" : "[FAIL]"} ${results.wsRead}`
  );

  const allOk = Object.values(results).every((v) => v === "OK");
  console.log(
    `\n[SELFCHECK ${allOk ? "PASSED" : "FAILED"}] IP: ${IP}`
  );
  process.exit(allOk ? 0 : 1);
}

// --- Step 1: HTTP Check ---
console.log(`[1/3] HTTP GET ${HTTP_URL} ...`);
const req = http.get(HTTP_URL, { timeout: 5000 }, (res) => {
  if (res.statusCode === 200) {
    results.http = "OK";
    console.log(`      → HTTP ${res.statusCode} OK`);
  } else {
    results.http = `HTTP ${res.statusCode}`;
    console.log(`      → HTTP ${res.statusCode} FAIL`);
  }
  res.resume();
  runWebSocketCheck();
});

req.on("error", (e) => {
  results.http = e.message;
  console.log(`      → ERROR: ${e.message}`);
  runWebSocketCheck();
});

req.on("timeout", () => {
  results.http = "TIMEOUT";
  console.log("      → TIMEOUT");
  req.destroy();
  runWebSocketCheck();
});

// --- Step 2 & 3: WebSocket Write + Read ---
function runWebSocketCheck() {
  console.log(`[2/3] WS Connect ${WS_URL} ...`);
  const ws = new WebSocket(WS_URL);
  let readReceived = false;

  const timer = setTimeout(() => {
    if (!readReceived) {
      results.wsRead = "TIMEOUT (no message in 7s)";
      console.log("      → Read TIMEOUT");
    }
    ws.terminate();
    printResult();
  }, TIMEOUT_MS);

  ws.on("open", () => {
    console.log("      → Connected");
    console.log("[3/3] WS Write: sending 'SELFCHECK_PING' ...");
    ws.send("SELFCHECK_PING", (err) => {
      if (err) {
        results.wsWrite = err.message;
        console.log(`      → Write ERROR: ${err.message}`);
      } else {
        results.wsWrite = "OK";
        console.log("      → Write OK");
      }
    });
  });

  ws.on("message", (data) => {
    if (!readReceived) {
      readReceived = true;
      results.wsRead = "OK";
      console.log(`      → Read OK: "${data.toString().trim().slice(0, 80)}"`);
      clearTimeout(timer);
      ws.terminate();
      printResult();
    }
  });

  ws.on("error", (e) => {
    results.wsWrite = e.message;
    results.wsRead = e.message;
    console.log(`      → WS ERROR: ${e.message}`);
    clearTimeout(timer);
    printResult();
  });
}
