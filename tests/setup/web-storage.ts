/**
 * Node 25 ships a built-in global `localStorage` / `sessionStorage` that
 * shadows the jsdom implementation and does not provide `clear`, `key`, or
 * `length`. Any jsdom test calling `localStorage.clear()` therefore throws
 * before its first assertion, which silently disabled whole suites rather than
 * failing loudly on a real regression.
 *
 * This installs a complete, per-file Web Storage implementation so jsdom tests
 * exercise the storage behavior they were written for. Node-environment tests
 * are untouched: without a `window` there is nothing to shadow, and product
 * code reaches storage only through browser-only paths.
 */

installWebStorage('localStorage')
installWebStorage('sessionStorage')

function installWebStorage(name: 'localStorage' | 'sessionStorage'): void {
  if (typeof window === 'undefined') return

  const existing: unknown = Reflect.get(globalThis, name)
  if (isCompleteStorage(existing)) return

  const storage = createStorage()
  Object.defineProperty(globalThis, name, { configurable: true, value: storage })
  Object.defineProperty(window, name, { configurable: true, value: storage })
}

function isCompleteStorage(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Partial<Storage>
  return typeof candidate.clear === 'function'
    && typeof candidate.key === 'function'
    && typeof candidate.getItem === 'function'
    && typeof candidate.setItem === 'function'
    && typeof candidate.removeItem === 'function'
}

function createStorage(): Storage {
  const entries = new Map<string, string>()
  return {
    get length() { return entries.size },
    key(index: number) { return [...entries.keys()][index] ?? null },
    getItem(key: string) { return entries.get(String(key)) ?? null },
    setItem(key: string, value: string) { entries.set(String(key), String(value)) },
    removeItem(key: string) { entries.delete(String(key)) },
    clear() { entries.clear() },
  }
}
