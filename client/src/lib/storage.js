const STORAGE_KEY = "live-learning-user";

export function storeUser(user) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
}

export function getStoredUser() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (error) {
    return null;
  }
}

export function clearStoredUser() {
  localStorage.removeItem(STORAGE_KEY);
}
