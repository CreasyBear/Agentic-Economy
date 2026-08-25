import { createHash } from 'node:crypto'

const TABLE_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9]{0,99}$/u
const OPAQUE_REF_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/u

export const LEGACY_IDENTITY_RESET_MANIFEST = Object.freeze([
  Object.freeze({ table: 'owners', reason: 'Legacy Clerk-bound owner identity facts' }),
  Object.freeze({ table: 'agentAccessPrincipals', reason: 'Legacy agent-access principal identity facts' }),
] as const)

export const CANONICAL_IDENTITY_TABLES = Object.freeze([
  'principals',
  'accounts',
  'accountOwnerships',
  'memberships',
  'externalIdentityBindings',
  'credentials',
] as const)

export type LegacyIdentityTable = typeof LEGACY_IDENTITY_RESET_MANIFEST[number]['table']
export type CanonicalIdentityTable = typeof CANONICAL_IDENTITY_TABLES[number]

export type LegacyIdentityResetInventoryPort = Readonly<{
  countFacts(table: LegacyIdentityTable | CanonicalIdentityTable): Promise<number>
}>

export type LegacyIdentityResetEntry = Readonly<{
  table: LegacyIdentityTable
  reason: string
  measuredFacts: number
}>

export type RetainedCanonicalEntry = Readonly<{
  table: CanonicalIdentityTable
  measuredFacts: number
}>

export type LegacyIdentityResetPlan = Readonly<{
  format: 'ae-legacy-identity-reset/v1'
  snapshotRef: string
  targets: readonly LegacyIdentityResetEntry[]
  retainedCanonical: readonly RetainedCanonicalEntry[]
  factsPlannedForRemoval: number
  canonicalFactsRetained: number
  planDigest: string
}>

export type LegacyIdentityResetApplyReceipt = Readonly<{
  planDigest: string
  removed: readonly Readonly<{ table: LegacyIdentityTable; facts: number }>[]
}>

export type LegacyIdentityResetExecutionPort = Readonly<{
  findReceipt(planDigest: string): Promise<LegacyIdentityResetApplyReceipt | undefined>
  applyExact(plan: LegacyIdentityResetPlan): Promise<LegacyIdentityResetApplyReceipt>
}>

export type LegacyIdentityResetResult = Readonly<{
  mode: 'dry-run' | 'applied' | 'already-applied'
  planDigest: string
  factsPlannedForRemoval: number
  factsRemoved: number
  canonicalFactsRetained: number
  removed: readonly Readonly<{ table: LegacyIdentityTable; facts: number }>[]
}>

export type LegacyIdentityResetErrorCode =
  | 'reset_apply_digest_required'
  | 'reset_count_invalid'
  | 'reset_duplicate_target'
  | 'reset_plan_digest_invalid'
  | 'reset_plan_invalid'
  | 'reset_protected_target'
  | 'reset_receipt_invalid'
  | 'reset_snapshot_ref_invalid'
  | 'reset_target_invalid'
  | 'reset_unknown_target'

export class LegacyIdentityResetError extends Error {
  readonly code: LegacyIdentityResetErrorCode

  constructor(code: LegacyIdentityResetErrorCode) {
    super(code)
    this.name = 'LegacyIdentityResetError'
    this.code = code
  }
}

export async function planLegacyIdentityReset(input: Readonly<{
  inventory: LegacyIdentityResetInventoryPort
  snapshotRef: string
  targets: readonly string[]
}>): Promise<LegacyIdentityResetPlan> {
  const snapshotRef = validSnapshotRef(input.snapshotRef)
  const targets = validTargets(input.targets)
  const measuredTargets: LegacyIdentityResetEntry[] = []
  for (const target of targets) {
    const manifest = LEGACY_IDENTITY_RESET_MANIFEST.find(({ table }) => table === target)!
    measuredTargets.push(Object.freeze({
      table: target,
      reason: manifest.reason,
      measuredFacts: validCount(await input.inventory.countFacts(target)),
    }))
  }
  const retainedCanonical: RetainedCanonicalEntry[] = []
  for (const table of CANONICAL_IDENTITY_TABLES) {
    retainedCanonical.push(Object.freeze({
      table,
      measuredFacts: validCount(await input.inventory.countFacts(table)),
    }))
  }
  const material = {
    format: 'ae-legacy-identity-reset/v1' as const,
    snapshotRef,
    targets: measuredTargets,
    retainedCanonical,
    factsPlannedForRemoval: sum(measuredTargets.map(({ measuredFacts }) => measuredFacts)),
    canonicalFactsRetained: sum(retainedCanonical.map(({ measuredFacts }) => measuredFacts)),
  }
  return freezePlan({ ...material, planDigest: digestPlanMaterial(material) })
}

