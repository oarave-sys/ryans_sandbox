// A tiny event bus so the UI can refresh after data changes (replacing Dexie's
// liveQuery reactivity) and react globally when the session expires.

type Handler = () => void;

const revalidateHandlers = new Set<Handler>();
const unauthorizedHandlers = new Set<Handler>();

/** Notify all live views that data changed and they should refetch. */
export function revalidate(): void {
  revalidateHandlers.forEach((h) => h());
}
export function onRevalidate(h: Handler): () => void {
  revalidateHandlers.add(h);
  return () => revalidateHandlers.delete(h);
}

/** Fired when an API call returns 401 — the app should show the login screen. */
export function emitUnauthorized(): void {
  unauthorizedHandlers.forEach((h) => h());
}
export function onUnauthorized(h: Handler): () => void {
  unauthorizedHandlers.add(h);
  return () => unauthorizedHandlers.delete(h);
}
