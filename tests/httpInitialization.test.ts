// Set test environment variables FIRST so importing the server does not open a listening port.
process.env.TEST_ENV = "true";
process.env.NODE_ENV = "test";
process.env.FASTFOREX_API_KEY = "mock_test_key";
process.env.GEMINI_API_KEY = "super-secret-gemini-token";
process.env.OANDA_API_TOKEN = "super-secret-oanda-token";
process.env.OANDA_ACCOUNT_ID = "super-secret-account";

import test from "node:test";
import assert from "node:assert";
import http from "node:http";
import { app, resolveHttpPort, resolvePortFromArgv } from "../server";
import { stopFastForexSync } from "../server/dataSources/marketDataService";

test.after(() => {
  stopFastForexSync();
});

test("HTTP initialization uses default port 3000 when PORT is not provided", () => {
  assert.strictEqual(resolveHttpPort(undefined), 3000);
  assert.strictEqual(resolveHttpPort(""), 3000);
});

test("HTTP initialization accepts a valid PORT value", () => {
  assert.strictEqual(resolveHttpPort("8080"), 8080);
  assert.strictEqual(resolveHttpPort("65535"), 65535);
});

test("HTTP initialization rejects invalid PORT values", () => {
  for (const invalidPort of ["0", "65536", "3000.5", "abc", " 3000", "-1"]) {
    assert.throws(
      () => resolveHttpPort(invalidPort),
      /Invalid PORT: .* PORT must be an integer between 1 and 65535\./
    );
  }
});

test("HTTP initialization reads a separated --port CLI argument", () => {
  assert.strictEqual(resolvePortFromArgv(["--port", "8080"]), "8080");
  assert.strictEqual(resolvePortFromArgv(["-p", "8080"]), "8080");
});

test("HTTP initialization reads an inline --port CLI argument", () => {
  assert.strictEqual(resolvePortFromArgv(["--port=8080"]), "8080");
});

test("HTTP initialization falls back to PORT when CLI port is absent", () => {
  const cliPort = resolvePortFromArgv(["--inspect"]);
  assert.strictEqual(cliPort, undefined);
  assert.strictEqual(resolveHttpPort(cliPort ?? "4173"), 4173);
});

test("HTTP initialization rejects invalid CLI port values", () => {
  for (const argv of [["--port", "not-a-number"], ["--port=99999"]]) {
    assert.throws(
      () => resolveHttpPort(resolvePortFromArgv(argv)),
      /Invalid PORT: .* PORT must be an integer between 1 and 65535\./
    );
  }
});

test("GET /api/health returns stable UP response without external providers", async (t) => {
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));

  const port = (server.address() as { port: number }).port;
  const response = await fetch(`http://127.0.0.1:${port}/api/health`);
  const data = await response.json();

  assert.strictEqual(response.status, 200);
  assert.deepStrictEqual(Object.keys(data).sort(), ["environment", "ok", "status", "uptimeSeconds"].sort());
  assert.strictEqual(data.ok, true);
  assert.strictEqual(data.status, "UP");
  assert.strictEqual(data.environment, "test");
  assert.strictEqual(typeof data.uptimeSeconds, "number");
  assert.ok(data.uptimeSeconds >= 0);
});

test("GET /api/health does not expose sensitive information", async (t) => {
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));

  const port = (server.address() as { port: number }).port;
  const response = await fetch(`http://127.0.0.1:${port}/api/health`);
  const data = await response.json();
  const serialized = JSON.stringify(data).toLowerCase();

  assert.strictEqual(response.status, 200);
  assert.ok(!serialized.includes("secret"));
  assert.ok(!serialized.includes("token"));
  assert.ok(!serialized.includes("key"));
  assert.ok(!serialized.includes("account"));
  assert.ok(!serialized.includes("fastforex"));
  assert.ok(!serialized.includes("gemini"));
  assert.ok(!serialized.includes("oanda"));
});
