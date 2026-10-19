/**
 * Fixed-window rate limiter. The in-memory store works for local development
 * and a single instance. On Vercel, instances don't share memory, so production
 * should swap in a shared store (Upstash Redis) behind the same interface.
 */
export interface RateLimitStore {
  increment(key: string, windowMs: number): Promise<number>;
}

export class MemoryStore implements RateLimitStore {
  private hits = new Map<string, { count: number; resetAt: number }>();

  async increment(key: string, windowMs: number, now = Date.now()): Promise<number> {
    const entry = this.hits.get(key);
    if (!entry || entry.resetAt <= now) {
      this.hits.set(key, { count: 1, resetAt: now + windowMs });
      return 1;
    }
    entry.count += 1;
    return entry.count;
  }
}

const defaultStore = new MemoryStore();

export async function rateLimit(
  key: string,
  { limit, windowMs, store = defaultStore }: { limit: number; windowMs: number; store?: RateLimitStore },
): Promise<{ allowed: boolean; count: number }> {
  const count = await store.increment(key, windowMs);
  return { allowed: count <= limit, count };
}
