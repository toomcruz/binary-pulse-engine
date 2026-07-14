export interface FeedHealth {
  configured?: unknown;
  connected?: unknown;
  isStaleData?: unknown;
  error?: unknown;
}

export function isFeedOperational(health: FeedHealth | null | undefined): boolean {
  return health?.configured === true &&
    health?.connected === true &&
    health?.isStaleData === false &&
    !health?.error;
}

export function isValidPrice(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}
