import { FinalSignalDecision, RegimeLabel, TriggerEvaluation, VetoResult, CalibrationResult, DriftStatus } from './types';

export function finalDecision(
  evaluations: TriggerEvaluation[],
  vetoResult: VetoResult,
  regime: RegimeLabel,
  calibrationDataMap: Record<string, CalibrationResult>,
  driftDataMap: Record<string, DriftStatus>,
  disableCalibrationVeto: boolean = false
): FinalSignalDecision {

  let bestEval: TriggerEvaluation | null = null;
  let bestScore = 0;

  // 1. Detect if there is a strategy conflict (one strategy triggers CALL, another triggers PUT)
  let hasCall = false;
  let hasPut = false;
  for (const evaluation of evaluations) {
    if (evaluation.signal === "CALL") hasCall = true;
    if (evaluation.signal === "PUT") hasPut = true;
  }
  const hasStrategyConflict = hasCall && hasPut;

  // Find the strongest technical setup
  for (const evaluation of evaluations) {
    if (evaluation.signal !== 'NEUTRAL' && evaluation.technicalScore > bestScore) {
      bestScore = evaluation.technicalScore;
      bestEval = evaluation;
    }
  }

  // Fallback to NEUTRAL if no clear technical setup
  if (!bestEval) {
    return {
      signal: 'NEUTRAL',
      strategy: 'N/A',
      regime,
      technicalScore: 0,
      calibratedProbability: null, calibrationAvailable: false,
      reliabilityScore: 0,
      sampleSize: 0,
      historicalWinRate: 0,
      vetoReasons: vetoResult.vetoReasons.length > 0 ? vetoResult.vetoReasons : ['Nenhum gatilho de estratégia ativado.'],
      driftFlag: false,
      driftReason: null,
      reasons: ['Condições técnicas não atingiram os critérios mínimos de entrada.']
    };
  }

  const cal = calibrationDataMap[bestEval.strategy];
  const drift = driftDataMap[bestEval.strategy];

  const reasons = [...bestEval.reasons];
  let finalSignal = bestEval.signal;
  const finalVetoes = [...vetoResult.vetoReasons];

  // Apply Strategy Conflict veto
  if (finalSignal !== 'NEUTRAL' && hasStrategyConflict) {
    finalSignal = 'NEUTRAL';
    finalVetoes.push("VETO: Conflito de estratégia detectado (uma sugere CALL, outra sugere PUT).");
    reasons.push("Sinal neutralizado devido a conflito de viés entre estratégias.");
  }

  // Apply Meta-Filter Vetoes
  if (vetoResult.vetoed) {
    finalSignal = 'NEUTRAL';
    reasons.push("Sinal neutralizado devido a vetos de meta-filtro.");
  }

  
  // Apply Calibration Source Mock block
  if (!disableCalibrationVeto && finalSignal !== 'NEUTRAL' && (cal as any).calibrationSource === "mock") {
    finalSignal = 'NEUTRAL';
    finalVetoes.push("VETO: Fonte de calibração mock detectada. Operações em tempo real bloqueadas.");
    reasons.push("Sinal neutralizado por calibração mock.");
  }

  // Apply Minimum Sample Size Veto (only if some real history exists but is insufficient, e.g. between 1 and 30)
  if (!disableCalibrationVeto && finalSignal !== 'NEUTRAL' && cal.sampleSize > 0 && cal.sampleSize < 30) {
    finalSignal = 'NEUTRAL';
    finalVetoes.push(`VETO: Amostra histórica insuficiente (${cal.sampleSize} < 30).`);
    reasons.push("Sinal neutralizado por amostragem estatística insuficiente.");
  }

  // Apply Win Rate Breakeven Veto (Only if sampleSize >= 30)
  if (!disableCalibrationVeto && finalSignal !== 'NEUTRAL' && cal.sampleSize >= 30 && cal.historicalWinRate < 58) {
    finalSignal = 'NEUTRAL';
    finalVetoes.push(`VETO: Taxa de acerto histórica (${cal.historicalWinRate.toFixed(1)}%) abaixo do breakeven exigido (58%).`);
    reasons.push("Sinal neutralizado por taxa de acerto histórica fora dos limites de segurança.");
  }

  // Apply Calibration Thresholds (Only take trades if calibrated prob is decent, e.g. >= 58%)
  if (!disableCalibrationVeto && finalSignal !== 'NEUTRAL' && (cal as any).calibrationSource !== "none" && cal.calibratedProbability < 58) {
    finalSignal = 'NEUTRAL';
    finalVetoes.push(`VETO: Probabilidade calibrada baixa (${cal.calibratedProbability}%). Esperado >= 58%.`);
    reasons.push("Sinal neutralizado por probabilidade calibrada insuficiente.");
  }

  // Apply Reliability Score Veto (Must be >= 50%)
  if (!disableCalibrationVeto && finalSignal !== 'NEUTRAL' && (cal as any).calibrationSource !== "none" && cal.reliabilityScore < 50) {
    finalSignal = 'NEUTRAL';
    finalVetoes.push(`VETO: Reliability Score baixo (${cal.reliabilityScore}). Contexto sem confiança estatística.`);
    reasons.push("Sinal neutralizado por baixa confiabilidade do bucket.");
  }

  // Apply Drift Veto
  if (finalSignal !== 'NEUTRAL' && drift.driftFlag) {
    finalSignal = 'NEUTRAL';
    finalVetoes.push(`VETO: Drift Detectado. ${drift.driftReason}`);
    reasons.push("Sinal de degradação recente da estratégia (Concept Drift).");
  }

  return {
    signal: finalSignal,
    strategy: bestEval.strategy,
    regime,
    technicalScore: bestEval.technicalScore,
    calibratedProbability: cal.calibratedProbability,
    calibrationAvailable: cal.calibratedProbability !== null,
    reliabilityScore: cal.reliabilityScore,
    sampleSize: cal.sampleSize,
    historicalWinRate: cal.historicalWinRate,
    vetoReasons: finalVetoes,
    driftFlag: drift.driftFlag,
    driftReason: drift.driftReason,
    reasons
  };
}
