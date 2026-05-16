/**
 * Arduino Uno R4 WiFi – Self-Check Script
 * =========================================
 * Verifies that the board is reachable and the WebSocket API is functional.
 *
 * Checks:
 *   1. HTTP GET /status  → expects HTTP 200 + JSON body
 *   2. WebSocket /ws     → connects successfully
 *   3. WebSocket read    → receives at least one JSON frame (10 Hz, ~200 ms wait)
 *
 * Usage:
 *   node tests/selfcheck.js <board-ip>
 *   node tests/selfcheck.js 192.168.1.42
 *
 * Prerequisites:
 *   cd tests && npm install ws
 */

const http = require("http");
const WebSocket = require("ws");

const IP = process.argv[2];
if (!IP) {
  console.error("Usage: node tests/selfcheck.js <board-ip>");
  process.exit(1);
}

const HTTP_URL = `http://${IP}/status`;
const WS_URL   = `ws://${IP}/ws`;
const TIMEOUT_MS = 7000;

let results = { http: "FAIL", wsConnect: "FAIL", wsRead: "FAIL" };

function printResult() {
  console.log("\n--- SELFCHECK RESULT ---");
  console.log(`HTTP  GET /status : ${results.http === "OK" ? "[OK]" : "[FAIL]"} ${results.http}`);
  console.log(`WS    Connect /ws : ${results.wsConnect === "OK" ? "[OK]" : "[FAIL]"} ${results.wsConnect}`);
  console.log(`WS    Read frame  : ${results.wsRead === "OK" ? "[OK]" : "[FAIL]"} ${results.wsRead}`);

  const allOk = Object.values(results).every((v) => v === "OK");
  console.log(`\n[SELFCHECK ${allOk ? "PASSED" : "FAILED"}] IP: ${IP}`);
  process.exit(allOk ? 0 : 1);
}

// --- Step 1: HTTP /status ---
console.log(`[1/3] HTTP GET ${HTTP_URL} ...`);
const req = http.get(HTTP_URL, { timeout: 5000 }, (res) => {
  let body = "";
  res.on("data", (chunk) => { body += chunk; });
  res.on("end", () => {
    if (res.statusCode === 200) {
      try {
        JSON.parse(body);
        results.http = "OK";
        console.log(`      → HTTP 200 OK (valid JSON, ${body.length} bytes)`);
      } catch (_) {
        results.http = `HTTP 200 but body is not valid JSON`;
        console.log(`      → HTTP 200 but body is not JSON: ${body.slice(0, 80)}`);
      }
    } else {
      results.http = `HTTP ${res.statusCode}`;
      console.log(`      → HTTP ${res.statusCode} FAIL`);
    }
    runWebSocketCheck();
  });
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

// --- Steps 2 & 3: WebSocket ---
function runWebSocketCheck() {
  console.log(`[2/3] WebSocket ${WS_URL} ...`);

  const ws = new WebSocket(WS_URL);
  const deadline = setTimeout(() => {
    results.wsRead = "TIMEOUT – no frame received within 7 s";
    console.log("      → TIMEOUT waiting for frame");
    ws.terminate();
    printResult();
  }, TIMEOUT_MS);

  ws.on("open", () => {
    results.wsConnect = "OK";
    console.log("      → Connected");
    console.log("[3/3] Waiting for WebSocket frame ...");
  });

  ws.on("message", (data) => {
    const msg = data.toString();
    try {
      JSON.parse(msg);
      results.wsRead = "OK";
      console.log(`      → Received: ${msg.slice(0, 120)}${msg.length > 120 ? "..." : ""}`);
    } catch (_) {
      results.wsRead = `Non-JSON frame: ${msg.slice(0, 60)}`;
      console.log(`      → Non-JSON frame: ${msg.slice(0, 60)}`);
    }
    clearTimeout(deadline);
    ws.terminate();
    printResult();
  });

  ws.on("error", (e) => {
    if (results.wsConnect !== "OK") {
      results.wsConnect = e.message;
      console.log(`      → Connect ERROR: ${e.message}`);
    }
    results.wsRead = "No frame (connection failed)";
    clearTimeout(deadline);
    printResult();
  });
}

