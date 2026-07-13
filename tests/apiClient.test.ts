import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  apiRequest,
  ApiRequestError,
  normalizeApiError,
} from "../src/lib/apiClient.ts";

// ---------- fetch mock ----------
type FetchImpl = typeof fetch;
const realFetch: FetchImpl | undefined = (globalThis as any).fetch;

function mockResponse(init: {
  status?: number;
  body?: string;
  headers?: Record<string, string>;
}): Response {
  const status = init.status ?? 200;
  return new Response(init.body ?? "", {
    status,
    headers: init.headers ?? {},
  });
}

function installFetch(handler: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>) {
  (globalThis as any).fetch = handler as unknown as FetchImpl;
}

beforeEach(() => {
  (globalThis as any).__fetchCalls = [];
});

afterEach(() => {
  (globalThis as any).fetch = realFetch;
});

// ---------- happy path ----------

test("HTTP 200 with JSON body returns parsed payload", async () => {
  installFetch(async () => mockResponse({ status: 200, body: JSON.stringify({ ok: true, value: 42 }) }));
  const result = await apiRequest<{ ok: boolean; value: number }>("/api/x");
  assert.deepEqual(result, { ok: true, value: 42 });
});

test("HTTP 200 with empty body returns null payload", async () => {
  installFetch(async () => mockResponse({ status: 200, body: "" }));
  const result = await apiRequest<null>("/api/x");
  assert.equal(result, null);
});

test("Default method is GET; POST is preserved", async () => {
  let observed: string | undefined;
  installFetch(async (_url, init) => {
    observed = (init?.method ?? "GET").toUpperCase();
    return mockResponse({ status: 200, body: "{}" });
  });
  await apiRequest("/api/x");
  assert.equal(observed, "GET");
  await apiRequest("/api/x", { method: "POST" });
  assert.equal(observed, "POST");
});

// ---------- error path: HTTP failures ----------

test("HTTP 400 becomes ApiRequestError with endpoint/method/status/error/message", async () => {
  installFetch(async () =>
    mockResponse({
      status: 400,
      body: JSON.stringify({ error: "BAD_INPUT", message: "campo obrigatório" }),
    })
  );
  await assert.rejects(
    apiRequest("/api/x", { method: "POST" }),
    (err: unknown) => {
      assert.ok(err instanceof ApiRequestError);
      const details = (err as ApiRequestError).toDetails();
      assert.equal(details.endpoint, "/api/x");
      assert.equal(details.method, "POST");
      assert.equal(details.status, 400);
      assert.equal(details.error, "BAD_INPUT");
      assert.equal(details.message, "campo obrigatório");
      return true;
    }
  );
});

test("HTTP 429 uses default message when payload has none", async () => {
  installFetch(async () => mockResponse({ status: 429, body: "" }));
  await assert.rejects(apiRequest("/api/x"), (err: unknown) => {
    const d = (err as ApiRequestError).toDetails();
    assert.equal(d.status, 429);
    assert.equal(d.error, "HTTP_429");
    assert.equal(d.message, "Limite de requisições excedido");
    return true;
  });
});

test("HTTP 503 preserves error code, message, details", async () => {
  installFetch(async () =>
    mockResponse({
      status: 503,
      body: JSON.stringify({
        error: "MARKET_DATA_UNAVAILABLE",
        message: "Feed indisponível",
        details: "FastForex retornou 500",
      }),
    })
  );
  await assert.rejects(apiRequest("/api/analyze-market", { method: "POST" }), (err: unknown) => {
    const d = (err as ApiRequestError).toDetails();
    assert.equal(d.status, 503);
    assert.equal(d.error, "MARKET_DATA_UNAVAILABLE");
    assert.equal(d.message, "Feed indisponível");
    assert.equal(d.details, "FastForex retornou 500");
    return true;
  });
});

test("HTTP 504 preserves requestId from body", async () => {
  installFetch(async () =>
    mockResponse({
      status: 504,
      body: JSON.stringify({
        error: "MARKET_DATA_TIMEOUT",
        message: "Tempo limite ao obter dados de mercado",
        requestId: "req_abc123",
      }),
    })
  );
  await assert.rejects(apiRequest("/api/analyze-market", { method: "POST" }), (err: unknown) => {
    const d = (err as ApiRequestError).toDetails();
    assert.equal(d.status, 504);
    assert.equal(d.requestId, "req_abc123");
    return true;
  });
});

