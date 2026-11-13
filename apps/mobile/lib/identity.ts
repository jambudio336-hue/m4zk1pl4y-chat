import 'react-native-get-random-values';
import { useSyncExternalStore } from 'react';
import nacl from 'tweetnacl';
import * as SecureStore from 'expo-secure-store';
import { toByteArray, fromByteArray } from 'base64-js';
import { API_URL, assertApiConfigured } from './api';

const KEY_SIGN_SECRET = 'mzk.sign.secret';
const KEY_BOX_SECRET = 'mzk.box.secret';
const KEY_SESSION = 'mzk.session';

export type PublicUser = {
  id: string;
  handle: string;
  displayName: string;
  boxPublicKey: string;
  accent: string;
  bio: string;
  lastSeen: number;
};

export type Identity = {
  signSecret: Uint8Array;
  signPublic: Uint8Array;
  boxSecret: Uint8Array;
  boxPublic: Uint8Array;
};

export type Session = {
  token: string;
  user: PublicUser;
  identity: Identity;
};

const b64 = {
  encode: (bytes: Uint8Array) => fromByteArray(bytes),
  decode: (str: string) => toByteArray(str),
};

let current: Session | null = null;
let ready = false;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((fn) => fn());
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function useSession() {
  const session = useSyncExternalStore(subscribe, () => current, () => current);
  const loaded = useSyncExternalStore(subscribe, () => ready, () => ready);
  return { session, ready: loaded };
}

export function getToken(): string | null {
  return current?.token ?? null;
}

/** Random readable ID: mzk-xxxx-xxx */
export function generateHandle(): string {
  const digits = '0123456789';
  const letters = 'abcdefghjkmnpqrstuvwxyz';
  const pick = (src: string, n: number) =>
    Array.from(nacl.randomBytes(n)).map((b) => src[b % src.length]).join('');
  return `mzk-${pick(digits, 4)}-${pick(letters, 3)}`;
}

function createKeypairs(): Identity {
  const sign = nacl.sign.keyPair();
  const box = nacl.box.keyPair();
  return {
    signSecret: sign.secretKey,
    signPublic: sign.publicKey,
    boxSecret: box.secretKey,
    boxPublic: box.publicKey,
  };
}

async function persistIdentity(identity: Identity) {
  await SecureStore.setItemAsync(KEY_SIGN_SECRET, b64.encode(identity.signSecret));
  await SecureStore.setItemAsync(KEY_BOX_SECRET, b64.encode(identity.boxSecret));
}

async function loadIdentity(): Promise<Identity | null> {
  const sign = await SecureStore.getItemAsync(KEY_SIGN_SECRET);
  const box = await SecureStore.getItemAsync(KEY_BOX_SECRET);
  if (!sign || !box) return null;

  const signSecret = b64.decode(sign);
  const boxSecret = b64.decode(box);
  return {
    signSecret,
    signPublic: nacl.sign.keyPair.fromSecretKey(signSecret).publicKey,
    boxSecret,
    boxPublic: nacl.box.keyPair.fromSecretKey(boxSecret).publicKey,
  };
}

async function requestChallenge(publicKeyB64: string) {
  assertApiConfigured();
  const res = await fetch(`${API_URL}/v1/account/challenge`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ publicKey: publicKeyB64 }),
  });
  if (!res.ok) throw new Error('challenge_failed');
  return (await res.json()) as { challengeId: string; nonce: string; message: string };
}

async function persistSession(session: Session) {
  current = session;
  await SecureStore.setItemAsync(KEY_SESSION, JSON.stringify({ token: session.token, user: session.user }));
  emit();
}

/** First run: auto-assign a handle and register the device keys. */
export async function registerDevice(displayName: string, accent: string): Promise<Session> {
  const identity = createKeypairs();
  await persistIdentity(identity);

  const publicKey = b64.encode(identity.signPublic);
  const boxPublicKey = b64.encode(identity.boxPublic);

  let lastError: Error | null = null;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const challenge = await requestChallenge(publicKey);
    const signature = nacl.sign.detached(
      new TextEncoder().encode(challenge.message),
      identity.signSecret,
    );

    const res = await fetch(`${API_URL}/v1/account/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        handle: generateHandle(),
        displayName,
        publicKey,
        boxPublicKey,
        accent,
        challengeId: challenge.challengeId,
        signature: b64.encode(signature),
      }),
    });

    if (res.ok) {
      const data = (await res.json()) as { token: string; user: PublicUser };
      const session = { token: data.token, user: data.user, identity };
      await persistSession(session);
      return session;
    }

    lastError = new Error((await res.json().catch(() => ({}))).error ?? 'register_failed');
    if (lastError.message !== 'handle_taken') break;
  }
  throw lastError ?? new Error('register_failed');
}

export async function loginDevice(): Promise<Session | null> {
  const identity = await loadIdentity();
  if (!identity) return null;

  const challenge = await requestChallenge(b64.encode(identity.signPublic));
  const signature = nacl.sign.detached(
    new TextEncoder().encode(challenge.message),
    identity.signSecret,
  );

  const res = await fetch(`${API_URL}/v1/account/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ challengeId: challenge.challengeId, signature: b64.encode(signature) }),
  });
  if (!res.ok) return null;

  const data = (await res.json()) as { token: string; user: PublicUser };
  const session = { token: data.token, user: data.user, identity };
  await persistSession(session);
  return session;
}

export async function bootstrap(): Promise<void> {
  const cached = await SecureStore.getItemAsync(KEY_SESSION);
  if (cached) {
    try {
      const parsed = JSON.parse(cached) as { token: string; user: PublicUser };
      const identity = await loadIdentity();
      if (identity) current = { ...parsed, identity };
    } catch {
      /* ignore corrupt cache */
    }
  }
  ready = true;
  emit();

  if (current) {
    const refreshed = await loginDevice().catch(() => null);
    if (!refreshed) {
      // token rotation failed; keep cached session so app still opens offline
    }
  }
}

export function updateUser(user: PublicUser) {
  if (!current) return;
  current = { ...current, user };
  emit();
}

export async function signOut() {
  current = null;
  await SecureStore.deleteItemAsync(KEY_SESSION);
  emit();
}

export async function wipeDevice() {
  current = null;
  await SecureStore.deleteItemAsync(KEY_SESSION);
  await SecureStore.deleteItemAsync(KEY_SIGN_SECRET);
  await SecureStore.deleteItemAsync(KEY_BOX_SECRET);
  emit();
}

export function seal(plaintext: string, peerBoxPublicKey: string): { nonce: string; ciphertext: string } {
  if (!current) throw new Error('no_session');
  const nonce = nacl.randomBytes(nacl.box.nonceLength);
  const boxed = nacl.box(
    new TextEncoder().encode(plaintext),
    nonce,
    b64.decode(peerBoxPublicKey),
    current.identity.boxSecret,
  );
  return { nonce: b64.encode(nonce), ciphertext: b64.encode(boxed) };
}

export function open(
  ciphertext: string,
  nonce: string,
  peerBoxPublicKey: string,
): string | null {
  if (!current) return null;
  try {
    const plain = nacl.box.open(
      b64.decode(ciphertext),
      b64.decode(nonce),
      b64.decode(peerBoxPublicKey),
      current.identity.boxSecret,
    );
    return plain ? new TextDecoder().decode(plain) : null;
  } catch {
    return null;
  }
}

export const b64codec = b64;
