import { describe, expect, it } from 'vitest'

import { hasCoverageRelevantStatement } from '../../../tools/release/coverage-source-classification'

describe('coverage source classification', () => {
  it('does not demand counters from type-only and pure re-export seams', () => {
    expect(hasCoverageRelevantStatement('public.ts', `
      import type { Principal } from './registry'
      export type { Principal }
      export { PrincipalRegistry } from './registry'
      export interface PublicShape { readonly ref: string }
      export type PublicRef = string
    `)).toBe(false)
  })

  it('requires counters from runtime declarations even when they are exported', () => {
    expect(hasCoverageRelevantStatement('public.ts', `
      export { PrincipalRegistry } from './registry'
      export const principalTables = Object.freeze({})
    `)).toBe(true)
    expect(hasCoverageRelevantStatement('contract.ts', 'export enum State { Active = "active" }')).toBe(true)
  })

  it('ignores ambient declarations but not function or class implementations', () => {
    expect(hasCoverageRelevantStatement('ambient.ts', 'export declare function lookup(): string')).toBe(false)
    expect(hasCoverageRelevantStatement('runtime.ts', 'export function lookup() { return "value" }')).toBe(true)
    expect(hasCoverageRelevantStatement('runtime.tsx', 'export class Registry {}')).toBe(true)
  })
})
