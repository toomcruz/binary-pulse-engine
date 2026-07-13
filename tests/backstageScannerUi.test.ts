import assert from 'node:assert/strict';
import test from 'node:test';
import { formatBackstageScannerError } from '../src/lib/backstageScanner';

test('mensagens do scanner tratam status 409, 429 e 504', () => {
  assert.equal(
    formatBackstageScannerError(409),
    'Já existe uma varredura geral em andamento. Aguarde a execução atual terminar.'
  );
  assert.equal(
    formatBackstageScannerError(429, { retryAfterMs: 2500 }),
    'Cooldown ativo. Tente novamente em aproximadamente 3s.'
  );
  assert.equal(
    formatBackstageScannerError(504),
    'A varredura geral excedeu o tempo limite. Tente novamente após o cooldown.'
  );
});

test('mensagem do scanner usa payload de erro genérico como fallback', () => {
  assert.equal(formatBackstageScannerError(500, { message: 'Falha detalhada' }), 'Falha detalhada');
  assert.equal(formatBackstageScannerError(503, { error: 'PROVIDER_DOWN' }), 'PROVIDER_DOWN');
});
