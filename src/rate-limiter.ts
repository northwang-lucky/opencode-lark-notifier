export const DEFAULT_RATE_LIMIT_MS = 30000; // 30 seconds
export const DEFAULT_COOLDOWN_MS = 5000; // 5 seconds

/**
 * Create a rate limiter that prevents sending too many messages.
 * Uses a Map to track the last send time per key.
 * When windowMs === 0, always allows sending (no limit).
 */
export function createRateLimiter(windowMs: number) {
  const lastSent = new Map<string, number>();

  return {
    canSend(key: string): boolean {
      if (windowMs <= 0) return true;

      const now = Date.now();
      const last = lastSent.get(key);

      if (last !== undefined && now - last < windowMs) {
        return false; // Still within window
      }

      lastSent.set(key, now);
      return true;
    },
  };
}

/**
 * Create an idle cooldown tracker for session.idle events.
 * - idle(sessionId): Record that a session entered idle state
 * - busy(sessionId): Cancel pending notification (reset)
 * - shouldNotify(sessionId): Returns true if idle > cooldownMs and no busy received
 */
export function createCooldown(cooldownMs: number) {
  const idleTimes = new Map<string, number>();
  const resetSessions = new Set<string>();

  return {
    idle(sessionId: string): void {
      idleTimes.set(sessionId, Date.now());
      resetSessions.delete(sessionId);
    },

    busy(sessionId: string): void {
      resetSessions.add(sessionId);
      idleTimes.delete(sessionId);
    },

    shouldNotify(sessionId: string): boolean {
      // If explicitly reset by busy, don't notify
      if (resetSessions.has(sessionId)) {
        return false;
      }

      const idleTime = idleTimes.get(sessionId);
      if (idleTime === undefined) return false;

      const elapsed = Date.now() - idleTime;
      if (elapsed >= cooldownMs) {
        // Clear after checking to prevent duplicate notifications
        idleTimes.delete(sessionId);
        return true;
      }

      return false;
    },
  };
}
