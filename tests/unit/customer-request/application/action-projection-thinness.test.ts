import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

const convexHost = readFileSync('convex/customerRequestApplication.ts', 'utf8')
const moduleRoot = 'src/modules/customer-request/application/action-projection'
const provideFactsRoot = 'src/modules/customer-request/application/provide-facts'
const refineRoot = 'src/modules/customer-request/application/refine'
const confirmRoot = 'src/modules/customer-request/application/confirm-route'
const standingRoot = 'src/modules/customer-request/application/standing-route'
const compareRoot = 'src/modules/customer-request/application/compare-resume'

const movedSymbols = [
  'toActionResult',
  'writableView',
  'writableOption',
  'writableActivityCancellation',
  'writableClone',
  'withRestoredRequest',
] as const

describe('customer-request action-projection thinness', () => {
  it('does not redefine moved action-projection helpers in Convex host', () => {
    for (const symbol of movedSymbols) {
      expect(convexHost).not.toMatch(new RegExp(`(?:^|\\n)(?:async\\s+)?function\\s+${symbol}\\b`))
      expect(convexHost).not.toMatch(new RegExp(`(?:^|\\n)const\\s+${symbol}\\s*=`))
      expect(convexHost).not.toMatch(new RegExp(`(?:^|\\n)type\\s+DeepWritable\\b`))
    }
  })

  it('imports action-projection helpers through application/public', () => {
    expect(convexHost).toContain("from '@/modules/customer-request/application/public'")
    expect(convexHost).toContain('toActionResult')
    expect(convexHost).toContain('writableView')
    expect(convexHost).toContain('withRestoredRequest')
  })

  it('keeps validators and resolveRequestCaller in the Convex host', () => {
    expect(convexHost).toMatch(/const customerView\s*=/)
    expect(convexHost).toMatch(/const actionResult\s*=/)
    expect(convexHost).toMatch(/(?:^|\n)(?:async\s+)?function\s+resolveRequestCaller\b/)
    expect(convexHost).toMatch(/export const provideFacts\s*=/)
    expect(convexHost).toMatch(/export const resume\s*=/)
  })

  it('does not keep dead Wave 15–16 host wrappers', () => {
    for (const symbol of [
      'projectCurrentRoutePlans',
      'compileCommit',
      'loadCurrentRouteGenerationNumber',
      'recoverUnresolvedEgress',
    ] as const) {
      expect(convexHost).not.toMatch(new RegExp(`(?:^|\\n)(?:async\\s+)?function\\s+${symbol}\\b`))
    }
  })

  it('keeps action-projection free of Convex runtime and validators', () => {
    for (const file of listTsFiles(moduleRoot)) {
      const source = readFileSync(file, 'utf8')
      expect(source).not.toMatch(/from\s+['"]\.\/_generated/)
      expect(source).not.toMatch(/from\s+['"][^'"]*_generated[^'"]*['"]/)
      expect(source).not.toMatch(/from\s+['"][^'"]*convex\/server['"]/)
      expect(source).not.toMatch(/from\s+['"]convex\/values['"]/)
      expect(source).not.toMatch(/\bv\.(?:object|union|literal|string|number|array|optional)\b/)
      expect(source).not.toMatch(/\bActionCtx\b/)
      expect(source).not.toMatch(/\bMutationCtx\b/)
      expect(source).not.toMatch(/\bDoc\s*</)
      expect(source).not.toMatch(/customerRequestRouteMandate/)
      expect(source).not.toMatch(/compileRouteMandate/)
      expect(source).not.toMatch(/exportState/)
      expect(source).not.toMatch(/\bwithdraw\b/)
      expect(source).not.toMatch(/journal/)
    }
  })

  it('re-exports action-projection through application/public', () => {
    const publicSource = readFileSync(
      'src/modules/customer-request/application/public.ts',
      'utf8',
    )
    expect(publicSource).toContain("from './action-projection'")
    expect(publicSource).toContain('toActionResult')
    expect(publicSource).toContain('writableView')
    expect(publicSource).toContain('withRestoredRequest')
  })

  it('does not fold action-projection into sibling application packages', () => {
    for (const root of [provideFactsRoot, refineRoot, confirmRoot, standingRoot, compareRoot]) {
      for (const file of listTsFiles(root)) {
        const source = readFileSync(file, 'utf8')
        expect(source).not.toMatch(/\btoActionResult\b/)
        expect(source).not.toMatch(/\bwritableView\b/)
        expect(source).not.toMatch(/\bwithRestoredRequest\b/)
      }
    }
  })

  it('does not export use-prefixed action-projection helpers', () => {
    for (const file of listTsFiles(moduleRoot)) {
      const source = readFileSync(file, 'utf8')
      expect(source).not.toMatch(/export\s+(?:async\s+)?function\s+use[A-Z]/)
      expect(source).not.toMatch(/export\s+\{[^}]*\buse[A-Z]/)
    }
  })
})

function listTsFiles(directory: string): string[] {
  const entries = readdirSync(directory)
  const files: string[] = []
  for (const entry of entries) {
    const path = join(directory, entry)
    const stats = statSync(path)
    if (stats.isDirectory()) files.push(...listTsFiles(path))
    else if (entry.endsWith('.ts')) files.push(path)
  }
  return files
}
