import dotenv from "dotenv";
dotenv.config();

export const FASTFOREX_API_KEY = process.env.FASTFOREX_API_KEY || "";
export let FASTFOREX_BASE_URL = process.env.FASTFOREX_BASE_URL || "https://api.fastforex.io";
if (!FASTFOREX_BASE_URL.startsWith("http")) {
  FASTFOREX_BASE_URL = "https://api.fastforex.io";
}

export function isFastForexConfigured(): boolean {
  return FASTFOREX_API_KEY.length > 0;
}

export function normalizeSymbolFromFastForex(symbol: string): string {
  return symbol.replace("-", "/").toUpperCase();
}

export function isCryptoSymbol(symbol: string): boolean {
  const upper = symbol.toUpperCase().replace("-", "/");
  const base = upper.split("/")[0] || "";
  const cryptos = ["BTC", "ETH", "SOL", "XRP", "BNB", "ADA", "DOGE", "LTC", "DOT", "LINK", "AVAX", "MATIC"];
  if (cryptos.includes(base)) return true;
  
  // Check if it's explicitly defined in the FASTFOREX_SYMBOLS_CRYPTO environment variable
  const cryptoEnv = process.env.FASTFOREX_SYMBOLS_CRYPTO || "";
  if (cryptoEnv.toUpperCase().includes(upper)) return true;
  
  return false;
}

export function normalizeSymbolToFastForex(symbol: string): string {
  return symbol.replace("/", "-").toUpperCase();
}
