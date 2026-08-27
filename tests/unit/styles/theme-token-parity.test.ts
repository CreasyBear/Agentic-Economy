/**
 * Theme-token parity harness over AE's Tailwind v4 token source of truth.
 *
 * Mapped reality (2026-08-27):
 * - The ONLY product token file is `src/styles/globals.css`: one `@theme inline`
 *   bridge that maps Tailwind-facing tokens onto runtime variables declared in
 *   a single `:root` block. There is no `.dark` variable split anywhere in src;
 *   dark-ish surfaces use `[data-ae-scheme="ink"]` component-local overrides in
 *   `src/styles/base.css`, which cascade intentionally rather than redefine the
 *   palette. So the twenty-ui cornerShapeThemeParity idea ("same vocabulary in
 *   every variant") becomes, here:
 *     (a) bridge parity  — every `@theme inline` var() reference resolves,
 *         transitively, without cycles;
 *     (b) semantic completeness — bg/fg-class pairs and named status families
 *         stay intact and arities symmetric across siblings;
 *     (c) no stale/duplicate keys — no double-declared custom property inside
 *         a scope, no self-referential tokens.
 * Failures always name the offending key(s).
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const stylesDir = fileURLToPath(new URL('../../../src/styles/', import.meta.url))
const GLOBALS_CSS = readFileSync(`${stylesDir}globals.css`, 'utf8')
const BASE_CSS = readFileSync(`${stylesDir}base.css`, 'utf8')

type Decl = { name: string; value: string }


/** Extract the body of the first `{...}` block whose header matches, via brace counting. */
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

function parseDecls(body: string): Decl[] {
  return [...body.matchAll(/--[A-Za-z0-9-]+\s*:\s*[^;{}]+;/g)].map((raw) => {
    const [decl] = raw
    const sep = decl.indexOf(':')
    return {
      name: decl.slice(0, sep).trim(),
      value: decl.slice(sep + 1).replace(/;\s*$/, '').trim(),
    }
  })
}

