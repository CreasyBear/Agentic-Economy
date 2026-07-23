import { execFileSync } from 'node:child_process'
import { existsSync, globSync, readFileSync, statSync } from 'node:fs'
import { dirname, normalize, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const PHASE_BASE = '2debf4b9f65ce228491f7d3d17ed1654a23bb496'
const PHASE_TIP = '30d2689d2f32f86bbc83904ab257260ce54e5932'
const EXPECTED_PHASE_ARTIFACT_COUNT = 100
const CLASSIFICATION_PATH =
  '.planning/phases/03c-hosted-paid-operation-product-trial/03C-CLOSURE-CLASSIFICATION.md'
const CLASSIFICATIONS = [
  'paid-operation-owned',
  'trial-only',
  'candidate-shared-after-second-use',
] as const
const NEUTRAL_ACTION_INVOCATION_ENTRIES = [
  'src/modules/action-invocation/application-service.ts',
  'src/modules/action-invocation/contracts.ts',
  'src/modules/action-invocation/host-seam.ts',
  'src/modules/action-invocation/hosts/development-hosts.ts',
] as const
const FORBIDDEN_NON_PAID_IMPORT =
  /(?:from\s+|import\s*\()\s*['"][^'"]*(?:hosted-paid-operation|paid-operation-(?:card-contract|semantics)|AePaidOperationCard)[^'"]*['"]/u

type Classification = (typeof CLASSIFICATIONS)[number]

function gitLines(args: readonly string[]): readonly string[] {
  return execFileSync('git', args, { encoding: 'utf8' })
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
}

function derivePhaseArtifacts(): readonly string[] {
  return gitLines([
    'diff',
    '--name-only',
    PHASE_BASE,
    PHASE_TIP,
    '--',
  ])
}

const PHASE_ARTIFACTS = derivePhaseArtifacts()
const PHASE_ARTIFACT_SET = new Set(PHASE_ARTIFACTS)

function classificationSource(): string {
  return existsSync(CLASSIFICATION_PATH)
    ? readFileSync(CLASSIFICATION_PATH, 'utf8')
    : ''
}

function parseClassifications(source: string): ReadonlyMap<string, Classification> {
  const rows = new Map<string, Classification>()
  const rowPattern =
    /^\| `([^`]+)` \| `(paid-operation-owned|trial-only|candidate-shared-after-second-use)` \|/gmu
  for (const match of source.matchAll(rowPattern)) {
    if (rows.has(match[1]!)) throw new Error(`duplicate_classification:${match[1]}`)
    rows.set(match[1]!, match[2]! as Classification)
  }
  return rows
}

function classificationDelta(
  artifacts: readonly string[],
  rows: ReadonlyMap<string, Classification>,
): Readonly<{ missing: readonly string[]; extra: readonly string[] }> {
  const artifactsSet = new Set(artifacts)
  return {
    missing: artifacts.filter((path) => !rows.has(path)),
    extra: [...rows.keys()].filter((path) => !artifactsSet.has(path)).sort(),
  }
}

function sourceAtPhaseBase(path: string): string | undefined {
  try {
    return execFileSync('git', ['show', `${PHASE_BASE}:${path}`], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
  } catch {
    return undefined
  }
}

const phaseBaseSource = new Map<string, string | undefined>()
function simulatedSource(path: string): string | undefined {
  if (PHASE_ARTIFACT_SET.has(path)) {
    if (!phaseBaseSource.has(path)) phaseBaseSource.set(path, sourceAtPhaseBase(path))
    return phaseBaseSource.get(path)
  }
  return existsSync(path) && statSync(path).isFile()
    ? readFileSync(path, 'utf8')
    : undefined
}

function localImports(
  path: string,
  source: string,
): readonly Readonly<{ specifier: string; path?: string }>[] {
  return [...source.matchAll(/(?:from\s+|import\s*\()\s*['"]([^'"]+)['"]/gu)]
    .map((match) => match[1]!)
    .filter((specifier) => specifier.startsWith('.') || specifier.startsWith('@/'))
    .map((specifier) => {
      const base = specifier.startsWith('@/')
        ? resolve('src', specifier.slice(2))
        : resolve(dirname(path), specifier)
      const candidates = [
        base,
        `${base}.ts`,
        `${base}.tsx`,
        `${base}.js`,
        `${base}.mjs`,
        `${base}.json`,
        `${base}/index.ts`,
        `${base}/index.tsx`,
      ].map((candidate) => normalize(relative('.', candidate)))
      const candidate = candidates.find((value) => simulatedSource(value) !== undefined)
      return {
        specifier,
        ...(candidate === undefined ? {} : { path: candidate }),
      }
    })
}

function simulatedNeutralGraph(): Readonly<{
  visited: readonly string[]
  missing: readonly string[]
}> {
  const visited = new Set<string>()
  const missing: string[] = []
  const visit = (path: string) => {
    if (visited.has(path)) return
    visited.add(path)
    const source = simulatedSource(path)
    if (source === undefined) {
      missing.push(path)
      return
    }
    for (const dependency of localImports(path, source)) {
      if (dependency.path === undefined) {
        missing.push(`${path}->${dependency.specifier}`)
      } else {
        visit(dependency.path)
      }
    }
  }
  NEUTRAL_ACTION_INVOCATION_ENTRIES.forEach(visit)
  return { visited: [...visited].sort(), missing: missing.sort() }
}

function nonPaidImportViolations(): readonly string[] {
  return globSync(['src/**/*.ts', 'src/**/*.tsx']).sort()
    .filter((path) =>
      (path.startsWith('src/modules/')
        && !path.startsWith('src/modules/action-invocation/'))
      || (path.startsWith('src/routes/')
        && /booking|inquir|dispatch|communication|cancellation/iu.test(path)))
    .filter((path) => FORBIDDEN_NON_PAID_IMPORT.test(readFileSync(path, 'utf8')))
}

describe('Phase 3C paid-operation trial residue boundary', () => {
  it('derives and classifies the exact Phase 3C delta without circular lists', () => {
    const rows = parseClassifications(classificationSource())
    for (const path of [
      '.planning/phases/03c-hosted-paid-operation-product-trial/03C-07E-SUMMARY.md',
      '.github/workflows/kernel-release-gate.yml',
      'tools/release/observe-vercel-git-source-deployment.ts',
      'tests/unit/release/observe-vercel-git-source-deployment.test.ts',
      'tests/imports/customer-request-source-completeness.test.ts',
      'tests/unit/release/paid-operation-hosted-release.test.ts',
      'tests/imports/paid-operation-trial-residue.test.ts',
      'package.json',
    ]) {
      expect(PHASE_ARTIFACTS, `[P3C_RED:closure_07e_artifact_absent] ${path}`)
        .toContain(path)
    }
    expect(PHASE_ARTIFACTS).toContain('tools/release/paid-operation-hosted-proof-contract.ts')
    expect(PHASE_ARTIFACTS).toContain(
      '.planning/phases/03c-hosted-paid-operation-product-trial/03C-07D-SUMMARY.md',
    )
    expect(PHASE_ARTIFACTS).toHaveLength(EXPECTED_PHASE_ARTIFACT_COUNT)
    expect(classificationDelta(PHASE_ARTIFACTS, rows),
      '[P3C_RED:closure_artifact_unclassified]').toEqual({ missing: [], extra: [] })
    expect([...rows.values()].every((value) => CLASSIFICATIONS.includes(value))).toBe(true)
    expect(classificationSource()).not.toMatch(/\| `shared` \|/u)
    expect(rows.get(
      '.planning/phases/03c-hosted-paid-operation-product-trial/03C-UI-SPEC.md',
    )).toBe('trial-only')
    for (const path of [
      '.planning/phases/03c-hosted-paid-operation-product-trial/03C-07E-SUMMARY.md',
      '.github/workflows/kernel-release-gate.yml',
      'tools/release/observe-vercel-git-source-deployment.ts',
      'tests/unit/release/observe-vercel-git-source-deployment.test.ts',
      'tests/imports/customer-request-source-completeness.test.ts',
    ]) {
      expect(rows.get(path), `[P3C_RED:closure_07e_not_trial_only] ${path}`)
        .toBe('trial-only')
    }

    const omitted = new Map(rows)
    const omittedPath = PHASE_ARTIFACTS[0]!
    omitted.delete(omittedPath)
    expect(classificationDelta(PHASE_ARTIFACTS, omitted).missing)
      .toEqual([omittedPath])

    const extraPath = 'synthetic/not-a-phase-artifact.ts'
    const extra = new Map(rows).set(extraPath, 'trial-only')
    expect(classificationDelta(PHASE_ARTIFACTS, extra).extra)
      .toEqual([extraPath])
  })

  it('records retention, residual posture, and objective retirement trigger', () => {
    const source = classificationSource()
    expect(source, '[P3C_RED:closure_retention_absent]')
      .toContain('Retention review date | `2026-08-21`')
    expect(source, '[P3C_RED:closure_kill_switch_owner_absent]')
      .toContain('Kill-switch owner | `Phase 3C release owner`')
    expect(source, '[P3C_RED:closure_residual_posture_absent]')
      .toContain('Expected residual records')
    expect(source, '[P3C_RED:closure_retirement_trigger_absent]')
      .toContain('Objective retirement trigger')
  })

  it('simulates complete Phase 3C removal without changing neutral Action Invocation', () => {
    const graph = simulatedNeutralGraph()
    expect(graph.missing, '[P3C_RED:trial_removal_damages_neutral_imports]').toEqual([])
    expect(graph.visited.filter((path) =>
      PHASE_ARTIFACT_SET.has(path) && sourceAtPhaseBase(path) === undefined),
    '[P3C_RED:neutral_action_invocation_depends_on_trial]').toEqual([])
    for (const path of NEUTRAL_ACTION_INVOCATION_ENTRIES) {
      expect(simulatedSource(path), `[P3C_RED:neutral_source_missing] ${path}`)
        .toBe(readFileSync(path, 'utf8'))
    }
    expect(simulatedSource('convex/hostedPaidOperation.ts')).toBeUndefined()
    expect(simulatedSource('src/routes/actions.paid.new.tsx')).toBeUndefined()
  })

  it('keeps non-paid modules free of paid DTO, semantics, and panel imports', () => {
    expect(nonPaidImportViolations(), '[P3C_RED:non_paid_imports_paid_operation]')
      .toEqual([])
    expect(FORBIDDEN_NON_PAID_IMPORT.test(
      "import { semantics } from '@/modules/action-invocation/paid-operation-semantics'",
    )).toBe(true)
    expect(FORBIDDEN_NON_PAID_IMPORT.test(
      "import { Panel } from '@/components/ae/action-invocation/AePaidOperationCard'",
    )).toBe(true)
  })
})
