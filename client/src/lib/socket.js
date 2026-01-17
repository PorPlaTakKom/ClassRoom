import { io } from "socket.io-client";

let socket;

const SOCKET_BASE = (() => {
  if (import.meta.env.VITE_API_URL) return import.meta.env.VITE_API_URL;
  if (typeof window === "undefined") return "http://localhost:4000";
  const { protocol, hostname, port, origin } = window.location;
  if (port === "5173") {
    return `${protocol}//${hostname}:4000`;
  }
  return origin;
})();

export function getSocket() {
  if (!socket) {
    socket = io(SOCKET_BASE);
  }
  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
