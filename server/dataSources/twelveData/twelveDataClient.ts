import dotenv from "dotenv";
dotenv.config();

let rateLimitCoolDownUntil = 0;

export function getTwelveDataConfig() {
  const provider = process.env.MARKET_DATA_PROVIDER || "";
  const apiKey = process.env.TWELVE_DATA_API_KEY || "";
  const baseUrl = process.env.TWELVE_DATA_BASE_URL || "https://api.twelvedata.com";
  const rawSymbols = process.env.MARKET_SYMBOLS || "EUR/USD,GBP/USD,USD/JPY,EUR/GBP,AUD/USD,USD/CAD";
  const symbols = rawSymbols.split(",").map(s => s.trim()).filter(Boolean);

  const isConfigured = provider === "twelvedata" && !!apiKey && apiKey !== "your_api_key_here";

  return {
    provider,
    apiKey,
    baseUrl,
    symbols,
    isConfigured
  };
}

export function normalizeSymbolToTwelveData(symbol: string): string {
  return symbol.replace("_", "/");
}

export function normalizeSymbolFromTwelveData(symbol: string): string {
  return symbol.replace("/", "_");
}

export async function fetchTwelveData(endpoint: string, queryParams: Record<string, string> = {}) {
  const config = getTwelveDataConfig();
  if (!config.isConfigured) {
    throw new Error("TWELVE_DATA_NOT_CONFIGURED");
  }

  const now = Date.now();
  if (now < rateLimitCoolDownUntil) {
    const secondsLeft = Math.ceil((rateLimitCoolDownUntil - now) / 1000);
    throw new Error(`Twelve Data API rate limited (429). Cooldown active for another ${secondsLeft}s.`);
  }

  const url = new URL(`${config.baseUrl}/${endpoint}`);
  Object.entries(queryParams).forEach(([key, val]) => {
    url.searchParams.append(key, val);
  });
  url.searchParams.append("apikey", config.apiKey);

  const response = await fetch(url.toString(), {
    headers: {
      "Accept": "application/json",
      "User-Agent": "aistudio-build-client"
    }
  });

  if (response.status === 429) {
    rateLimitCoolDownUntil = Date.now() + 60000;
    throw new Error(`Twelve Data API error: 429 Too Many Requests`);
  }

  if (!response.ok) {
    throw new Error(`Twelve Data API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  if (data && data.status === "error") {
    if (data.message && (data.message.includes("429") || data.message.toLowerCase().includes("limit") || data.message.toLowerCase().includes("many requests"))) {
      rateLimitCoolDownUntil = Date.now() + 60000;
    }
    throw new Error(`Twelve Data API error response: ${data.message}`);
  }

  return data;
}
