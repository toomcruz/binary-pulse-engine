/**
 * Centralized API client with a well-defined error contract.
 *
 * Every failed request produces an ApiRequestError whose fields are safe to
 * render in the UI: endpoint, method, HTTP status, technical code, message,
 * optional details and requestId. Nothing sensitive (headers, cookies, API
 * keys, stack traces) is included by construction.
 */

export type ApiErrorDetails = {
  endpoint: string;
  method: string;
  status: number | null;
  error: string;
  message: string;
  details?: string;
  requestId?: string;
};

export class ApiRequestError extends Error {
  readonly endpoint: string;
  readonly method: string;
  readonly status: number | null;
  readonly errorCode: string;
  readonly details?: string;
  readonly requestId?: string;

  constructor(d: ApiErrorDetails) {
    super(d.message);
    this.name = "ApiRequestError";
    this.endpoint = d.endpoint;
    this.method = d.method;
    this.status = d.status;
    this.errorCode = d.error;
    this.details = d.details;
    this.requestId = d.requestId;
  }

  toDetails(): ApiErrorDetails {
    return {
      endpoint: this.endpoint,
      method: this.method,
      status: this.status,
      error: this.errorCode,
      message: this.message,
      details: this.details,
      requestId: this.requestId,
    };
  }
}

// ---------- Safe payload extraction (no unsafe `any` access) ----------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function stringField(value: unknown, key: string): string | undefined {
  if (!isRecord(value)) return undefined;
  const field = value[key];
  return typeof field === "string" && field.length > 0 ? field : undefined;
}

/** Cap free-form details/rawText so we never leak candle arrays or HTML dumps. */
const MAX_DETAILS_LENGTH = 500;
function truncate(text: string, max = MAX_DETAILS_LENGTH): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

// ---------- Default HTTP-status messages (human, Portuguese) ----------

function defaultMessageForStatus(status: number): string {
  switch (status) {
    case 400: return "Requisição inválida";
    case 401: return "Autenticação necessária";
    case 403: return "Acesso negado";
    case 404: return "Recurso não encontrado";
    case 408: return "Tempo esgotado da requisição";
    case 409: return "Conflito de estado";
    case 422: return "Dados enviados são inválidos";
    case 429: return "Limite de requisições excedido";
    case 500: return "Erro interno do servidor";
    case 502: return "Gateway inválido";
    case 503: return "Serviço temporariamente indisponível";
    case 504: return "Tempo limite ao obter resposta do servidor";
    default:  return `Servidor respondeu com HTTP ${status}`;
  }
}

function defaultErrorCodeForStatus(status: number): string {
  return `HTTP_${status}`;
}

// ---------- Core request ----------

export interface ApiRequestOptions extends RequestInit {
  /** Extra endpoint used purely for error reporting when the URL is dynamic. */
  reportedEndpoint?: string;
}

export async function apiRequest<T = unknown>(
  endpoint: string,
  options: ApiRequestOptions = {}
): Promise<T> {
  const method = (options.method ?? "GET").toUpperCase();
  const reported = options.reportedEndpoint ?? endpoint;

  let response: Response;
  try {
    response = await fetch(endpoint, options);
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === "AbortError") {
      throw new ApiRequestError({
        endpoint: reported,
        method,
        status: null,
        error: "REQUEST_ABORTED",
        message: "A solicitação foi cancelada",
      });
    }
    // Node/browser network failures both surface as TypeError; treat uniformly.
    if (
      cause instanceof Error &&
      /aborted/i.test(cause.message) &&
      cause.name !== "TypeError"
    ) {
      throw new ApiRequestError({
        endpoint: reported,
        method,
        status: null,
        error: "REQUEST_ABORTED",
        message: "A solicitação foi cancelada",
      });
    }
    throw new ApiRequestError({
      endpoint: reported,
      method,
      status: null,
      error: "NETWORK_ERROR",
      message: "Não foi possível conectar ao servidor",
      details: cause instanceof Error ? truncate(cause.message) : undefined,
    });
  }

  const rawText = await response.text();
  let payload: unknown = null;
  let invalidJson = false;

  if (rawText.length > 0) {
    try {
      payload = JSON.parse(rawText);
    } catch {
      invalidJson = true;
      payload = {
        error: "INVALID_JSON_RESPONSE",
        message: "O servidor retornou uma resposta inválida",
        details: truncate(rawText),
      };
    }
  }

  if (!response.ok) {
    const errorCode =
      stringField(payload, "error") ?? defaultErrorCodeForStatus(response.status);
    const message =
      stringField(payload, "message") ??
      stringField(payload, "error") ??
      defaultMessageForStatus(response.status);
    const details = stringField(payload, "details");
    const requestId =
      stringField(payload, "requestId") ??
      response.headers.get("x-request-id") ??
      undefined;

    throw new ApiRequestError({
      endpoint: reported,
      method,
      status: response.status,
      error: errorCode,
      message,
      details: details ? truncate(details) : undefined,
      requestId: requestId ?? undefined,
    });
  }

  if (invalidJson) {
    // 2xx with a broken body is still a client-facing failure.
    throw new ApiRequestError({
      endpoint: reported,
      method,
      status: response.status,
      error: "INVALID_JSON_RESPONSE",
      message: "O servidor retornou uma resposta inválida",
      details: truncate(rawText),
    });
  }

  return payload as T;
}

// ---------- Normalisation for callers that catch `unknown` ----------

export function normalizeApiError(
  error: unknown,
  fallback: { endpoint: string; method: string }
): ApiErrorDetails {
  if (error instanceof ApiRequestError) return error.toDetails();
  if (error instanceof Error) {
    return {
      endpoint: fallback.endpoint,
      method: fallback.method.toUpperCase(),
      status: null,
      error: "UNKNOWN_ERROR",
      message: truncate(error.message || "Ocorreu um erro inesperado"),
    };
  }
  return {
    endpoint: fallback.endpoint,
    method: fallback.method.toUpperCase(),
    status: null,
    error: "UNKNOWN_ERROR",
    message: "Ocorreu um erro inesperado",
  };
}
