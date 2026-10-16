/**
 * Constant-time string comparison that works in both the Node and Edge
 * runtimes (middleware can't use node:crypto).
 */
export function safeEqual(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  for (let i = 0; i < b.length; i++) {
    diff |= (a.charCodeAt(i % (a.length || 1)) || 0) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
