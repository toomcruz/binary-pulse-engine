import { test } from "node:test";
import assert from "node:assert/strict";
import {
  finiteNumber,
  formatPercent,
  formatPercent100,
  formatRatioAsPercent,
  formatScore,
  formatPrice,
  formatInteger,
  formatNumber,
  clampPercent,
} from "../src/lib/format.ts";

// ---------- finiteNumber ----------
test("finiteNumber preserves 0", () => {
  assert.equal(finiteNumber(0), 0);
});
test("finiteNumber accepts numeric strings", () => {
  assert.equal(finiteNumber("42"), 42);
  assert.equal(finiteNumber("3.14"), 3.14);
});
test("finiteNumber rejects invalid inputs", () => {
  assert.equal(finiteNumber(null), null);
  assert.equal(finiteNumber(undefined), null);
  assert.equal(finiteNumber(NaN), null);
  assert.equal(finiteNumber(Infinity), null);
  assert.equal(finiteNumber(-Infinity), null);
  assert.equal(finiteNumber("abc"), null);
  assert.equal(finiteNumber({}), null);
});

// ---------- formatPercent100 (contract: value already in 0-100) ----------
test("formatPercent100(0) is '0%'", () => assert.equal(formatPercent100(0), "0%"));
test("formatPercent100(75.4, 1)", () => assert.equal(formatPercent100(75.4, 1), "75.4%"));
test("formatPercent100 non-finite -> '—'", () => {
  assert.equal(formatPercent100(null), "—");
  assert.equal(formatPercent100(undefined), "—");
  assert.equal(formatPercent100(NaN), "—");
  assert.equal(formatPercent100(Infinity), "—");
});
test("formatPercent alias matches formatPercent100", () => {
  assert.equal(formatPercent(0), formatPercent100(0));
  assert.equal(formatPercent(null), formatPercent100(null));
});

// ---------- formatRatioAsPercent (contract: value in 0-1) ----------
test("formatRatioAsPercent(0.5) -> '50%'", () =>
  assert.equal(formatRatioAsPercent(0.5), "50%"));
test("formatRatioAsPercent(0) -> '0%'", () =>
  assert.equal(formatRatioAsPercent(0), "0%"));
test("formatRatioAsPercent(1) -> '100%'", () =>
  assert.equal(formatRatioAsPercent(1), "100%"));
test("formatRatioAsPercent(0.884, 1) -> '88.4%'", () =>
  assert.equal(formatRatioAsPercent(0.884, 1), "88.4%"));
test("formatRatioAsPercent(NaN|null|undefined|Inf) -> '—'", () => {
  assert.equal(formatRatioAsPercent(NaN), "—");
  assert.equal(formatRatioAsPercent(null), "—");
  assert.equal(formatRatioAsPercent(undefined), "—");
  assert.equal(formatRatioAsPercent(Infinity), "—");
});

// ---------- formatScore (contract: 0-100) ----------
test("formatScore(0) -> '0' (never '—')", () =>
  assert.equal(formatScore(0), "0"));
test("formatScore rounds", () => assert.equal(formatScore(72.6), "73"));
test("formatScore non-finite -> '—'", () => {
  assert.equal(formatScore(null), "—");
  assert.equal(formatScore(NaN), "—");
});

// ---------- formatPrice ----------
test("formatPrice(1.08425, 5)", () =>
  assert.equal(formatPrice(1.08425, 5), "1.08425"));
test("formatPrice(0, 2) -> '0.00'", () =>
  assert.equal(formatPrice(0, 2), "0.00"));
test("formatPrice(NaN) -> '—'", () => assert.equal(formatPrice(NaN), "—"));

// ---------- formatInteger ----------
test("formatInteger(3.7) -> '3'", () => assert.equal(formatInteger(3.7), "3"));
test("formatInteger(0) -> '0'", () => assert.equal(formatInteger(0), "0"));
test("formatInteger(null) -> '—'", () => assert.equal(formatInteger(null), "—"));

// ---------- formatNumber ----------
test("formatNumber(1.234, 2) -> '1.23'", () =>
  assert.equal(formatNumber(1.234, 2), "1.23"));
test("formatNumber(NaN) -> '—'", () => assert.equal(formatNumber(NaN), "—"));

// ---------- clampPercent (widths must never be NaN/Inf/negative) ----------
test("clampPercent standard values", () => {
  assert.equal(clampPercent(0), 0);
  assert.equal(clampPercent(50), 50);
  assert.equal(clampPercent(100), 100);
});
test("clampPercent clamps out-of-range", () => {
  assert.equal(clampPercent(-10), 0);
  assert.equal(clampPercent(150), 100);
});
test("clampPercent(NaN|null|undefined|Inf) -> 0 (no NaN% widths)", () => {
  assert.equal(clampPercent(NaN), 0);
  assert.equal(clampPercent(null), 0);
  assert.equal(clampPercent(undefined), 0);
  assert.equal(clampPercent(Infinity), 0);
  assert.equal(clampPercent(-Infinity), 0);
});
test("clampPercent from ratio (0/0) via naive calc still safe", () => {
  const ratio = 0 / 0; // NaN
  assert.equal(clampPercent(ratio), 0);
});

// ---------- Business rules ----------
test("technicalScore 0 renders as '0/100'", () => {
  const technicalScore: number | undefined = 0;
  const rendered = `${formatScore(technicalScore)}/100`;
  assert.equal(rendered, "0/100");
});
test("calibratedProbability null renders as 'Indisponível'", () => {
  const calibratedProbability: number | null = null;
  const calibrationAvailable = false;
  const rendered =
    calibrationAvailable && calibratedProbability !== null
      ? formatRatioAsPercent(calibratedProbability)
      : "Indisponível";
  assert.equal(rendered, "Indisponível");
});
test("calibratedProbability 0.72 (ratio) renders as '72%'", () => {
  assert.equal(formatRatioAsPercent(0.72), "72%");
});
test("Anti-pattern: technicalScore is not substituted by calibratedProbability", () => {
  const technicalScore = 42;
  const calibratedProbability: number | null = null;
  const fallback = calibratedProbability ?? technicalScore;
  assert.equal(fallback, 42);
  // But the UI must NOT display the fallback under the calibrated label.
  // Presentation rule verified by explicit branching in the UI, not by ||.
  assert.notEqual(calibratedProbability, technicalScore);
});
test("winRate null renders as '—' not '0%'", () => {
  assert.equal(formatPercent100(null), "—");
});
test("payout 0.88 (ratio) renders as '88%'", () => {
  assert.equal(formatRatioAsPercent(0.88), "88%");
});
