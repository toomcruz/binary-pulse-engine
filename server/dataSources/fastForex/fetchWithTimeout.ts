export class FastForexRequestTimeoutError extends Error {
  code = "MARKET_DATA_TIMEOUT";

  constructor(message = "Tempo limite ao obter dados de mercado") {
    super(message);
    this.name = "FastForexRequestTimeoutError";
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

export async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs = getFastForexTimeoutMs()
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  timer.unref?.();

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal
    });
  } catch (error) {
    if ((error as Error).name === "AbortError") {
      throw new FastForexRequestTimeoutError();
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export function isFastForexTimeoutError(error: unknown): boolean {
  return error instanceof FastForexRequestTimeoutError || (error as { code?: string } | null)?.code === "MARKET_DATA_TIMEOUT";
}