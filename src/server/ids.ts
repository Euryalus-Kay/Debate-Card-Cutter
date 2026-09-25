/** Prefixed, URL-safe, sortable-enough random ids (e.g. "rnd_3f9k…"). */
export function newId(prefix: string): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  const alphabet = "0123456789abcdefghijklmnopqrstuvwxyz";
  let out = "";
  for (const b of bytes) out += alphabet[b % 36];
  // Time component keeps ids roughly ordered for easier debugging.
  return `${prefix}_${Date.now().toString(36)}${out}`;
}

export function randomToken(bytes = 24): string {
  const b = new Uint8Array(bytes);
  crypto.getRandomValues(b);
  return Buffer.from(b).toString("base64url");
}
