import { MotionGlobalConfig } from 'motion'
import { afterAll, beforeAll, vi } from 'vitest'

const originalResizeObserver = Object.getOwnPropertyDescriptor(globalThis, 'ResizeObserver')
const originalIntersectionObserver = Object.getOwnPropertyDescriptor(globalThis, 'IntersectionObserver')
const originalMatchMedia = typeof window === 'undefined'
  ? undefined
  : Object.getOwnPropertyDescriptor(window, 'matchMedia')
const originalScrollIntoView = typeof Element === 'undefined'
  ? undefined
  : Object.getOwnPropertyDescriptor(Element.prototype, 'scrollIntoView')
const originalCss = Object.getOwnPropertyDescriptor(globalThis, 'CSS')
const originalCssEscape = typeof globalThis.CSS === 'undefined'
  ? undefined
  : Object.getOwnPropertyDescriptor(globalThis.CSS, 'escape')
const originalMotionSkipAnimations = MotionGlobalConfig.skipAnimations
MotionGlobalConfig.skipAnimations = true

beforeAll(() => {
  if (typeof window === 'undefined') return

  if (typeof globalThis.ResizeObserver === 'undefined') {
    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      unobserve() {}
      disconnect() {}
    })
  }
  if (typeof globalThis.CSS === 'undefined') {
    vi.stubGlobal('CSS', { escape: escapeCssIdentifier })
  } else if (typeof globalThis.CSS.escape !== 'function') {
    Object.defineProperty(globalThis.CSS, 'escape', { configurable: true, value: escapeCssIdentifier })
  }
  if (typeof globalThis.IntersectionObserver === 'undefined') {
    vi.stubGlobal('IntersectionObserver', class {
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
  MotionGlobalConfig.skipAnimations = originalMotionSkipAnimations
  if (typeof window === 'undefined') return

  restoreGlobal('ResizeObserver', originalResizeObserver)
  restoreGlobal('IntersectionObserver', originalIntersectionObserver)
  restoreGlobal('matchMedia', originalMatchMedia, window)
  restoreGlobal('scrollIntoView', originalScrollIntoView, Element.prototype)
  if (originalCss !== undefined) {
    const css = globalThis.CSS
    if (css !== undefined) restoreGlobal('escape', originalCssEscape, css)
  }
  restoreGlobal('CSS', originalCss)
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

function escapeCssIdentifier(value: string): string {
  const string = String(value)
  let result = ''
  const firstCodeUnit = string.charCodeAt(0)
  for (let index = 0; index < string.length; index += 1) {
    const codeUnit = string.charCodeAt(index)
    if (codeUnit === 0) {
      result += '\uFFFD'
    } else if (
      (codeUnit >= 1 && codeUnit <= 31) ||
      codeUnit === 127 ||
      (index === 0 && codeUnit >= 48 && codeUnit <= 57) ||
      (index === 1 && codeUnit >= 48 && codeUnit <= 57 && firstCodeUnit === 45)
    ) {
      result += `\\${codeUnit.toString(16)} `
    } else if (index === 0 && codeUnit === 45 && string.length === 1) {
      result += `\\${string.charAt(index)}`
    } else if (
      codeUnit >= 128 ||
      codeUnit === 45 ||
      codeUnit === 95 ||
      (codeUnit >= 48 && codeUnit <= 57) ||
      (codeUnit >= 65 && codeUnit <= 90) ||
      (codeUnit >= 97 && codeUnit <= 122)
    ) {
      result += string.charAt(index)
    } else {
      result += `\\${string.charAt(index)}`
    }
  }
  return result
}
