/**
 * Join codes are typed, pasted, read aloud and forwarded in messages, so
 * they arrive in every shape imaginable. Normalise before sending one to
 * the database, which matches exactly.
 */

/** The alphabet codes are minted from: no 0/O and no 1/I/L. */
const ALPHABET = '[2-9A-HJ-NP-Z]';
const EMBEDDED = new RegExp(`${ALPHABET}{4}[\\s-]*${ALPHABET}{4}`);

export function normalizeJoinCode(input: string): string {
  const upper = (input ?? '').toUpperCase();

  // A code pasted inside a message — "here you go: YAY5-TZFT" — is worth
  // pulling out. Ordinary words cannot be mistaken for one, because the
  // alphabet leaves out the letters that would make them.
  const embedded = upper.match(EMBEDDED);
  const source = embedded ? embedded[0] : upper;

  const chars = source.replace(/[^0-9A-Z]/g, '').slice(0, 8);
  return chars.length > 4 ? `${chars.slice(0, 4)}-${chars.slice(4)}` : chars;
}

/** True once there is enough to be worth sending. */
export function isCompleteJoinCode(input: string): boolean {
  return normalizeJoinCode(input).length === 9;
}
