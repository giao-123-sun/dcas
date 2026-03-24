// Browser shim for node:crypto — provides randomUUID via Web Crypto API
export function randomUUID(): string {
  return crypto.randomUUID();
}
