import dotenv from "dotenv";
import { MassiveConfig } from "./massiveTypes";

dotenv.config();

let rateLimitCoolDownUntil = 0;

export function getMassiveConfig(): MassiveConfig {
  const provider = process.env.MARKET_DATA_PROVIDER || "";
  const apiKey = process.env.MASSIVE_API_KEY || "";
  const baseUrl = process.env.MASSIVE_BASE_URL || "https://api.polygon.io";
  
  const rawForex = process.env.MARKET_SYMBOLS_FOREX || "EUR/USD,GBP/USD,USD/JPY,EUR/GBP,AUD/USD,USD/CAD";
  const symbolsForex = rawForex.split(",").map(s => s.trim()).filter(Boolean);

  const rawCrypto = process.env.MARKET_SYMBOLS_CRYPTO || "BTC/USD,ETH/USD,SOL/USD,XRP/USD,BNB/USD";
  const symbolsCrypto = rawCrypto.split(",").map(s => s.trim()).filter(Boolean);

  const isConfigured = provider === "massive" && !!apiKey && apiKey !== "your_api_key_here";

  return {
    provider,
    apiKey,
    baseUrl,
    symbolsForex,
    symbolsCrypto,
    isConfigured
  };
}

export function normalizeSymbolToPolygon(symbol: string): { type: "forex" | "crypto"; ticker: string; from: string; to: string } {
  const clean = symbol.replace("_", "/").toUpperCase();
  const parts = clean.split("/");
  const from = parts[0] || "";
  const to = parts[1] || "";

  // Check if it's in the Crypto list
  const config = getMassiveConfig();
  const isCrypto = config.symbolsCrypto.some(s => s.replace("_", "/").toUpperCase() === clean) || 
                  ["BTC", "ETH", "SOL", "XRP", "BNB"].includes(from);

  if (isCrypto) {
    return {
      type: "crypto",
      ticker: `X:${from}${to}`,
      from,
      to
    };
  } else {
    return {
      type: "forex",
      ticker: `C:${from}${to}`,
      from,
      to
    };
  }
}

export function normalizeSymbolFromPolygon(ticker: string): string {
  // e.g. "C:EURUSD" -> "EUR_USD", "X:BTCUSD" -> "BTC_USD"
  let clean = ticker.replace("C:", "").replace("X:", "");
  if (clean.length === 6) {
    return `${clean.slice(0, 3)}_${clean.slice(3)}`;
  }
  // Fallbacks for unusual lengths
  if (clean.startsWith("BTCUSD")) return "BTC_USD";
  if (clean.startsWith("ETHUSD")) return "ETH_USD";
  if (clean.startsWith("SOLUSD")) return "SOL_USD";
  if (clean.startsWith("XRPUSD")) return "XRP_USD";
  if (clean.startsWith("BNBUSD")) return "BNB_USD";
  return clean;
}

export async function fetchMassive(endpoint: string, queryParams: Record<string, string> = {}): Promise<any> {
  const config = getMassiveConfig();
  if (!config.isConfigured) {
    throw new Error("MASSIVE_NOT_CONFIGURED");
  }

  const now = Date.now();
  if (now < rateLimitCoolDownUntil) {
    const secondsLeft = Math.ceil((rateLimitCoolDownUntil - now) / 1000);
    throw new Error(`Massive/Polygon API rate limited (429). Cooldown active for another ${secondsLeft}s.`);
  }

  // Polygon API requires apiKey query parameter: /v2/... ?apiKey=XYZ
  const url = new URL(`${config.baseUrl}${endpoint.startsWith("/") ? "" : "/"}${endpoint}`);
  Object.entries(queryParams).forEach(([key, val]) => {
    url.searchParams.append(key, val);
  });
  url.searchParams.append("apiKey", config.apiKey);

  const response = await fetch(url.toString(), {
    headers: {
      "Accept": "application/json",
      "User-Agent": "massive-polygon-client"
    }
  });

  if (response.status === 429) {
    rateLimitCoolDownUntil = Date.now() + 15000; // 15-second cooldown on rate-limits
    throw new Error(`Massive/Polygon API error: 429 Too Many Requests`);
  }

  if (!response.ok) {
    throw new Error(`Massive/Polygon API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  if (data && (data.status === "ERROR" || data.status === "error")) {
    throw new Error(`Massive/Polygon API error response: ${data.message || data.error}`);
  }

  return data;
}