export async function executeLegacyIdentityReset(
  plan: LegacyIdentityResetPlan,
  port: LegacyIdentityResetExecutionPort,
  options: Readonly<{ apply?: boolean; confirmedPlanDigest?: string }> = {},
): Promise<LegacyIdentityResetResult> {
  assertValidPlan(plan)
  if (options.apply !== true) return resultFromPlan(plan, 'dry-run', [])
  if (options.confirmedPlanDigest === undefined) {
    throw new LegacyIdentityResetError('reset_apply_digest_required')
  }
  if (options.confirmedPlanDigest !== plan.planDigest) {
    throw new LegacyIdentityResetError('reset_plan_digest_invalid')
  }
  const prior = await port.findReceipt(plan.planDigest)
  if (prior !== undefined) {
    assertValidReceipt(plan, prior)
    return resultFromPlan(plan, 'already-applied', prior.removed)
  }
  const receipt = await port.applyExact(plan)
  assertValidReceipt(plan, receipt)
  return resultFromPlan(plan, 'applied', receipt.removed)
}

function validTargets(values: readonly string[]): readonly LegacyIdentityTable[] {
  if (!Array.isArray(values) || values.length === 0) throw new LegacyIdentityResetError('reset_target_invalid')
  const seen = new Set<string>()
  const selected = new Set<LegacyIdentityTable>()
  for (const value of values) {
    if (typeof value !== 'string' || !TABLE_NAME_PATTERN.test(value)) {
      throw new LegacyIdentityResetError('reset_target_invalid')
    }
    if (CANONICAL_IDENTITY_TABLES.includes(value as CanonicalIdentityTable)) {
      throw new LegacyIdentityResetError('reset_protected_target')
    }
    if (seen.has(value)) throw new LegacyIdentityResetError('reset_duplicate_target')
    seen.add(value)
    const manifestIndex = LEGACY_IDENTITY_RESET_MANIFEST.findIndex(({ table }) => table === value)
    if (manifestIndex < 0) throw new LegacyIdentityResetError('reset_unknown_target')
    selected.add(LEGACY_IDENTITY_RESET_MANIFEST[manifestIndex]!.table)
  }
  return LEGACY_IDENTITY_RESET_MANIFEST
    .map(({ table }) => table)
    .filter((table) => selected.has(table))
}

function validSnapshotRef(value: string): string {
  if (typeof value !== 'string' || !OPAQUE_REF_PATTERN.test(value)) {
    throw new LegacyIdentityResetError('reset_snapshot_ref_invalid')
  }
  return value
}

function validCount(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) throw new LegacyIdentityResetError('reset_count_invalid')
  return value
}

function sum(values: readonly number[]): number {
  let total = 0
  for (const value of values) {
    total += value
    if (!Number.isSafeInteger(total)) throw new LegacyIdentityResetError('reset_count_invalid')
  }
  return total
}