test("requestId is also picked up from x-request-id header", async () => {
  installFetch(async () =>
    mockResponse({
      status: 500,
      body: JSON.stringify({ error: "INTERNAL", message: "boom" }),
      headers: { "x-request-id": "hdr_xyz" },
    })
  );
  await assert.rejects(apiRequest("/api/x"), (err: unknown) => {
    assert.equal((err as ApiRequestError).requestId, "hdr_xyz");
    return true;
  });
});

// ---------- error path: invalid / network / abort ----------

test("Invalid JSON on a non-OK response yields INVALID_JSON_RESPONSE with truncated details", async () => {
  const huge = "<html>" + "x".repeat(2000) + "</html>";
  installFetch(async () => mockResponse({ status: 502, body: huge }));
  await assert.rejects(apiRequest("/api/x"), (err: unknown) => {
    const d = (err as ApiRequestError).toDetails();
    assert.equal(d.status, 502);
    // details field capped
    assert.ok(d.details && d.details.length <= 501);
    return true;
  });
});

test("Invalid JSON on a 2xx response also throws INVALID_JSON_RESPONSE", async () => {
  installFetch(async () => mockResponse({ status: 200, body: "not json{" }));
  await assert.rejects(apiRequest("/api/x"), (err: unknown) => {
    const d = (err as ApiRequestError).toDetails();
    assert.equal(d.error, "INVALID_JSON_RESPONSE");
    assert.equal(d.status, 200);
    return true;
  });
});

test("Network error becomes NETWORK_ERROR with null status", async () => {
  installFetch(async () => {
    throw new TypeError("Failed to fetch");
  });
  await assert.rejects(apiRequest("/api/x"), (err: unknown) => {
    const d = (err as ApiRequestError).toDetails();
    assert.equal(d.status, null);
    assert.equal(d.error, "NETWORK_ERROR");
    assert.match(d.message, /Não foi possível conectar/);
    return true;
  });
});

test("AbortError becomes REQUEST_ABORTED", async () => {
  installFetch(async () => {
    throw new DOMException("aborted", "AbortError");
  });
  await assert.rejects(apiRequest("/api/x"), (err: unknown) => {
    const d = (err as ApiRequestError).toDetails();
    assert.equal(d.error, "REQUEST_ABORTED");
    assert.equal(d.status, null);
    return true;
  });
});

// ---------- normalizeApiError ----------

test("normalizeApiError preserves ApiRequestError details", () => {
  const err = new ApiRequestError({
    endpoint: "/a",
    method: "GET",
    status: 500,
    error: "X",
    message: "m",
    requestId: "r",
  });
  const d = normalizeApiError(err, { endpoint: "/fallback", method: "POST" });
  assert.equal(d.endpoint, "/a");
  assert.equal(d.error, "X");
  assert.equal(d.requestId, "r");
});

test("normalizeApiError wraps generic Error", () => {
  const d = normalizeApiError(new Error("boom"), { endpoint: "/a", method: "GET" });
  assert.equal(d.error, "UNKNOWN_ERROR");
  assert.equal(d.status, null);
  assert.equal(d.message, "boom");
  assert.equal(d.endpoint, "/a");
});

test("normalizeApiError handles unknown non-Error", () => {
  const d = normalizeApiError("weird", { endpoint: "/a", method: "GET" });
  assert.equal(d.error, "UNKNOWN_ERROR");
  assert.equal(d.message, "Ocorreu um erro inesperado");
});

// ---------- audit regression: technicalScore as score, not percent ----------

test("technicalScore rendered as X/100, not X%", async () => {
  const { formatScore } = await import("../src/lib/format.ts");
  const rendered = `Qualidade técnica: ${formatScore(72)}/100`;
  assert.equal(rendered, "Qualidade técnica: 72/100");
  assert.ok(!rendered.includes("%"));
});
