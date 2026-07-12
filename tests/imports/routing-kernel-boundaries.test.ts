import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { cleanRuntimeTargets } from './scan-targets'

const root = process.cwd()

describe('routing kernel module boundaries', () => {
  it('separates the external contract, application port, and internal runtime seams', () => {
    expect(existsSync(join(root, 'src/modules/routing-kernel/contract.ts'))).toBe(true)
    expect(existsSync(join(root, 'src/modules/routing-kernel/application.ts'))).toBe(true)
    expect(existsSync(join(root, 'src/modules/routing-kernel/runtime.ts'))).toBe(true)
    expect(existsSync(join(root, 'src/modules/routing-kernel/public.ts'))).toBe(false)
  })

  it('prevents executable source from importing the removed catch-all public seam', () => {
    const offenders = sourceFiles().filter((path) => {
      if (path.endsWith('routing-kernel-boundaries.test.ts')) return false
      return /routing-kernel\/public['"]/.test(readFileSync(join(root, path), 'utf8'))
    })

    expect(offenders).toEqual([])
  })

  it('keeps runtime persistence and authority helpers out of external contract vocabulary', () => {
    const contract = readFileSync(join(root, 'src/modules/routing-kernel/contract.ts'), 'utf8')
    expect(contract).not.toMatch(/KernelStore|ProtocolRecord|RootRunSnapshot|StepGrant|DisclosureGrant|CapabilityBindingAdapter|internal\//)
  })
})

function sourceFiles(): string[] {
  return cleanRuntimeTargets().flatMap(({ root: targetRoot }) => walk(join(root, targetRoot)).map((path) => path.slice(root.length + 1)))
}

function walk(directory: string): string[] {
  if (!existsSync(directory)) return []
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry)
    if (statSync(path).isDirectory()) return walk(path)
    return /\.(?:ts|tsx)$/.test(path) ? [path] : []
  })
}