function assertValidPlan(plan: LegacyIdentityResetPlan): void {
  if (!isRecord(plan)
    || plan.format !== 'ae-legacy-identity-reset/v1'
    || !Array.isArray(plan.targets)
    || !Array.isArray(plan.retainedCanonical)) {
    throw new LegacyIdentityResetError('reset_plan_invalid')
  }
  if (plan.targets.some((entry) => !isResetEntry(entry))
    || plan.retainedCanonical.some((entry) => !isRetainedEntry(entry))) {
    throw new LegacyIdentityResetError('reset_plan_invalid')
  }
  const targets = validTargets(plan.targets.map(({ table }) => table))
  if (targets.length !== plan.targets.length
    || plan.targets.some((entry, index) => entry.table !== targets[index]
      || entry.reason !== LEGACY_IDENTITY_RESET_MANIFEST.find(({ table }) => table === entry.table)?.reason
      || validCount(entry.measuredFacts) !== entry.measuredFacts)) {
    throw new LegacyIdentityResetError('reset_plan_invalid')
  }
  if (plan.retainedCanonical.length !== CANONICAL_IDENTITY_TABLES.length
    || plan.retainedCanonical.some((entry, index) => entry.table !== CANONICAL_IDENTITY_TABLES[index]
      || validCount(entry.measuredFacts) !== entry.measuredFacts)) {
    throw new LegacyIdentityResetError('reset_plan_invalid')
  }
  const material = {
    format: plan.format,
    snapshotRef: validSnapshotRef(plan.snapshotRef),
    targets: plan.targets,
    retainedCanonical: plan.retainedCanonical,
    factsPlannedForRemoval: sum(plan.targets.map(({ measuredFacts }) => measuredFacts)),
    canonicalFactsRetained: sum(plan.retainedCanonical.map(({ measuredFacts }) => measuredFacts)),
  }
  if (material.factsPlannedForRemoval !== plan.factsPlannedForRemoval
    || material.canonicalFactsRetained !== plan.canonicalFactsRetained
    || digestPlanMaterial(material) !== plan.planDigest) {
    throw new LegacyIdentityResetError('reset_plan_digest_invalid')
  }
}

function assertValidReceipt(plan: LegacyIdentityResetPlan, receipt: LegacyIdentityResetApplyReceipt): void {
  if (!isRecord(receipt)
    || typeof receipt.planDigest !== 'string'
    || !Array.isArray(receipt.removed)
    || receipt.removed.some((entry) => !isRemovedEntry(entry))
    || receipt.planDigest !== plan.planDigest
    || receipt.removed.length !== plan.targets.length
    || receipt.removed.some((entry, index) => entry.table !== plan.targets[index]?.table
      || entry.facts !== plan.targets[index]?.measuredFacts)) {
    throw new LegacyIdentityResetError('reset_receipt_invalid')
  }
}

function resultFromPlan(
  plan: LegacyIdentityResetPlan,
  mode: LegacyIdentityResetResult['mode'],
  removed: LegacyIdentityResetApplyReceipt['removed'],
): LegacyIdentityResetResult {
  return Object.freeze({
    mode,
    planDigest: plan.planDigest,
    factsPlannedForRemoval: plan.factsPlannedForRemoval,
    factsRemoved: sum(removed.map(({ facts }) => facts)),
    canonicalFactsRetained: plan.canonicalFactsRetained,
    removed: Object.freeze(removed.map((entry) => Object.freeze({ ...entry }))),
  })
}

function digestPlanMaterial(material: Omit<LegacyIdentityResetPlan, 'planDigest'>): string {
  return `sha256:${createHash('sha256').update(JSON.stringify(material)).digest('hex')}`
}

function freezePlan(plan: LegacyIdentityResetPlan): LegacyIdentityResetPlan {
  return Object.freeze({
    ...plan,
    targets: Object.freeze([...plan.targets]),
    retainedCanonical: Object.freeze([...plan.retainedCanonical]),
  })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isResetEntry(value: unknown): value is LegacyIdentityResetEntry {
  return isRecord(value)
    && typeof value.table === 'string'
    && typeof value.reason === 'string'
    && typeof value.measuredFacts === 'number'
}

function isRetainedEntry(value: unknown): value is RetainedCanonicalEntry {
  return isRecord(value)
    && typeof value.table === 'string'
    && typeof value.measuredFacts === 'number'
}

function isRemovedEntry(value: unknown): value is LegacyIdentityResetApplyReceipt['removed'][number] {
  return isRecord(value)
    && typeof value.table === 'string'
    && typeof value.facts === 'number'
}
