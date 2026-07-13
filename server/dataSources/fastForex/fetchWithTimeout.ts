export class FastForexRequestTimeoutError extends Error {
  code = "MARKET_DATA_TIMEOUT";

  constructor(message = "Tempo limite ao obter dados de mercado") {
    super(message);
    this.name = "FastForexRequestTimeoutError";
  }
}

export class FastForexRequestAbortError extends Error {
  code = "MARKET_DATA_ABORTED";

  constructor(message = "Requisição de dados de mercado cancelada") {
    super(message);
    this.name = "FastForexRequestAbortError";
  }
}

export function getFastForexTimeoutMs(): number {
  const rawTimeout = process.env.FASTFOREX_TIMEOUT_MS;
  const parsed = rawTimeout ? Number(rawTimeout) : NaN;
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }

  return process.env.NODE_ENV === "test" || process.env.TEST_ENV === "true" ? 500 : 10_000;
}

function assertFastForexNetworkAllowed(url: string): void {
  if (process.env.NODE_ENV !== "test" && process.env.TEST_ENV !== "true") return;

  const parsedUrl = new URL(url);
  const allowedTestHost = parsedUrl.hostname === "fastforex.test" || parsedUrl.hostname.endsWith(".test");
  if (allowedTestHost) return;

  throw new Error(`FastForex network calls are disabled during tests: ${parsedUrl.origin}`);
}

export async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs = getFastForexTimeoutMs()
): Promise<Response> {
  assertFastForexNetworkAllowed(url);

  const controller = new AbortController();
  let abortReason: "timeout" | "external" | null = null;

  const externalSignal = options.signal;
  if (externalSignal?.aborted) {
    throw new FastForexRequestAbortError();
  }

  const abortFromExternalSignal = () => {
    if (abortReason) return;
    abortReason = "external";
    controller.abort(externalSignal?.reason);
  };

  externalSignal?.addEventListener("abort", abortFromExternalSignal, { once: true });

  const timer = setTimeout(() => {
    if (abortReason) return;
    abortReason = "timeout";
    controller.abort();
  }, timeoutMs);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal
    });
  } catch (error) {
    if (abortReason === "external") {
      throw new FastForexRequestAbortError();
    }
    if (abortReason === "timeout") {
      throw new FastForexRequestTimeoutError();
    }
    if ((error as Error).name === "AbortError") {
      throw new FastForexRequestTimeoutError();
    }
    throw error;
  } finally {
    clearTimeout(timer);
    externalSignal?.removeEventListener("abort", abortFromExternalSignal);
  }
}

export function isFastForexTimeoutError(error: unknown): boolean {
  return error instanceof FastForexRequestTimeoutError || (error as { code?: string } | null)?.code === "MARKET_DATA_TIMEOUT";
}

export function isFastForexAbortError(error: unknown): boolean {
  return error instanceof FastForexRequestAbortError || (error as { code?: string } | null)?.code === "MARKET_DATA_ABORTED";
}
