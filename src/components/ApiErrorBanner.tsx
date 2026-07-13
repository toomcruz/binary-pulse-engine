import React from "react";
import { AlertTriangle, X } from "lucide-react";
import type { ApiErrorDetails } from "../lib/apiClient";

export type ApiErrorBannerProps = {
  error: ApiErrorDetails | null;
  onDismiss?: () => void;
  className?: string;
};

/**
 * Contract-driven error banner. Renders every field of ApiErrorDetails that
 * has content, and nothing else. Never shows "HTTP null" or empty rows.
 */
export function ApiErrorBanner({ error, onDismiss, className }: ApiErrorBannerProps) {
  if (!error) return null;

  const httpLabel = error.status !== null ? `HTTP ${error.status}` : "Sem resposta HTTP";

  return (
    <div
      role="alert"
      aria-live="polite"
      className={
        "flex gap-3 p-3 rounded-lg border border-rose-500/30 bg-rose-500/10 text-rose-200 text-[11px] font-mono " +
        (className ?? "")
      }
    >
      <AlertTriangle size={16} className="text-rose-400 shrink-0 mt-0.5" aria-hidden="true" />
      <div className="flex-1 min-w-0 space-y-0.5 break-words">
        <div className="font-bold text-rose-300">
          <span className="uppercase">{error.method}</span>{" "}
          <span className="text-rose-200">{error.endpoint}</span>
        </div>
        <div className="text-rose-300/90">
          {httpLabel}
          {error.error ? <> · <span className="text-amber-300">{error.error}</span></> : null}
        </div>
        <div className="text-rose-100 font-sans">{error.message}</div>
        {error.details ? (
          <div className="text-rose-200/80">
            <span className="font-sans font-semibold">Detalhes:</span> {error.details}
          </div>
        ) : null}
        {error.requestId ? (
          <div className="text-slate-400 text-[10px]">Request ID: {error.requestId}</div>
        ) : null}
      </div>
      {onDismiss ? (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Fechar aviso de erro"
          className="text-rose-300 hover:text-rose-100 shrink-0"
        >
          <X size={14} />
        </button>
      ) : null}
    </div>
  );
}

export default ApiErrorBanner;
