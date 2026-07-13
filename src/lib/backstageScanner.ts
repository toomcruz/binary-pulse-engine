export function formatBackstageScannerError(status: number, payload?: { retryAfterMs?: unknown; message?: unknown; error?: unknown } | null): string {
  if (status === 409) {
    return "Já existe uma varredura geral em andamento. Aguarde a execução atual terminar.";
  }

  if (status === 429) {
    const retryAfterMs = Number(payload?.retryAfterMs || 0);
    const seconds = Math.max(1, Math.ceil(retryAfterMs / 1000));
    return `Cooldown ativo. Tente novamente em aproximadamente ${seconds}s.`;
  }

  if (status === 504) {
    return "A varredura geral excedeu o tempo limite. Tente novamente após o cooldown.";
  }

  return String(payload?.message || payload?.error || "Erro ao executar Backstage Scanner Geral");
}
