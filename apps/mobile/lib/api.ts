import { getToken } from './identity';

const configuredApiUrl = process.env.EXPO_PUBLIC_API_URL?.trim().replace(/\\/+$/, '');
export const API_URL = configuredApiUrl ?? '';

export function assertApiConfigured(): void {
  if (!API_URL) {
    throw new Error('server_not_configured: API production URL belum diatur.');
  }
}

export type Contact = {
  contactId: string;
  status: 'pending' | 'accepted';
  createdAt: number;
  peer: {
    id: string;
    handle: string;
    displayName: string;
    boxPublicKey: string;
    accent: string;
    bio: string;
    lastSeen: number;
  };
};

export type WireMessage = {
  id: string;
  senderId: string;
  recipientId: string;
  nonce: string;
  ciphertext: string;
  kind: 'text' | 'image' | 'voice';
  createdAt: number;
  readAt: number | null;
};

export class ApiError extends Error {
  status: number;
  constructor(status: number, code: string) {
    super(code);
    this.status = status;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  assertApiConfigured();
  const token = getToken();
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {}),
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}) as { error?: string });
    throw new ApiError(res.status, body.error ?? 'request_failed');
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  me: () => request<{ user: any }>('/v1/account/me'),

  patchMe: (patch: { displayName?: string; bio?: string; accent?: string }) =>
    request<{ user: any }>('/v1/account/me', { method: 'PATCH', body: JSON.stringify(patch) }),

  pushLocation: (lat: number, lng: number) =>
    request<{ ok: true }>('/v1/account/location', {
      method: 'POST',
      body: JSON.stringify({ lat, lng }),
    }),

  deleteAccount: () => request<{ ok: true }>('/v1/account/me', { method: 'DELETE' }),

  contacts: () => request<{ contacts: Contact[] }>('/v1/contacts'),

  addContact: (handle: string) =>
    request<{ contactId: string; status: string; peer: Contact['peer'] }>('/v1/contacts', {
      method: 'POST',
      body: JSON.stringify({ handle }),
    }),

  acceptContact: (contactId: string) =>
    request<{ ok: true }>(`/v1/contacts/${contactId}/accept`, { method: 'PATCH' }),

  removeContact: (contactId: string) =>
    request<{ ok: true }>(`/v1/contacts/${contactId}`, { method: 'DELETE' }),

  messages: (peerId: string, before?: number) =>
    request<{ messages: WireMessage[] }>(
      `/v1/messages/${peerId}${before ? `?before=${before}` : ''}`,
    ),

  sendMessage: (to: string, nonce: string, ciphertext: string, kind = 'text') =>
    request<{ message: WireMessage }>('/v1/messages', {
      method: 'POST',
      body: JSON.stringify({ to, nonce, ciphertext, kind }),
    }),

  markRead: (peerId: string) =>
    request<{ ok: true }>(`/v1/messages/${peerId}/read`, { method: 'POST' }),

  stories: () => request<{ stories: any[] }>('/v1/stories'),

  postStory: (nonce: string, ciphertext: string, kind = 'text') =>
    request<{ id: string }>('/v1/stories', {
      method: 'POST',
      body: JSON.stringify({ nonce, ciphertext, kind }),
    }),

  viewStory: (storyId: string) =>
    request<{ ok: true }>(`/v1/stories/${storyId}/view`, { method: 'POST' }),

  deleteStory: (storyId: string) =>
    request<{ ok: true }>(`/v1/stories/${storyId}`, { method: 'DELETE' }),

  nearby: (radius = 2000) =>
    request<{ users: any[]; reason?: string }>(`/v1/nearby?radius=${radius}`),

  blocks: () => request<{ blocked: any[] }>('/v1/blocks'),

  block: (userId: string) =>
    request<{ blocked: any }>('/v1/blocks', { method: 'POST', body: JSON.stringify({ userId }) }),

  unblock: (peerId: string) => request<{ ok: true }>(`/v1/blocks/${peerId}`, { method: 'DELETE' }),
};