const strippedGlobals = GLOBALS_CSS.replace(/\/\*[\s\S]*?\*\//g, '')
const strippedBase = BASE_CSS.replace(/\/\*[\s\S]*?\*\//g, '')

const themeBody = extractBlock(strippedGlobals, /@theme(?:\s+[a-z]+)?\s*\{/)
const rootBody = extractBlock(strippedGlobals, /:root\s*\{/)

const themeDecls = parseDecls(themeBody)
const rootDecls = parseDecls(rootBody)

/** Every custom property declared anywhere in either style file (any scope). */
const universe = new Map<string, string>()
for (const css of [strippedGlobals, strippedBase]) {
  for (const raw of css.matchAll(/--[A-Za-z0-9-]+\s*:\s*[^;{}]+;/g)) {
    const decl = String(raw)
    const sep = decl.indexOf(':')
    const name = decl.slice(0, sep).trim()
    if (!universe.has(name)) universe.set(name, decl.slice(sep + 1).replace(/;\s*$/, '').trim())
  }
}

/** Recursively verify `name` resolves through var() chains, naming the path on failure. */
function assertResolvable(name: string, referrerChain: string[]): void {
  if (referrerChain.includes(name)) {
    throw new Error(
      `Cyclic token chain: ${[...referrerChain, name].join(' -> ')}`,
    )
  }
  const value = universe.get(name)
  if (value === undefined) {
    throw new Error(
      `Undefined token ${name}, referenced by ${referrerChain.join(' -> ') || '@theme bridge'}`,
    )
  }
  for (const inner of value.matchAll(/var\(\s*(--[A-Za-z0-9-]+)/g)) {
    if (inner[1] === undefined) continue
    assertResolvable(inner[1], [...referrerChain, name])
  }
}

describe('AE theme token parity (src/styles/globals.css)', () => {
  it('(a) every @theme inline var() bridge resolves fully, without cycles', () => {
    for (const { name, value } of themeDecls) {
      for (const ref of value.matchAll(/var\(\s*(--[A-Za-z0-9-]+)/g)) {
        const refName = ref[1]
        expect(refName).toBeDefined()
        if (refName === undefined) continue
        expect(() => assertResolvable(refName, [name])).not.toThrow()
      }
    }
  })

  it('(b1) required bg/fg-class semantic bridges exist as AE names them', () => {
    // Alias token -> runtime token it must be bridged to/with. Derived from the
    // actual bridge rows: surface names solo, shadcn topics paired with -foreground.
    const semanticAliases = [
      'background',
      'foreground',
      'container',
      'card',
      'card-foreground',
      'popover',
      'popover-foreground',
      'primary',
      'primary-foreground',
      'secondary',
      'secondary-foreground',
      'muted',
      'muted-foreground',
      'accent',
      'accent-foreground',
      'destructive',
      'destructive-foreground',
      'border',
      'border-strong',
      'input',
      'ring',
    ]
    const themeNames = new Set(themeDecls.map((d) => d.name))
    const rootNames = new Set(rootDecls.map((d) => d.name))
    const missingAlias = semanticAliases.filter((n) => !themeNames.has(`--color-${n}`))
    const missingRuntime = semanticAliases.filter((n) => {
      // border-strong bridges to --ae-border-strong rather than --border-strong.
      if (n === 'border-strong') return !rootNames.has('--ae-border-strong')
      return !rootNames.has(`--${n}`)
    })
    const problems: string[] = []
    if (missingAlias.length) problems.push(`missing @theme aliases: ${missingAlias.map((n) => `--color-${n}`).join(', ')}`)
    if (missingRuntime.length) problems.push(`missing :root runtimes: ${missingRuntime.map((n) => (n === 'border-strong' ? '--ae-border-strong' : `--${n}`)).join(', ')}`)
    expect(problems, problems.join('; ')).toEqual([])
  })

  it('(b2) brand + status families define symmetric member vocabulary', () => {
    const rootNames = new Set(rootDecls.map((d) => d.name))
    const themeNames = new Set(themeDecls.map((d) => d.name))
    const problems: string[] = []

    // Brand quartet.
    for (const member of ['', '-strong', '-muted']) {
      if (!themeNames.has(`--color-brand${member}`)) problems.push(`missing --color-brand${member}`)
      if (!rootNames.has(`--ae-brand${member}`)) problems.push(`missing --ae-brand${member}`)
    }
    if (!themeNames.has('--color-on-brand')) problems.push('missing --color-on-brand')
    if (!rootNames.has('--ae-on-brand')) problems.push('missing --ae-on-brand')

    // Status families must expose IDENTICAL member shapes (the AE analogue of
    // theme-vocabulary parity: success/warning/info each need base/ring/subtle/foreground).
    const families = ['success', 'warning', 'info']
    const members = ['', '-ring', '-subtle', '-foreground']
    for (const family of families) {
      const absent = members.filter(
        (member) =>
          !themeNames.has(`--color-${family}${member}`) ||
          !rootNames.has(`--ae-${family}${member}`),
      )
      if (absent.length) {
        problems.push(`incomplete ${family} family: ${absent.map((m) => `--color-${family}${m}/--ae-${family}${m}`).join(', ')}`)
      }
    }
    // Danger keeps base triplet on runtime side; its colour utilities ship via
    // --color-destructive + aria/ring usage, never red/green duplicate aliases.
    const dangerAbsent = ['danger', 'danger-ring', 'danger-subtle'].filter((n) => !rootNames.has(`--ae-${n}`))
    if (dangerAbsent.length) problems.push(`missing danger runtimes: ${dangerAbsent.map((n) => `--ae-${n}`).join(', ')}`)

    expect(problems, problems.join('; ')).toEqual([])
  })

  it('(b3) font, motion, and layout vocabulary stays bridged', () => {
    const themeNames = new Set(themeDecls.map((d) => d.name))
    const rootNames = new Set(rootDecls.map((d) => d.name))
    const problems: string[] = []
    for (const required of [
      '--font-sans',
      '--font-heading',
      '--font-display',
      '--font-mono',
      '--duration-fast',
      '--duration-base',
      '--duration-slow',
      '--ease-standard',
      '--ease-emphasized',
    ]) {
      if (!themeNames.has(required)) problems.push(`missing @theme ${required}`)
    }
    for (const required of [
      '--ae-font-sans',
      '--ae-font-display',
      '--ae-font-mono',
      '--motion-duration-fast',
      '--motion-duration-base',
      '--motion-duration-slow',
      '--motion-ease-standard',
      '--motion-ease-emphasized',
    ]) {
      if (!rootNames.has(required)) problems.push(`missing :root ${required}`)
    }
    // Sidebar octet keeps parity with the shadcn surface contract.
    const sidebarMembers = [
      'sidebar',
      'sidebar-foreground',
      'sidebar-primary',
      'sidebar-primary-foreground',
      'sidebar-accent',
      'sidebar-accent-foreground',
      'sidebar-border',
      'sidebar-ring',
    ]
    const sidebarMissing = sidebarMembers.filter((n) => !themeNames.has(`--color-${n}`) || !rootNames.has(`--${n}`))
    if (sidebarMissing.length) problems.push(`missing sidebar tokens: ${sidebarMissing.map((n) => `--color-${n}/--${n}`).join(', ')}`)
    expect(problems, problems.join('; ')).toEqual([])
  })

  it('(c1) no duplicate custom-property declarations inside a scope', () => {
    for (const [scope, decls] of [
      ['@theme inline', themeDecls],
      [':root', rootDecls],
    ] as const) {
      const seen = new Map<string, number>()
      for (const { name } of decls) seen.set(name, (seen.get(name) ?? 0) + 1)
      const dupes = [...seen.entries()].filter(([, count]) => count > 1).map(([name]) => `${name} x${seen.get(name)}`)
      expect(dupes, `duplicate keys in ${scope}: ${dupes.join(', ')}`).toEqual([])
    }
  })

  it('(c2) no self-referential token definitions anywhere in style sources', () => {
    const selfRefs: string[] = []
    for (const [name, value] of universe) {
      if ([...value.matchAll(/var\(\s*(--[A-Za-z0-9-]+)/g)].some((ref) => ref[1] === name)) {
        selfRefs.push(name)
      }
    }
    expect(selfRefs, `self-referential tokens: ${selfRefs.join(', ')}`).toEqual([])
  })
})
