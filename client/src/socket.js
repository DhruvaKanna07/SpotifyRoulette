import { io } from 'socket.io-client';

// Same-origin (Vite proxies /socket.io to the server). withCredentials ensures
// the session cookie rides along so the server can identify the player.
let socket = null;

export function getSocket() {
  if (!socket) {
    socket = io({ withCredentials: true, autoConnect: true });
  }
  return socket;
}
