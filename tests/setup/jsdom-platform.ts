import { afterAll, beforeAll, vi } from 'vitest'

const originalResizeObserver = Object.getOwnPropertyDescriptor(globalThis, 'ResizeObserver')
const originalMatchMedia = typeof window === 'undefined'
  ? undefined
  : Object.getOwnPropertyDescriptor(window, 'matchMedia')
const originalScrollIntoView = typeof Element === 'undefined'
  ? undefined
  : Object.getOwnPropertyDescriptor(Element.prototype, 'scrollIntoView')

beforeAll(() => {
  if (typeof window === 'undefined') return

  if (typeof globalThis.ResizeObserver === 'undefined') {
    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      unobserve() {}
      disconnect() {}
    })
  }
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  })
  Object.defineProperty(Element.prototype, 'scrollIntoView', {
    configurable: true,
    value: vi.fn(),
  })
})

afterAll(() => {
  if (typeof window === 'undefined') return

  restoreGlobal('ResizeObserver', originalResizeObserver)
  restoreGlobal('matchMedia', originalMatchMedia, window)
  restoreGlobal('scrollIntoView', originalScrollIntoView, Element.prototype)
})

function restoreGlobal(
  name: string,
  descriptor: PropertyDescriptor | undefined,
  target: object = globalThis,
): void {
  if (descriptor === undefined) {
    Reflect.deleteProperty(target, name)
    return
  }
  Object.defineProperty(target, name, descriptor)
}
