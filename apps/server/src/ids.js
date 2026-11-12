import crypto from 'node:crypto';

const ALPHABET = '0123456789abcdefghjkmnpqrstvwxyz';

/** Crockford-ish base32 id. URL safe, no padding, sortable-ish by prefix. */
export function id(size = 20) {
  const bytes = crypto.randomBytes(size);
  let out = '';
  for (let i = 0; i < size; i += 1) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

export function prefixed(prefix) {
  return `${prefix}_${id()}`;
}
