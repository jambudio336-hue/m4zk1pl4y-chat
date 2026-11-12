import { io, type Socket } from 'socket.io-client';
import { API_URL } from './api';
import { getToken } from './identity';

let socket: Socket | null = null;

export function connectSocket(): Socket {
  const token = getToken();
  if (socket?.connected) return socket;

  socket?.disconnect();
  socket = io(API_URL, {
    transports: ['websocket'],
    auth: { token },
    reconnection: true,
    reconnectionDelay: 800,
    reconnectionDelayMax: 5000,
  });
  return socket;
}

export function getSocket(): Socket | null {
  return socket;
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
}
