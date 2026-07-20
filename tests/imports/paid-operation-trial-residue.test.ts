import { execFileSync } from 'node:child_process'
import { existsSync, globSync, readFileSync, statSync } from 'node:fs'
import { dirname, normalize, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const PHASE_BASE = '2debf4b9f65ce228491f7d3d17ed1654a23bb496'
const CLASSIFICATION_PATH =
  '.planning/phases/03c-hosted-paid-operation-product-trial/03C-CLOSURE-CLASSIFICATION.md'
const CLASSIFICATIONS = [
  'paid-operation-owned',
  'trial-only',
  'candidate-shared-after-second-use',
] as const

const PHASE_ARTIFACTS = [
  '.planning/REQUIREMENTS.md',
  '.planning/ROADMAP.md',
  '.planning/STATE.md',
  '.planning/adr/ADR-021-hosted-paid-operation-trial-boundaries.md',
  '.planning/phases/03c-hosted-paid-operation-product-trial/03C-01-PLAN.md',
  '.planning/phases/03c-hosted-paid-operation-product-trial/03C-01-SUMMARY.md',
  '.planning/phases/03c-hosted-paid-operation-product-trial/03C-02-PLAN.md',
  '.planning/phases/03c-hosted-paid-operation-product-trial/03C-02-SUMMARY.md',
  '.planning/phases/03c-hosted-paid-operation-product-trial/03C-03-PLAN.md',
  '.planning/phases/03c-hosted-paid-operation-product-trial/03C-03-SUMMARY.md',
  '.planning/phases/03c-hosted-paid-operation-product-trial/03C-03A-SUMMARY.md',
  '.planning/phases/03c-hosted-paid-operation-product-trial/03C-04-PLAN.md',
  '.planning/phases/03c-hosted-paid-operation-product-trial/03C-04-SUMMARY.md',
  '.planning/phases/03c-hosted-paid-operation-product-trial/03C-05-PLAN.md',
  '.planning/phases/03c-hosted-paid-operation-product-trial/03C-05-SUMMARY.md',
  '.planning/phases/03c-hosted-paid-operation-product-trial/03C-06-PLAN.md',
  '.planning/phases/03c-hosted-paid-operation-product-trial/03C-06-SUMMARY.md',
  '.planning/phases/03c-hosted-paid-operation-product-trial/03C-07-PLAN.md',
  '.planning/phases/03c-hosted-paid-operation-product-trial/03C-07-SUMMARY.md',
  '.planning/phases/03c-hosted-paid-operation-product-trial/03C-07A-SUMMARY.md',
  '.planning/phases/03c-hosted-paid-operation-product-trial/03C-AGENT-RUNBOOK.md',
  '.planning/phases/03c-hosted-paid-operation-product-trial/03C-CLOSURE-CLASSIFICATION.md',
  '.planning/phases/03c-hosted-paid-operation-product-trial/03C-COMPREHENSION-EVAL.md',
  '.planning/phases/03c-hosted-paid-operation-product-trial/03C-COMPREHENSION-RESULTS.json',
  '.planning/phases/03c-hosted-paid-operation-product-trial/03C-CONTEXT.md',
  '.planning/phases/03c-hosted-paid-operation-product-trial/03C-PLAN-REVIEW.md',
  '.planning/phases/03c-hosted-paid-operation-product-trial/03C-RED-REPORT.json',
  '.planning/phases/03c-hosted-paid-operation-product-trial/03C-RESEARCH.md',
  '.planning/phases/03c-hosted-paid-operation-product-trial/03C-UI-SPEC.md',
  '.planning/phases/03c-hosted-paid-operation-product-trial/03C-VALIDATION.md',
  'convex/hostedPaidOperation.ts',
  'convex/hostedPaidOperationGateway.ts',
  'docs/hosted-paid-operation-trial.md',
  'package.json',
  'playwright.paid-operation-hosted.config.ts',
  'src/components/ae/action-invocation/AePaidOperationCard.tsx',
  'src/lib/server/hosted-paid-operation-agent-api.ts',
  'src/lib/server/hosted-paid-operation-agent-auth.ts',
  'src/lib/server/hosted-paid-operation-human-api.ts',
  'src/lib/server/hosted-paid-operation-runtime.ts',
  'src/modules/action-invocation/hosted-paid-operation-composition.ts',
  'src/modules/action-invocation/hosted-paid-operation-creation.ts',
  'src/modules/action-invocation/hosted-paid-operation-port.ts',
  'src/modules/action-invocation/hosted-paid-operation-service-auth.ts',
  'src/modules/action-invocation/hosted-sandbox-effect-adapter.ts',
  'src/modules/action-invocation/hosted-sandbox-reconciliation.ts',
  'src/modules/action-invocation/internal/convex-schema.ts',
  'src/modules/action-invocation/paid-operation-card-contract.ts',
  'src/modules/action-invocation/paid-operation-semantics.ts',
  'src/routeTree.gen.ts',
  'src/routes/actions.paid.$invocationRef.tsx',
  'src/routes/actions.paid.new.tsx',
  'src/routes/api.v1.paid-operations.$invocationRef.commands.ts',
  'src/routes/api.v1.paid-operations.$invocationRef.ts',
  'src/routes/api.v1.paid-operations.ts',
  'tests/deploy-smoke/paid-operation-hosted-sandbox-smoke.spec.ts',
  'tests/e2e/paid-operation-development-surface.spec.ts',
  'tests/e2e/paid-operation-hosted-sandbox.spec.ts',
  'tests/imports/hosted-paid-operation-boundaries.test.ts',
  'tests/imports/paid-operation-trial-residue.test.ts',
  'tests/ui-contract/hosted-paid-operation-contract.test.tsx',
  'tests/unit/action-invocation/convex-handler-contract.test.ts',
  'tests/unit/action-invocation/hosted-paid-operation-contract-red.test.ts',
  'tests/unit/action-invocation/hosted-paid-operation-creation.test.ts',
  'tests/unit/action-invocation/hosted-paid-operation-persistence.test.ts',
  'tests/unit/action-invocation/hosted-paid-operation-reconciliation.test.ts',
  'tests/unit/action-invocation/hosted-paid-operation-red-harness.test.ts',
  'tests/unit/action-invocation/hosted-sandbox-effect-adapter.test.ts',
  'tests/unit/action-invocation/paid-operation-application-service.test.ts',
  'tests/unit/action-invocation/paid-operation-card.test.tsx',
  'tests/unit/action-invocation/paid-operation-development-surface.test.tsx',
  'tests/unit/action-invocation/paid-operation-projection.test.ts',
  'tests/unit/release/customer-request-production-credential.test.ts',
  'tests/unit/release/paid-operation-hosted-release.test.ts',
  'tests/unit/server/hosted-paid-operation-agent-auth.test.ts',
  'tests/unit/server/hosted-paid-operation-api.test.ts',
  'tests/unit/server/hosted-paid-operation-auth-contract-red.test.ts',
  'tests/unit/server/hosted-paid-operation-creation-api.test.ts',
  'tests/unit/server/hosted-paid-operation-runtime.test.ts',
  'tools/dev/paid-operation-browser/main.tsx',
  'tools/dev/paid-operation-browser/paid-operation-browser-fixture.ts',
  'tools/dev/paid-operation-surface-host.tsx',
  'tools/dev/score-paid-operation-comprehension.ts',
  'tools/dev/verify-phase-3c-red-contract.ts',
  'tools/release/customer-request-production-credential.ts',
  'tools/release/verify-paid-operation-hosted-release.ts',
] as const

const PHASE_ARTIFACT_SET = new Set<string>(PHASE_ARTIFACTS)
const NEUTRAL_ACTION_INVOCATION_ENTRIES = [
  'src/modules/action-invocation/application-service.ts',
  'src/modules/action-invocation/contracts.ts',
  'src/modules/action-invocation/host-seam.ts',
  'src/modules/action-invocation/hosts/development-hosts.ts',
] as const
const FORBIDDEN_NON_PAID_IMPORT =
  /(?:from\s+|import\s*\()\s*['"][^'"]*(?:hosted-paid-operation|paid-operation-(?:card-contract|semantics)|AePaidOperationCard)[^'"]*['"]/u

type Classification = (typeof CLASSIFICATIONS)[number]

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
  return {
    visited: [...visited].sort(),
    missing: missing.sort(),
  }
}

function nonPaidImportViolations(): readonly string[] {
  const production = globSync(['src/**/*.ts', 'src/**/*.tsx']).sort()
  return production
    .filter((path) =>
      (path.startsWith('src/modules/')
        && !path.startsWith('src/modules/action-invocation/'))
      || (path.startsWith('src/routes/')
        && /booking|inquir|dispatch|communication|cancellation/iu.test(path)))
    .filter((path) => FORBIDDEN_NON_PAID_IMPORT.test(readFileSync(path, 'utf8')))
}

describe('Phase 3C paid-operation trial residue boundary', () => {
  it('classifies every Phase 3C artifact exactly once without promoting candidates', () => {
    const rows = parseClassifications(classificationSource())
    expect(
      [...rows.keys()].sort(),
      '[P3C_RED:closure_artifact_unclassified]',
    ).toEqual([...PHASE_ARTIFACTS].sort())
    expect([...rows.values()].every((value) => CLASSIFICATIONS.includes(value))).toBe(true)
    expect(classificationSource()).not.toMatch(/\| `shared` \|/u)
    expect(rows.get(
      '.planning/phases/03c-hosted-paid-operation-product-trial/03C-UI-SPEC.md',
    )).toBe('trial-only')
  })

  it('records the exact retention owner, residual posture, and objective retirement trigger', () => {
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
    expect(
      graph.visited.filter((path) =>
        PHASE_ARTIFACT_SET.has(path) && sourceAtPhaseBase(path) === undefined),
      '[P3C_RED:neutral_action_invocation_depends_on_trial]',
    ).toEqual([])
    for (const path of NEUTRAL_ACTION_INVOCATION_ENTRIES) {
      expect(simulatedSource(path), `[P3C_RED:neutral_source_missing] ${path}`)
        .toBe(readFileSync(path, 'utf8'))
    }
    expect(simulatedSource('convex/hostedPaidOperation.ts')).toBeUndefined()
    expect(simulatedSource('src/routes/actions.paid.new.tsx')).toBeUndefined()
  })

  it('keeps booking, inquiry, dispatch, communication, cancellation, and all non-paid modules clean', () => {
    expect(
      nonPaidImportViolations(),
      '[P3C_RED:non_paid_imports_paid_operation]',
    ).toEqual([])
    expect(FORBIDDEN_NON_PAID_IMPORT.test(
      "import { semantics } from '@/modules/action-invocation/paid-operation-semantics'",
    )).toBe(true)
    expect(FORBIDDEN_NON_PAID_IMPORT.test(
      "import { Panel } from '@/components/ae/action-invocation/AePaidOperationCard'",
    )).toBe(true)
  })
})
