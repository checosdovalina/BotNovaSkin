const WINDOW_MS = 15 * 60 * 1000;
const EMAIL_IP_LIMIT = 5;
const IP_LIMIT = 20;
const failures = new Map<string, { count: number; expiresAt: number }>();

function getLiveFailureCount(key: string, now: number): number {
  const entry = failures.get(key);
  if (!entry) return 0;
  if (entry.expiresAt <= now) {
    failures.delete(key);
    return 0;
  }
  return entry.count;
}

function pairKey(email: string, ip: string): string {
  return `pair:${JSON.stringify([email, ip])}`;
}

function ipKey(ip: string): string {
  return `ip:${ip}`;
}

export function isLoginRateLimited(email: string, ip: string, now = Date.now()): boolean {
  return getLiveFailureCount(pairKey(email, ip), now) >= EMAIL_IP_LIMIT ||
    getLiveFailureCount(ipKey(ip), now) >= IP_LIMIT;
}

function increment(key: string, now: number): void {
  const current = getLiveFailureCount(key, now);
  const entry = failures.get(key);
  if (entry && entry.expiresAt > now) entry.count = current + 1;
  else failures.set(key, { count: 1, expiresAt: now + WINDOW_MS });
  if (failures.size > 20_000) {
    const oldest = failures.keys().next().value;
    if (oldest) failures.delete(oldest);
  }
}

export function recordLoginFailure(email: string, ip: string, now = Date.now()): boolean {
  increment(pairKey(email, ip), now);
  increment(ipKey(ip), now);
  return isLoginRateLimited(email, ip, now);
}

export function clearLoginFailurePair(email: string, ip: string): void {
  failures.delete(pairKey(email, ip));
}