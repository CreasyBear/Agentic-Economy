import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const globalsCssPath = fileURLToPath(new URL('../../../src/styles/globals.css', import.meta.url))
const GLOBALS_CSS = readFileSync(globalsCssPath, 'utf8')

function extractBlock(css: string, header: RegExp): string {
  const m = header.exec(css)
  if (!m) return ''
  let depth = 0
  let start = -1
  for (let i = m.index; i < css.length; i++) {
    const ch = css[i]
    if (ch === '{') {
      if (depth === 0) start = i + 1
      depth++
    } else if (ch === '}') {
      depth--
      if (depth === 0 && start !== -1) return css.slice(start, i)
    }
  }
  throw new Error(`Unbalanced braces after ${header}`)
}

function parseDeclValue(block: string, name: string): string | undefined {
  const match = block.match(new RegExp(`${name}\\s*:\\s*([^;]+);`))
  return match?.[1]?.trim()
}

function hexToRgb(hex: string): [number, number, number] {
  const normalized = hex.replace('#', '')
  const value =
    normalized.length === 3
      ? normalized
          .split('')
          .map((c) => c + c)
          .join('')
      : normalized
  const int = Number.parseInt(value, 16)
  return [(int >> 16) & 255, (int >> 8) & 255, int & 255]
}

function srgbChannelToLinear(channel: number): number {
  const c = channel / 255
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

function relativeLuminance(hex: string): number {
  const rgb = hexToRgb(hex).map(srgbChannelToLinear)
  const r = rgb[0] ?? 0
  const g = rgb[1] ?? 0
  const b = rgb[2] ?? 0
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrastRatio(foregroundHex: string, backgroundHex: string): number {
  const fg = relativeLuminance(foregroundHex)
  const bg = relativeLuminance(backgroundHex)
  const lighter = Math.max(fg, bg)
  const darker = Math.min(fg, bg)
  return (lighter + 0.05) / (darker + 0.05)
}

const strippedGlobals = GLOBALS_CSS.replace(/\/\*[\s\S]*?\*\//g, '')
const darkBlock = extractBlock(strippedGlobals, /\.dark\s*\{/)

describe('dark mode contrast (S-17)', () => {
  const background = '#141414'
  const foreground = '#e8e4da'
  const mutedForeground = '#aaa89e'

  it('meets WCAG AAA for primary foreground on background', () => {
    expect(contrastRatio(foreground, background)).toBeGreaterThanOrEqual(7)
  })

  it('meets WCAG AA for muted foreground on background', () => {
    expect(contrastRatio(mutedForeground, background)).toBeGreaterThanOrEqual(4.5)
  })

  it('uses raised surface for accent (elevated hover)', () => {
    expect(parseDeclValue(darkBlock, '--accent')).toBe('var(--ae-surface-raised)')
  })

  it('uses sunken surface for muted wells and rails', () => {
    expect(parseDeclValue(darkBlock, '--muted')).toBe('var(--ae-surface-sunken)')
  })

  it('declares calibrated dark surface and border tokens', () => {
    expect(parseDeclValue(darkBlock, '--ae-surface-raised')).toBe('#242424')
    expect(parseDeclValue(darkBlock, '--ae-surface-sunken')).toBe('#0f0f0f')
    expect(parseDeclValue(darkBlock, '--ae-hairline')).toBe('color-mix(in srgb, var(--ae-fg) 8%, transparent)')
    expect(parseDeclValue(darkBlock, '--border')).toBe('var(--ae-hairline)')
  })
})
