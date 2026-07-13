import { Candle, MarketContext } from "./types";

export type IntegrityStatus = "APPROVED" | "BLOCKED" | "DEGRADED";

export interface IntegrityResult {
  status: IntegrityStatus;
  reasons: string[];
}

export function checkDataIntegrity(
  asset: string,
  timeframe: string,
  candles: Candle[],
  marketContext: MarketContext
): IntegrityResult {
  const reasons: string[] = [];
  let status: IntegrityStatus = "APPROVED";

  if (!asset) {
    reasons.push("Ativo não identificado");
    status = "BLOCKED";
  }
  if (!timeframe) {
    reasons.push("Timeframe não identificado");
    status = "BLOCKED";
  }

  if (!candles || candles.length < 20) {
    reasons.push("Quantidade de candles insuficiente (min 20)");
    status = "BLOCKED";
  }

  // Check invalid values and missing data
  const hasInvalid = candles.some(c => 
    !c.time || 
    !Number.isFinite(c.open) || 
    !Number.isFinite(c.close) ||
    c.open <= 0 || c.close <= 0
  );
  
  if (hasInvalid) {
    reasons.push("Velas contêm valores nulos, negativos ou inválidos");
    status = "BLOCKED";
  }

  // Check chronological order and gaps
  let outOfOrder = false;
  let hasGaps = false;
  let hasDuplicates = false;
  
  const expectedMs = timeframe === "M1" ? 60000 : 300000;
  
  for (let i = 1; i < candles.length; i++) {
    const prevTime = new Date(candles[i-1].time).getTime();
    const currTime = new Date(candles[i].time).getTime();
    
    if (currTime < prevTime) {
      outOfOrder = true;
    } else if (currTime === prevTime) {
      hasDuplicates = true;
    } else if (currTime - prevTime > expectedMs * 1.5) {
      hasGaps = true;
    }
  }

  if (outOfOrder) {
    reasons.push("Velas fora de ordem cronológica");
    status = "BLOCKED";
  }
  if (hasDuplicates) {
    reasons.push("Duplicatas detectadas");
    status = "DEGRADED";
  }
  if (hasGaps) {
    reasons.push("Lacunas (gaps) identificadas na série temporal");
    status = status === "BLOCKED" ? "BLOCKED" : "DEGRADED";
  }
  
  const isStale = marketContext?.isStaleData === true || (marketContext?.dataAgeMs && marketContext.dataAgeMs > 45000);
  if (isStale) {
    reasons.push("Dados desatualizados (stale data)");
    status = "BLOCKED";
  }
  
  return { status, reasons };
}
