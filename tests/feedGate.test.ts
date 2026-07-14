import assert from "node:assert/strict";
import test from "node:test";
import { isFeedOperational, isValidPrice } from "../src/lib/feedGate";

test("feed configured, connected and fresh is operational", () => {
  assert.equal(isFeedOperational({
    configured: true,
    connected: true,
    isStaleData: false,
    error: null
  }), true);
});

test("stale feed is not operational", () => {
  assert.equal(isFeedOperational({
    configured: true,
    connected: true,
    isStaleData: true,
    error: null
  }), false);
});

test("disconnected feed is not operational", () => {
  assert.equal(isFeedOperational({
    configured: true,
    connected: false,
    isStaleData: false,
    error: null
  }), false);
});

test("unconfigured feed is not operational", () => {
  assert.equal(isFeedOperational({
    configured: false,
    connected: true,
    isStaleData: false,
    error: null
  }), false);
});

test("feed with an error is not operational", () => {
  assert.equal(isFeedOperational({
    configured: true,
    connected: true,
    isStaleData: false,
    error: "PROVIDER_ERROR"
  }), false);
});

test("feed with an empty error is operational", () => {
  assert.equal(isFeedOperational({
    configured: true,
    connected: true,
    isStaleData: false,
    error: ""
  }), true);
});

test("missing feed health is not operational", () => {
  assert.equal(isFeedOperational(undefined), false);
});

test("partial feed health is not operational", () => {
  assert.equal(isFeedOperational({ configured: true }), false);
});

test("positive finite price is valid", () => {
  assert.equal(isValidPrice(1.138015), true);
});

test("large positive finite price is valid", () => {
  assert.equal(isValidPrice(65000), true);
});

test("zero price is invalid", () => {
  assert.equal(isValidPrice(0), false);
});

test("negative price is invalid", () => {
  assert.equal(isValidPrice(-1), false);
});

test("NaN price is invalid", () => {
  assert.equal(isValidPrice(Number.NaN), false);
});

test("infinite price is invalid", () => {
  assert.equal(isValidPrice(Number.POSITIVE_INFINITY), false);
});

test("missing and non-number prices are invalid", () => {
  assert.equal(isValidPrice(undefined), false);
  assert.equal(isValidPrice(null), false);
  assert.equal(isValidPrice("1.138015"), false);
});
