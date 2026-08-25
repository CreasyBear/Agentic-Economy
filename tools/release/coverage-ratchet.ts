import { relative, resolve, sep } from 'node:path'

export const coverageMetricNames = ['lines', 'statements', 'functions', 'branches'] as const
export type CoverageMetricName = (typeof coverageMetricNames)[number]

type CoverageMetric = Readonly<{
  covered: number
  skipped: number
  total: number
}>

export type FileCoverage = Readonly<Record<CoverageMetricName, CoverageMetric>>
export type CoverageSummary = Readonly<Record<string, FileCoverage>>
export type CoverageBaseline = Readonly<Record<string, Readonly<Record<CoverageMetricName, number>>>>

export type CoveragePolicy = Readonly<{
  criticalPathPrefixes: readonly string[]
  schema: 'ae.coverage-ratchet-policy:v1'
}>

export type SerializedCoverageBaseline = Readonly<{
  files: CoverageBaseline
  schema: 'ae.coverage-ratchet-baseline:v1'
}>

type JsonObject = Record<string, unknown>

function object(value: unknown, label: string): JsonObject {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${label}_must_be_an_object`)
  }
  return value as JsonObject
}

function count(value: unknown, label: string): number {
  if (!Number.isInteger(value) || Number(value) < 0) throw new Error(`${label}_must_be_a_count`)
  return Number(value)
}

function normalizePath(path: string): string {
  return path.split(sep).join('/').replace(/^\.\//u, '')
}

function repositoryPath(root: string, file: string): string {
  if (!file.startsWith('/')) return normalizePath(file)
  const path = normalizePath(relative(resolve(root), resolve(file)))
  if (path === '..' || path.startsWith('../')) throw new Error('coverage_path_outside_repository')
  return path
}

function parseMetric(value: unknown, label: string): CoverageMetric {
  const metric = object(value, label)
  const total = count(metric.total, `${label}_total`)
  const covered = count(metric.covered, `${label}_covered`)
  const skipped = count(metric.skipped, `${label}_skipped`)
  if (covered > total) throw new Error(`${label}_covered_exceeds_total`)
  return { covered, skipped, total }
}

export function parseCoverageSummary(value: unknown, root: string): CoverageSummary {
  const raw = object(value, 'coverage_summary')
  const parsed: Record<string, FileCoverage> = {}
  for (const [file, coverage] of Object.entries(raw)) {
    if (file === 'total') continue
    const entry = object(coverage, `coverage_${file}`)
    const metrics = Object.fromEntries(coverageMetricNames.map((metric) => [
      metric,
      parseMetric(entry[metric], `coverage_${file}_${metric}`),
    ])) as Record<CoverageMetricName, CoverageMetric>
    parsed[repositoryPath(root, file)] = metrics
  }
  if (Object.keys(parsed).length === 0) throw new Error('coverage_summary_has_no_files')
  return parsed
}

export function parseCoveragePolicy(value: unknown): CoveragePolicy {
  const policy = object(value, 'coverage_policy')
  if (policy.schema !== 'ae.coverage-ratchet-policy:v1') throw new Error('coverage_policy_schema_invalid')
  if (!Array.isArray(policy.criticalPathPrefixes) || policy.criticalPathPrefixes.length === 0) {
    throw new Error('coverage_policy_critical_prefixes_missing')
  }
  const prefixes = policy.criticalPathPrefixes.map((value, index) => {
    if (typeof value !== 'string' || value.length === 0 || value.startsWith('/')) {
      throw new Error(`coverage_policy_prefix_${index}_invalid`)
    }
    return normalizePath(value).replace(/\/$/u, '')
  })
  return { criticalPathPrefixes: [...new Set(prefixes)], schema: policy.schema }
}

function uncovered(metric: CoverageMetric): number {
  return metric.total - metric.covered
}

export function createCoverageBaseline(summary: CoverageSummary): SerializedCoverageBaseline {
  const files = Object.fromEntries(Object.entries(summary)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([file, coverage]) => [file, Object.fromEntries(coverageMetricNames.map((metric) => [
      metric,
      uncovered(coverage[metric]),
    ]))])) as Record<string, Record<CoverageMetricName, number>>
  return { files, schema: 'ae.coverage-ratchet-baseline:v1' }
}

export function parseCoverageBaseline(value: unknown): CoverageBaseline {
  const baseline = object(value, 'coverage_baseline')
  if (baseline.schema !== 'ae.coverage-ratchet-baseline:v1') {
    throw new Error('coverage_baseline_schema_invalid')
  }
  const files = object(baseline.files, 'coverage_baseline_files')
  if (Object.keys(files).length === 0) throw new Error('coverage_baseline_has_no_files')
  return Object.fromEntries(Object.entries(files).map(([file, allowance]) => {
    const metricAllowances = object(allowance, `coverage_baseline_${file}`)
    return [normalizePath(file), Object.fromEntries(coverageMetricNames.map((metric) => [
      metric,
      count(metricAllowances[metric], `coverage_baseline_${file}_${metric}`),
    ]))]
  })) as Record<string, Record<CoverageMetricName, number>>
}

function isCritical(path: string, policy: CoveragePolicy): boolean {
  return policy.criticalPathPrefixes.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))
}

export function assertCoverageRatchet(
  current: CoverageSummary,
  baseline: CoverageBaseline,
  policy: CoveragePolicy,
  requiredCriticalFiles: readonly string[] = [],
): void {
  const failures: string[] = []

  for (const file of requiredCriticalFiles) {
    const normalized = normalizePath(file)
    if (isCritical(normalized, policy) && current[normalized] === undefined) {
      failures.push(`${normalized}:critical_file_missing_from_current_summary`)
    }
  }

  for (const [file, baselineAllowance] of Object.entries(baseline)) {
    const currentCoverage = current[file]
    if (currentCoverage === undefined) {
      failures.push(`${file}:missing_from_current_summary`)
      continue
    }
    for (const metric of coverageMetricNames) {
      const previousUncovered = baselineAllowance[metric]
      const currentUncovered = uncovered(currentCoverage[metric])
      if (currentUncovered > previousUncovered) {
        failures.push(`${file}:${metric}:uncovered_${previousUncovered}_to_${currentUncovered}`)
      }
    }
  }

  for (const [file, coverage] of Object.entries(current)) {
    if (!isCritical(file, policy)) continue
    for (const metric of coverageMetricNames) {
      const missing = uncovered(coverage[metric])
      if (missing !== 0) failures.push(`${file}:${metric}:${missing}_uncovered`)
    }
  }

  if (failures.length > 0) throw new Error(`coverage_ratchet_failed\n${failures.sort().join('\n')}`)
}
