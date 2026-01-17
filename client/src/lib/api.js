import axios from "axios";

const API_BASE = (() => {
  if (import.meta.env.VITE_API_URL) return import.meta.env.VITE_API_URL;
  if (typeof window === "undefined") return "http://localhost:4000";
  const { protocol, hostname, port, origin } = window.location;
  if (port === "5173") {
    return `${protocol}//${hostname}:4000`;
  }
  return origin;
})();

const api = axios.create({
  baseURL: API_BASE
});

export function getApiBase() {
  return API_BASE;
}

export async function fetchRooms() {
  const { data } = await api.get("/api/rooms");
  return data;
}

export async function createRoom(payload) {
  const { data } = await api.post("/api/rooms", payload);
  return data;
}

export async function fetchRoom(roomId) {
  const { data } = await api.get(`/api/rooms/${roomId}`);
  return data;
}

export async function fetchRoomFiles(roomId) {
  const { data } = await api.get(`/api/rooms/${roomId}/files`);
  return data;
}

export async function uploadRoomFile(roomId, file) {
  const formData = new FormData();
  formData.append("file", file);
  const { data } = await api.post(`/api/rooms/${roomId}/files`, formData, {
    headers: { "Content-Type": "multipart/form-data" }
  });
  return data;
}

export async function deleteRoomFile(roomId, fileId) {
  await api.delete(`/api/rooms/${roomId}/files/${fileId}`);
}
