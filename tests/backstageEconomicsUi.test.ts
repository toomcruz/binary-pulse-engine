import assert from 'node:assert/strict';
import test from 'node:test';
import { buildBackstageReplayEconomicContext, createBackstageEconomicMetricsRecord, buildBackstageReplayPayload, formatReplayEconomicMetric, getBackstageEconomicMetricsForContext, parsePayoutPercentInput, translateEconomicStatus } from '../src/lib/backstageEconomics';

const basePayload = {
  asset: 'EUR/USD',
  timeframe: 'M1',
  strategy: 'reversion',
  precisionLevel: 'normal'
};

test('converte payout visual de 80% para decimal 0.80 no payload', () => {
  assert.equal(parsePayoutPercentInput('80'), 0.8);
  assert.deepEqual(buildBackstageReplayPayload({ ...basePayload, payoutPercentInput: '80%' }), {
    ...basePayload,
    payout: 0.8
  });
});

test('payout vazio não é enviado ao backend', () => {
  const payload = buildBackstageReplayPayload({ ...basePayload, payoutPercentInput: '   ' });
  assert.equal('payout' in payload, false);
});

test('bloqueia payout abaixo de 0% e acima de 100%', () => {
  assert.throws(() => parsePayoutPercentInput('-0.01'), /PAYOUT_PERCENT_OUT_OF_RANGE/);
  assert.throws(() => parsePayoutPercentInput('100.01'), /PAYOUT_PERCENT_OUT_OF_RANGE/);
  assert.equal(parsePayoutPercentInput('0'), 0);
  assert.equal(parsePayoutPercentInput('100'), 1);
});

test('formata métricas econômicas e traduz status', () => {
  assert.equal(formatReplayEconomicMetric('payout', 0.8), '80.00%');
  assert.equal(formatReplayEconomicMetric('breakEvenWinRate', 1 / 1.8), '55.56%');
  assert.equal(formatReplayEconomicMetric('grossProfit', 8), '+8.00');
  assert.equal(formatReplayEconomicMetric('grossLoss', 4), '4.00');
  assert.equal(formatReplayEconomicMetric('netProfit', 4), '+4.00');
  assert.equal(formatReplayEconomicMetric('roiPercent', 40), '+40.00%');
  assert.equal(formatReplayEconomicMetric('expectedValuePerTrade', 0.4), '+0.40');
  assert.equal(formatReplayEconomicMetric('decidedTrades', 10), '10');
  assert.equal(formatReplayEconomicMetric('draws', 2), '2');
  assert.equal(translateEconomicStatus('ECONOMICALLY_PROFITABLE'), 'Lucrativo');
  assert.equal(translateEconomicStatus('ECONOMICALLY_UNPROFITABLE'), 'Não lucrativo');
  assert.equal(translateEconomicStatus('ECONOMIC_METRICS_UNAVAILABLE'), 'Métricas indisponíveis');
});

test('formatadores não exibem NaN ou Infinity', () => {
  for (const value of [NaN, Infinity, -Infinity]) {
    assert.equal(formatReplayEconomicMetric('roiPercent', value), '—');
    assert.equal(formatReplayEconomicMetric('netProfit', value), '—');
    assert.equal(formatReplayEconomicMetric('payout', value), '—');
  }
});

test('métricas econômicas persistidas só são exibidas no mesmo contexto', () => {
  const metrics = {
    economicMetricsAvailable: true,
    economicStatus: 'ECONOMICALLY_PROFITABLE' as const,
    payout: 0.8,
    breakEvenWinRate: 0.5555555556,
    grossProfit: 8,
    grossLoss: 4,
    netProfit: 4,
    roiPercent: 40,
    expectedValuePerTrade: 0.4,
    decidedTrades: 10,
    draws: 2
  };
  const context = {
    asset: 'EUR/USD',
    timeframe: 'M1',
    strategy: 'reversion',
    precisionLevel: 'normal',
    payout: 0.8
  };
  const record = createBackstageEconomicMetricsRecord(context, metrics, 123456);

  assert.deepEqual(getBackstageEconomicMetricsForContext(record, context), metrics);
  assert.equal(getBackstageEconomicMetricsForContext(record, { ...context, asset: 'GBP/USD' }), null);
  assert.equal(getBackstageEconomicMetricsForContext(record, { ...context, timeframe: 'M5' }), null);
  assert.equal(getBackstageEconomicMetricsForContext(record, { ...context, strategy: 'trend' }), null);
  assert.equal(getBackstageEconomicMetricsForContext(record, { ...context, precisionLevel: 'elite' }), null);
  assert.equal(getBackstageEconomicMetricsForContext(record, { ...context, payout: 0.7 }), null);
});

test('registros antigos ou inválidos não retornam métricas após erro/contexto inválido', () => {
  const context = buildBackstageReplayEconomicContext({
    ...basePayload,
    payoutPercentInput: '80'
  });

  assert.deepEqual(context, { ...basePayload, payout: 0.8 });
  assert.equal(getBackstageEconomicMetricsForContext({ economicMetricsAvailable: true }, context), null);
  assert.throws(() => buildBackstageReplayEconomicContext({
    ...basePayload,
    payoutPercentInput: '100.01'
  }), /PAYOUT_PERCENT_OUT_OF_RANGE/);
});
