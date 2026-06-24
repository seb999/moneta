// Single source of truth for the user's Taskman key (app-wide).
// Persisted in localStorage; sent as X-Taskman-Key on every API call.

const KEY = 'moneta.taskmanKey'
const ASKED = 'moneta.taskmanKeyAsked'

type Listener = (key: string) => void
const listeners = new Set<Listener>()

export function getTaskmanKey(): string {
  return localStorage.getItem(KEY) ?? ''
}

export function setTaskmanKey(key: string) {
  const k = key.trim()
  if (k) localStorage.setItem(KEY, k)
  else localStorage.removeItem(KEY)
  localStorage.setItem(ASKED, '1')
  listeners.forEach(l => l(k))
}

/** True once the user has been prompted at least once (saved a key or chose default). */
export function hasBeenAsked(): boolean {
  return localStorage.getItem(ASKED) === '1'
}

export function subscribeTaskmanKey(l: Listener): () => void {
  listeners.add(l)
  return () => listeners.delete(l)
}
