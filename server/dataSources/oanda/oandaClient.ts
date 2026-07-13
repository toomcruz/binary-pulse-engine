import dotenv from "dotenv";
dotenv.config();

export function getOandaConfig() {
  const token = process.env.OANDA_API_TOKEN || "";
  const accountId = process.env.OANDA_ACCOUNT_ID || "";
  const env = process.env.OANDA_ENV || "practice";
  const rawInstruments = process.env.OANDA_INSTRUMENTS || "";
  
  const instruments = rawInstruments
    ? rawInstruments.split(",").map(i => i.trim()).filter(Boolean)
    : [
        "EUR_USD", "GBP_USD", "USD_JPY", "EUR_JPY", "GBP_JPY",
        "AUD_USD", "USD_CAD", "EUR_GBP"
      ];

  const hasToken = !!token && token !== "your_token_here";
  const hasAccountId = !!accountId && accountId !== "your_account_id_here";
  const isConfigured = hasToken && hasAccountId;

  return {
    isConfigured,
    hasToken,
    hasAccountId,
    env,
    token,
    accountId,
    instruments,
    restUrl: env === "live" ? "https://api-fxtrade.oanda.com" : "https://api-fxpractice.oanda.com",
    streamUrl: env === "live" ? "https://stream-fxtrade.oanda.com" : "https://stream-fxpractice.oanda.com"
  };
}

export async function oandaFetch(path: string, options: RequestInit = {}) {
  const config = getOandaConfig();
  if (!config.isConfigured) {
    return { ok: false, error: "OANDA_NOT_CONFIGURED" };
  }

  const response = await fetch(`${config.restUrl}/${path}`, {
    ...options,
    headers: {
      ...options.headers,
      "Authorization": `Bearer ${config.token}`,
      "Content-Type": "application/json"
    }
  });

  if (!response.ok) {
    return { ok: false, status: response.status, error: response.statusText };
  }

  const data = await response.json();
  return { ok: true, data };
}

export async function testOandaConnection() {
  const config = getOandaConfig();
  if (!config.isConfigured) return { ok: false, error: "OANDA_NOT_CONFIGURED" };
  const res = await oandaFetch(`v3/accounts/${config.accountId}/summary`);
  return { ok: res.ok, error: res.error };
}
