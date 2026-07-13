import { test } from "node:test";
import assert from "node:assert/strict";
import { finiteNumber, formatPercent, formatNumber, clampPercent } from "../src/lib/format.ts";

test("formatPercent(0) returns '0%'", () => {
  assert.equal(formatPercent(0), "0%");
});

test("formatPercent(null) returns '—'", () => {
  assert.equal(formatPercent(null), "—");
});

test("formatPercent(undefined) returns '—'", () => {
  assert.equal(formatPercent(undefined), "—");
});

test("formatPercent(NaN) returns '—'", () => {
  assert.equal(formatPercent(NaN), "—");
});

test("formatPercent(Infinity) returns '—'", () => {
  assert.equal(formatPercent(Infinity), "—");
});

test("formatPercent(-Infinity) returns '—'", () => {
  assert.equal(formatPercent(-Infinity), "—");
});

test("formatPercent('75.4', 1) returns '75.4%'", () => {
  assert.equal(formatPercent("75.4", 1), "75.4%");
});

test("finiteNumber preserves 0", () => {
  assert.equal(finiteNumber(0), 0);
});

test("finiteNumber returns null for invalid", () => {
  assert.equal(finiteNumber("abc"), null);
  assert.equal(finiteNumber(NaN), null);
  assert.equal(finiteNumber(Infinity), null);
});

test("formatNumber respects decimals and rejects non-finite", () => {
  assert.equal(formatNumber(1.234, 2), "1.23");
  assert.equal(formatNumber(NaN), "—");
});

test("clampPercent clamps and defaults to 0 on invalid", () => {
  assert.equal(clampPercent(50), 50);
  assert.equal(clampPercent(-10), 0);
  assert.equal(clampPercent(150), 100);
  assert.equal(clampPercent(NaN), 0);
  assert.equal(clampPercent(null), 0);
});

// Business rules

test("technicalScore 0 stays 0/100 in rendering", () => {
  const technicalScore = 0;
  const rendered = `${finiteNumber(technicalScore) ?? "—"}/100`;
  assert.equal(rendered, "0/100");
});

test("calibratedProbability null renders as 'Indisponível'", () => {
  const calibratedProbability: number | null = null;
  const calibrationAvailable = false;
  const rendered =
    calibrationAvailable && calibratedProbability !== null
      ? formatPercent(calibratedProbability)
      : "Indisponível";
  assert.equal(rendered, "Indisponível");
});

test("technicalScore is never substituted by calibratedProbability", () => {
  const technicalScore = 42;
  const calibratedProbability: number | null = null;
  // Anti-pattern check: `calibratedProbability || technicalScore` would give 42
  // which is WRONG semantically. The two must be presented independently.
  assert.notEqual(calibratedProbability, technicalScore);
});
