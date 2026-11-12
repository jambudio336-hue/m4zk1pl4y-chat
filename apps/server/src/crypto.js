import crypto from 'node:crypto';
import nacl from 'tweetnacl';

export const b64 = {
  encode: (bytes) => Buffer.from(bytes).toString('base64url'),
  decode: (str) => new Uint8Array(Buffer.from(str, 'base64url')),
};

export function sha256(input) {
  return crypto.createHash('sha256').update(input).digest('hex');
}

export function randomBytes(size = 32) {
  return crypto.randomBytes(size);
}

/** Verify an Ed25519 detached signature over a UTF-8 message. */
export function verifySignature(message, signatureB64, publicKeyB64) {
  try {
    return nacl.sign.detached.verify(
      new TextEncoder().encode(message),
      b64.decode(signatureB64),
      b64.decode(publicKeyB64),
    );
  } catch {
    return false;
  }
}

export function isValidPublicKey(publicKeyB64, expectedLength = 32) {
  try {
    return b64.decode(publicKeyB64).length === expectedLength;
  } catch {
    return false;
  }
}
