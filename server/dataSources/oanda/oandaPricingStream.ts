import { getOandaConfig } from "./oandaClient";
import { MarketTick } from "../dataSourceTypes";
import https from "https";

interface StreamOptions {
  onTick: (tick: MarketTick) => void;
  onHeartbeat?: () => void;
  onError?: (error: Error) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
}

let activeRequest: any = null;
let reconnectTimeout: any = null;
let reconnectAttempts = 0;

export function startOandaPricingStream(options: StreamOptions): void {
  const config = getOandaConfig();
  if (!config.isConfigured) {
    if (options.onError) options.onError(new Error("OANDA_NOT_CONFIGURED"));
    return;
  }

  if (activeRequest) {
    activeRequest.abort();
    activeRequest = null;
  }

  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
    reconnectTimeout = null;
  }

  const instrumentsStr = config.instruments.join(",");
  const url = new URL(`${config.streamUrl}/v3/accounts/${config.accountId}/pricing/stream?instruments=${instrumentsStr}`);

  const reqOptions = {
    hostname: url.hostname,
    path: url.pathname + url.search,
    method: "GET",
    headers: {
      "Authorization": `Bearer ${config.token}`,
    }
  };

  const req = https.request(reqOptions, (res) => {
    if (res.statusCode !== 200) {
      if (options.onError) options.onError(new Error(`OANDA_STREAM_ERROR: ${res.statusCode}`));
      scheduleReconnect(options);
      return;
    }

    if (options.onConnect) options.onConnect();
    reconnectAttempts = 0;

    let lineBuffer = "";
    res.on("data", (chunk) => {
      lineBuffer += chunk.toString();
      const lines = lineBuffer.split("\n");
      lineBuffer = lines.pop() || "";
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const data = JSON.parse(line);
          if (data.type === "PRICE") {
            const bid = parseFloat(data.bids[0].price);
            const ask = parseFloat(data.asks[0].price);
            const mid = (bid + ask) / 2;
            
            const tick: MarketTick = {
              instrument: data.instrument,
              bid,
              ask,
              mid,
              time: data.time,
              timestamp: new Date(data.time).getTime(),
              source: "oanda_stream",
              provider: "oanda",
              receivedAt: Date.now()
            };
            options.onTick(tick);
          } else if (data.type === "HEARTBEAT") {
            if (options.onHeartbeat) options.onHeartbeat();
          }
        } catch (e) {
          // ignore parse errors for partial chunks
        }
      }
    });

    res.on("end", () => {
      if (options.onDisconnect) options.onDisconnect();
      scheduleReconnect(options);
    });
  });

  req.on("error", (e) => {
    if (options.onError) options.onError(e);
    if (options.onDisconnect) options.onDisconnect();
    scheduleReconnect(options);
  });

  req.end();
  activeRequest = req;
}

function scheduleReconnect(options: StreamOptions) {
  if (reconnectTimeout) return;
  const backoff = [1000, 2000, 5000, 10000, 30000];
  const delay = backoff[Math.min(reconnectAttempts, backoff.length - 1)];
  reconnectAttempts++;
  reconnectTimeout = setTimeout(() => {
    reconnectTimeout = null;
    startOandaPricingStream(options);
  }, delay);
}
