import { getToken } from './identity';
import * as Crypto from 'expo-crypto';

const configuredApiUrl = process.env.EXPO_PUBLIC_API_URL?.trim().replace(/\/+$/, '');
export const API_URL = configuredApiUrl ?? '';

export function assertApiConfigured(): void {
  if (!API_URL) throw new Error('server_not_configured: API production URL belum diatur.');
}

export type Contact = {
  contactId: string;
  status: 'pending' | 'accepted';
  direction?: 'incoming' | 'outgoing';
  createdAt: number;
  peer: { id: string; handle: string; displayName: string; boxPublicKey: string; accent: string; bio: string; lastSeen: number; avatarUrl?: string | null };
};

export type WireMessage = {
  id: string; senderId: string; recipientId: string; nonce: string; ciphertext: string;
  kind: 'text' | 'image' | 'voice' | 'video' | 'deleted'; createdAt: number; readAt: number | null;
  serverSeq?: number; clientMsgId?: string | null; status?: 'queued' | 'sent' | 'delivered' | 'read' | 'failed';
  reactions?: { emoji: string; count: number; mine: boolean }[]; deletedAt?: number | null;
};

export class ApiError extends Error {
  status: number;
  constructor(status: number, code: string) { super(code); this.status = status; }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  assertApiConfigured();
  const token = getToken();
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...(init.headers ?? {}) },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string };
    throw new ApiError(res.status, body.error ?? 'request_failed');
  }
  if (res.status === 204) return undefined as T;
  return await res.json() as T;
}

export const api = {
  me: () => request<{ user: any }>('/v1/account/me'),
  sessions: () => request<{ sessions: { id: string; deviceLabel: string; createdAt: number; current: boolean }[] }>('/v1/account/sessions'),
  revokeSession: (sessionId: string) => request<{ ok: true }>(`/v1/account/sessions/${encodeURIComponent(sessionId)}`, { method: 'DELETE' }),
  patchMe: (patch: { displayName?: string; bio?: string; accent?: string }) => request<{ user: any }>('/v1/account/me', { method: 'PATCH', body: JSON.stringify(patch) }),
  uploadAvatar: (base64: string, mimeType: string) => request<{ user: any }>('/v1/account/avatar', { method: 'POST', body: JSON.stringify({ base64, mimeType }) }),
  deleteAvatar: () => request<{ user: any }>('/v1/account/avatar', { method: 'DELETE' }),
  pushLocation: (lat: number, lng: number) => request<{ ok: true }>('/v1/account/location', { method: 'POST', body: JSON.stringify({ lat, lng }) }),
  deleteAccount: () => request<{ ok: true }>('/v1/account/me', { method: 'DELETE' }),
  contacts: () => request<{ contacts: Contact[] }>('/v1/contacts'),
  addContact: (handle: string) => request<{ contactId: string; status: string; peer: Contact['peer'] }>('/v1/contacts', { method: 'POST', body: JSON.stringify({ handle }) }),
  acceptContact: (contactId: string) => request<{ ok: true }>(`/v1/contacts/${contactId}/accept`, { method: 'PATCH' }),
  removeContact: (contactId: string) => request<{ ok: true }>(`/v1/contacts/${contactId}`, { method: 'DELETE' }),
  messages: (peerId: string, before?: number) => request<{ messages: WireMessage[] }>(`/v1/messages/${peerId}${before ? `?before=${before}` : ''}`),
  sendMessage: (to: string, nonce: string, ciphertext: string, kind = 'text', clientMsgId = Crypto.randomUUID()) =>
    request<{ message: WireMessage }>('/v1/messages', { method: 'POST', body: JSON.stringify({ to, nonce, ciphertext, kind, clientMsgId }) }),
  reactToMessage: (messageId: string, emoji: string) =>
    request<{ reactions: { emoji: string; count: number; mine: boolean }[] }>(`/v1/messages/${encodeURIComponent(messageId)}/reactions`, { method: 'POST', body: JSON.stringify({ emoji }) }),
  deleteMessage: (messageId: string, mode: 'me' | 'everyone') =>
    request<{ ok: true; deletedAt?: number }>(`/v1/messages/${encodeURIComponent(messageId)}?mode=${mode}`, { method: 'DELETE' }),
  markRead: (peerId: string) => request<{ ok: true }>(`/v1/messages/${peerId}/read`, { method: 'POST' }),
  stories: () => request<{ stories: any[] }>('/v1/stories'),
  postStory: (nonce: string, ciphertext: string, recipients: { userId: string; nonce: string; ciphertext: string }[], kind = 'text') =>
    request<{ id: string }>('/v1/stories', { method: 'POST', body: JSON.stringify({ nonce, ciphertext, recipients, kind }) }),
  viewStory: (storyId: string) => request<{ ok: true }>(`/v1/stories/${storyId}/view`, { method: 'POST' }),
  deleteStory: (storyId: string) => request<{ ok: true }>(`/v1/stories/${storyId}`, { method: 'DELETE' }),
  nearby: (radius = 2000) => request<{ users: any[]; reason?: string }>(`/v1/nearby?radius=${radius}`),
  blocks: () => request<{ blocked: any[] }>('/v1/blocks'),
  block: (userId: string) => request<{ blocked: any }>('/v1/blocks', { method: 'POST', body: JSON.stringify({ userId }) }),
  unblock: (peerId: string) => request<{ ok: true }>(`/v1/blocks/${peerId}`, { method: 'DELETE' }),
};
