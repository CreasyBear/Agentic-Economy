import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

const kernelSource = readFileSync('src/modules/routing-kernel/internal/kernel.ts', 'utf8')
const internalRoot = 'src/modules/routing-kernel/internal'
const movedFolders = ['execute', 'reconcile', 'shared'] as const

const movedFunctionSymbols = [
  'recoverReleasedExecution',
  'resumeAdmittedExecution',
  'executeFallbackAfterDefiniteFailure',
  'admittedRun',
  'completedRun',
  'unknownRun',
  'failedRun',
  'releasedRun',
  'cancelledRun',
  'incidentFrozenRun',
  'incidentEpochStaleRun',
  'grantForStep',
  'disclosureGrantForStep',
  'authorizationRefusal',
  'projectDataForStep',
] as const

describe('routing-kernel execute/reconcile thinness', () => {
  it('does not redefine moved execute/reconcile/snapshot helpers in kernel.ts', () => {
    expect(kernelSource).not.toMatch(/(?:^|\n)\s*async function execute\b/)
    expect(kernelSource).not.toMatch(/(?:^|\n)\s*async function reconcileProviderOutcome\b/)
    expect(kernelSource).not.toMatch(/(?:^|\n)\s*async function reconcileProviderCancellation\b/)
    for (const symbol of movedFunctionSymbols) {
      expect(kernelSource).not.toMatch(new RegExp(`(?:^|\\n)(?:async\\s+)?function\\s+${symbol}\\b`))
      expect(kernelSource).not.toMatch(new RegExp(`(?:^|\\n)const\\s+${symbol}\\s*=`))
    }
  })

  it('imports execute, reconcile, and run-snapshots from deepened modules', () => {
    expect(kernelSource).toContain("from './execute'")
    expect(kernelSource).toContain("from './reconcile'")
    expect(kernelSource).toContain("from './shared/run-snapshots'")
    expect(kernelSource).toContain('createExecuteOperation')
    expect(kernelSource).toContain('createReconcileOperations')
  })

  it('keeps route, authorize, inspect, and cancel in the factory', () => {
    expect(kernelSource).toMatch(/(?:^|\n)\s*async function route\b/)
    expect(kernelSource).toMatch(/(?:^|\n)\s*async function authorize\b/)
    expect(kernelSource).toMatch(/(?:^|\n)\s*async function inspect\b/)
    expect(kernelSource).toMatch(/(?:^|\n)\s*async function cancel\b/)
    expect(kernelSource).toContain('export function createNeutralRoutingKernel')
  })

  it('keeps deepened module files free of Convex runtime imports', () => {
    for (const folder of movedFolders) {
      for (const file of listTsFiles(join(internalRoot, folder))) {
        const source = readFileSync(file, 'utf8')
        expect(source).not.toMatch(/from\s+['"]\.\/_generated/)
        expect(source).not.toMatch(/from\s+['"][^'"]*convex\/server['"]/)
        expect(source).not.toMatch(/\bMutationCtx\b/)
        expect(source).not.toMatch(/\bDoc\s*</)
      }
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
