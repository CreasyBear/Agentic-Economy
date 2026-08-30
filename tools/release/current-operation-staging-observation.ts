import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { mkdir, open, readFile, link, unlink } from 'node:fs/promises'
import { dirname, relative, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'

import { z } from 'zod'

import { canonicalDigest } from '../../src/modules/common/canonical-digest'
import type { StableHashValue } from '../../src/modules/common/stable-hash'

const RELEASE_DIRECTORY = 'output/release'
const MAX_ROWS = 256
const BACKFILL_PAGE_SIZE = 8
const MIN_SOAK_MS = 86_400_000
const CYCLE_TIMEOUT_MS = 7 * 60_000
const MAX_OWNER_LENGTH = 120
const MAX_REASON_LENGTH = 240
const MAX_LOG_BUFFER_BYTES = 2 * 1024 * 1024

const revisionSchema = z.string().regex(/^[0-9a-f]{40}$/u)
const digestSchema = z.string().regex(/^sha256:[0-9a-f]{64}$/u)
const boundedOwnerSchema = z.string().trim().min(1).max(MAX_OWNER_LENGTH)
const boundedReasonSchema = z.string().trim().min(1).max(MAX_REASON_LENGTH)
const countSchema = z.number().int().nonnegative().max(MAX_ROWS)
const deploymentSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{2,63}$/u)
  .refine((value) => !['prod', 'production', 'staging', 'dev'].includes(value), 'deployment_alias_forbidden')

const controlSchema = z.strictObject({
  mode: z.enum(['old', 'shadow', 'new']),
  reason: z.string(),
  releaseOwner: z.string(),
  verifiedActiveCount: z.number().int().nonnegative().optional(),
  verifiedProjectionDigest: digestSchema.optional(),
  updatedAt: z.number(),
  isDefault: z.boolean(),
})
const backfillSchema = z.strictObject({
  processed: z.number().int().nonnegative().max(BACKFILL_PAGE_SIZE),
  rebuilt: z.number().int().nonnegative(),
  dropped: z.number().int().nonnegative(),
  unavailable: z.number().int().nonnegative(),
  isDone: z.boolean(),
  continueCursor: z.string(),
})
const snapshotSchema = z.union([
  z.strictObject({ kind: z.literal('unavailable'), reason: z.literal('source_revision_unavailable') }),
  z.strictObject({
    kind: z.literal('current_operation_staging_snapshot'),
    schemaVersion: z.literal('current-operation-staging-snapshot:v1'),
    deploymentName: deploymentSchema,
    sourceRevision: revisionSchema,
    sourceCount: countSchema,
    searchProjectionCount: countSchema,
    detailProjectionCount: countSchema,
    sourceSetDigest: digestSchema,
    readinessSetDigest: digestSchema,
    observedSinceCount: countSchema,
    unobservedSinceCount: countSchema,
    truncated: z.boolean(),
  }),
])
const diagnosticSchema = z.strictObject({
  kind: z.literal('current_operation_shadow_diagnostic'),
  schemaVersion: z.literal('current-operation-shadow-diagnostic:v1'),
  sourceCount: z.number().int().nonnegative(),
  projectionCount: z.number().int().nonnegative(),
  comparedCount: z.number().int().nonnegative(),
  explainedMismatchCount: z.number().int().nonnegative(),
  unexplainedMismatchCount: z.number().int().nonnegative(),
  truncated: z.boolean(),
  mismatches: z.array(z.strictObject({ kind: z.string(), count: z.number().int().positive() })),
})

const countsSchema = z.strictObject({
  source: countSchema,
  search: countSchema,
  detail: countSchema,
})
const readinessOutcomeCountsSchema = z.strictObject({
  observed: z.number().int().nonnegative().max(20),
  unavailable: z.number().int().nonnegative().max(20),
  refused: z.number().int().nonnegative().max(20),
})
const startReceiptMaterialSchema = z.strictObject({
  schemaVersion: z.literal('current-operation-staging-observation:v1'),
  kind: z.literal('current_operation_staging_start'),
  deploymentName: deploymentSchema,
  sourceRevision: revisionSchema,
  releaseOwner: boundedOwnerSchema,
  startedAt: z.number().int().nonnegative(),
  completedAt: z.number().int().nonnegative(),
  mode: z.literal('shadow'),
  counts: countsSchema,
  sourceSetDigest: digestSchema,
  projectionDigest: digestSchema,
  readinessSetDigest: digestSchema,
  observedSinceCount: countSchema,
  unobservedSinceCount: countSchema,
  scheduledDueCount: z.number().int().min(1).max(20),
  terminalOutcomeCounts: readinessOutcomeCountsSchema,
  cycleDigest: digestSchema,
})
export const StartReceiptSchema = startReceiptMaterialSchema.extend({ receiptDigest: digestSchema })
const completeReceiptMaterialSchema = z.strictObject({
  schemaVersion: z.literal('current-operation-staging-observation:v1'),
  kind: z.literal('current_operation_staging_complete'),
  deploymentName: deploymentSchema,
  sourceRevision: revisionSchema,
  releaseOwner: boundedOwnerSchema,
  startedAt: z.number().int().nonnegative(),
  completedAt: z.number().int().nonnegative(),
  soakDurationMs: z.number().int().min(MIN_SOAK_MS),
  baselineReceiptDigest: digestSchema,
  mode: z.literal('new'),
  counts: countsSchema,
  sourceSetDigest: digestSchema,
  projectionDigest: digestSchema,
  readinessSetDigest: digestSchema,
  observedSinceCount: countSchema,
  unobservedSinceCount: countSchema,
})
export const CompleteReceiptSchema = completeReceiptMaterialSchema.extend({ receiptDigest: digestSchema })
const rollbackReceiptMaterialSchema = z.strictObject({
  schemaVersion: z.literal('current-operation-staging-observation:v1'),
  kind: z.literal('current_operation_staging_rollback'),
  deploymentName: deploymentSchema,
  sourceRevision: revisionSchema,
  releaseOwner: boundedOwnerSchema,
  completedAt: z.number().int().nonnegative(),
  mode: z.literal('old'),
  reasonDigest: digestSchema,
  projectionRowsRetained: z.literal(true),
})
export const RollbackReceiptSchema = rollbackReceiptMaterialSchema.extend({ receiptDigest: digestSchema })
export const StagingReceiptSchema = z.union([StartReceiptSchema, CompleteReceiptSchema, RollbackReceiptSchema])

export type StartReceipt = z.infer<typeof StartReceiptSchema>
export type StagingReceipt = z.infer<typeof StagingReceiptSchema>
type Snapshot = Extract<z.infer<typeof snapshotSchema>, { kind: 'current_operation_staging_snapshot' }>

export type StageOptions = Readonly<{
  stage: 'start' | 'complete' | 'rollback'
  deploymentName: string
  sourceRevision: string
  releaseOwner: string
  receiptPath: string
  startArtifactPath?: string
  cutoverConfirmation?: string
  rollbackReason?: string
}>

type CycleEvidence = Readonly<{
  dueCount: number
  terminalOutcomeCounts: Readonly<{ observed: number; unavailable: number; refused: number }>
  cycleDigest: string
}>

export type LogStream = Readonly<{
  waitForCycle: (timeoutMs: number) => Promise<CycleEvidence>
  close: () => Promise<void>
}>

export type StagingRuntime = Readonly<{
  now: () => number
  run: (functionName: AllowedFunctionName, args: unknown) => Promise<unknown>
  startLogs: () => Promise<LogStream>
}>

type AllowedFunctionName =
  | 'capabilitySupplyOperations:readCurrentOperationReadControl'
  | 'capabilitySupplyOperations:backfillCurrentOperationProjections'
  | 'capabilitySupplyOperations:currentOperationShadowDiagnostics'
  | 'capabilitySupplyOperations:currentOperationStagingSnapshot'
  | 'capabilitySupplyOperations:setCurrentOperationReadMode'

const ALLOWED_FUNCTIONS: ReadonlySet<string> = new Set<AllowedFunctionName>([
  'capabilitySupplyOperations:readCurrentOperationReadControl',
  'capabilitySupplyOperations:backfillCurrentOperationProjections',
  'capabilitySupplyOperations:currentOperationShadowDiagnostics',
  'capabilitySupplyOperations:currentOperationStagingSnapshot',
  'capabilitySupplyOperations:setCurrentOperationReadMode',
])

type Environment = Record<string, string | undefined>

function requiredArgument(map: ReadonlyMap<string, string>, name: string): string {
  const value = map.get(name)?.trim()
  if (value === undefined || value.length === 0) throw new Error(`staging_observation_${name.slice(2)}_required`)
  return value
}

export function parseStageOptions(args: readonly string[], env: Environment = process.env): StageOptions {
  const stage = args[0]
  if (stage !== 'start' && stage !== 'complete' && stage !== 'rollback') {
    throw new Error('staging_observation_stage_invalid')
  }
  if (env.CONVEX_DEPLOYMENT?.trim() || env.CONVEX_URL?.trim()) {
    throw new Error('staging_observation_ambient_target_forbidden')
  }
  const allowed = new Set([
    '--deployment', '--revision', '--owner', '--receipt',
    ...(stage === 'complete' ? ['--start-artifact', '--confirm-cutover'] : []),
    ...(stage === 'rollback' ? ['--reason'] : []),
  ])
  if ((args.length - 1) % 2 !== 0) throw new Error('staging_observation_argument_pair_invalid')
  const parsed = new Map<string, string>()
  for (let index = 1; index < args.length; index += 2) {
    const name = args[index]
    const value = args[index + 1]
    if (name === undefined || value === undefined || !allowed.has(name) || parsed.has(name)) {
      throw new Error('staging_observation_argument_invalid')
    }
    parsed.set(name, value)
  }
  if (parsed.size !== allowed.size) throw new Error('staging_observation_argument_missing')
  const deploymentName = deploymentSchema.parse(requiredArgument(parsed, '--deployment'))
  const productionIdentity = env.AE_T8_PRODUCTION_CONVEX_DEPLOYMENT?.trim()
  if (productionIdentity !== undefined && productionIdentity.length > 0 && deploymentName === productionIdentity) {
    throw new Error('staging_observation_production_target_forbidden')
  }
  const deployKey = env.CONVEX_DEPLOY_KEY?.trim()
  if (deployKey === undefined || !new RegExp(`^dev:${deploymentName.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}\\|[^|\\s]{16,}$`, 'u').test(deployKey)) {
    throw new Error('staging_observation_deploy_key_invalid')
  }
  return {
    stage,
    deploymentName,
    sourceRevision: revisionSchema.parse(requiredArgument(parsed, '--revision')),
    releaseOwner: boundedOwnerSchema.parse(requiredArgument(parsed, '--owner')),
    receiptPath: requiredArgument(parsed, '--receipt'),
    ...(stage === 'complete'
      ? {
          startArtifactPath: requiredArgument(parsed, '--start-artifact'),
          cutoverConfirmation: requiredArgument(parsed, '--confirm-cutover'),
        }
      : {}),
    ...(stage === 'rollback' ? { rollbackReason: boundedReasonSchema.parse(requiredArgument(parsed, '--reason')) } : {}),
  }
}

export function resolveReleasePath(path: string, repositoryRoot = process.cwd()): string {
  const root = resolve(repositoryRoot, RELEASE_DIRECTORY)
  const target = resolve(repositoryRoot, path)
  const fromRoot = relative(root, target)
  if (fromRoot.length === 0 || fromRoot === '..' || fromRoot.startsWith(`..${sep}`) || fromRoot.startsWith(sep)) {
    throw new Error('staging_observation_receipt_path_outside_release_directory')
  }
  return target
}

function receiptWithDigest<T extends Record<string, unknown>>(material: T): T & { receiptDigest: string } {
  return { ...material, receiptDigest: canonicalDigest(material) }
}

export function parseStartReceipt(value: unknown): StartReceipt {
  const receipt = StartReceiptSchema.parse(value)
  const { receiptDigest, ...material } = receipt
  if (canonicalDigest(material as StableHashValue) !== receiptDigest) {
    throw new Error('staging_observation_start_receipt_digest_mismatch')
  }
  return receipt
}

export function parseStagingReceipt(value: unknown): StagingReceipt {
  const receipt = StagingReceiptSchema.parse(value)
  const { receiptDigest, ...material } = receipt
  if (canonicalDigest(material as StableHashValue) !== receiptDigest) {
    throw new Error('staging_observation_receipt_digest_mismatch')
  }
  return receipt
}

export async function readStartReceipt(path: string, repositoryRoot = process.cwd()): Promise<StartReceipt> {
  const destination = resolveReleasePath(path, repositoryRoot)
  let value: unknown
  try {
    value = JSON.parse(await readFile(destination, 'utf8')) as unknown
  } catch {
    throw new Error('staging_observation_start_receipt_invalid')
  }
  return parseStartReceipt(value)
}

export async function writeStagingReceipt(
  receipt: StagingReceipt,
  path: string,
  repositoryRoot = process.cwd(),
): Promise<StagingReceipt> {
  const parsed = parseStagingReceipt(receipt)
  const destination = resolveReleasePath(path, repositoryRoot)
  await mkdir(dirname(destination), { recursive: true })
  const temporary = `${destination}.${process.pid}.${Math.random().toString(16).slice(2)}.tmp`
  const handle = await open(temporary, 'wx', 0o600)
  try {
    await handle.writeFile(`${JSON.stringify(parsed)}\n`, 'utf8')
    await handle.sync()
    await handle.close()
    await link(temporary, destination)
    await unlink(temporary)
    return StagingReceiptSchema.parse(JSON.parse(await readFile(destination, 'utf8')))
  } catch (error) {
    await handle.close().catch(() => undefined)
    await unlink(temporary).catch(() => undefined)
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      throw new Error('staging_observation_receipt_exists', { cause: error })
    }
    throw error
  }
}

async function backfillAll(runtime: StagingRuntime): Promise<number> {
  let cursor: string | null = null
  let processed = 0
  const seen = new Set<string>()
  while (true) {
    const result = backfillSchema.parse(await runtime.run(
      'capabilitySupplyOperations:backfillCurrentOperationProjections',
      { paginationOpts: { numItems: BACKFILL_PAGE_SIZE, cursor } },
    ))
    if (result.processed === 0 && !result.isDone) throw new Error('staging_observation_backfill_no_progress')
    processed += result.processed
    if (processed > MAX_ROWS) throw new Error('staging_observation_backfill_capacity_exceeded')
    if (result.isDone) return processed
    if (result.continueCursor.length === 0 || result.continueCursor === cursor || seen.has(result.continueCursor)) {
      throw new Error('staging_observation_backfill_cursor_repeated')
    }
    seen.add(result.continueCursor)
    cursor = result.continueCursor
  }
}

async function setMode(
  runtime: StagingRuntime,
  options: StageOptions,
  mode: 'old' | 'shadow' | 'new',
  reason: string,
): Promise<void> {
  const result = z.strictObject({ mode: z.literal(mode) }).parse(await runtime.run(
    'capabilitySupplyOperations:setCurrentOperationReadMode',
    { mode, reason: boundedReasonSchema.parse(reason), releaseOwner: options.releaseOwner, now: runtime.now() },
  ))
  if (result.mode !== mode) throw new Error('staging_observation_mode_write_failed')
}

async function readEvidence(
  runtime: StagingRuntime,
  options: StageOptions,
  observedSince: number,
): Promise<Readonly<{ snapshot: Snapshot; diagnostic: z.infer<typeof diagnosticSchema> }>> {
  const snapshotValue = snapshotSchema.parse(await runtime.run(
    'capabilitySupplyOperations:currentOperationStagingSnapshot',
    { now: runtime.now(), observedSince },
  ))
  if (snapshotValue.kind === 'unavailable') throw new Error('staging_observation_source_revision_unavailable')
  const diagnostic = diagnosticSchema.parse(await runtime.run(
    'capabilitySupplyOperations:currentOperationShadowDiagnostics',
    { now: runtime.now() },
  ))
  if (snapshotValue.deploymentName !== options.deploymentName) throw new Error('staging_observation_deployment_mismatch')
  if (snapshotValue.sourceRevision !== options.sourceRevision) throw new Error('staging_observation_revision_mismatch')
  if (snapshotValue.truncated || diagnostic.truncated) throw new Error('staging_observation_evidence_truncated')
  if (snapshotValue.sourceCount < 1) throw new Error('staging_observation_source_count_invalid')
  if (snapshotValue.sourceCount !== snapshotValue.searchProjectionCount
    || snapshotValue.sourceCount !== snapshotValue.detailProjectionCount
    || diagnostic.sourceCount !== snapshotValue.sourceCount
    || diagnostic.projectionCount !== snapshotValue.searchProjectionCount) {
    throw new Error('staging_observation_projection_count_mismatch')
  }
  if (diagnostic.unexplainedMismatchCount !== 0) throw new Error('staging_observation_unexplained_mismatch')
  if (snapshotValue.observedSinceCount + snapshotValue.unobservedSinceCount !== snapshotValue.sourceCount) {
    throw new Error('staging_observation_observation_count_invalid')
  }
  return { snapshot: snapshotValue, diagnostic }
}

async function bestEffortOld(runtime: StagingRuntime, options: StageOptions, reason: string): Promise<boolean> {
  try {
    await setMode(runtime, options, 'old', reason)
    return controlSchema.parse(await runtime.run(
      'capabilitySupplyOperations:readCurrentOperationReadControl',
      {},
    )).mode === 'old'
  } catch {
    return false
  }
}

async function startStage(runtime: StagingRuntime, options: StageOptions): Promise<StartReceipt> {
  const startedAt = runtime.now()
  const logs = await runtime.startLogs()
  let mutationAttempted = false
  try {
    const initial = controlSchema.parse(await runtime.run(
      'capabilitySupplyOperations:readCurrentOperationReadControl',
      {},
    ))
    if (initial.mode === 'new') throw new Error('staging_observation_new_mode_forbidden_at_start')
    mutationAttempted = true
    await backfillAll(runtime)
    await setMode(runtime, options, 'shadow', `t8_staging_soak:${options.sourceRevision}`)
    const firstControl = controlSchema.parse(await runtime.run(
      'capabilitySupplyOperations:readCurrentOperationReadControl',
      {},
    ))
    if (firstControl.mode !== 'shadow' || firstControl.verifiedProjectionDigest === undefined) {
      throw new Error('staging_observation_shadow_control_unverified')
    }
    await backfillAll(runtime)
    const secondControl = controlSchema.parse(await runtime.run(
      'capabilitySupplyOperations:readCurrentOperationReadControl',
      {},
    ))
    if (secondControl.mode !== 'shadow'
      || secondControl.verifiedProjectionDigest !== firstControl.verifiedProjectionDigest) {
      throw new Error('staging_observation_backfill_digest_changed')
    }
    const { snapshot } = await readEvidence(runtime, options, startedAt)
    if (secondControl.verifiedActiveCount !== snapshot.sourceCount) {
      throw new Error('staging_observation_verified_count_mismatch')
    }
    const cycle = await logs.waitForCycle(CYCLE_TIMEOUT_MS)
    const completedAt = runtime.now()
    return StartReceiptSchema.parse(receiptWithDigest({
      schemaVersion: 'current-operation-staging-observation:v1' as const,
      kind: 'current_operation_staging_start' as const,
      deploymentName: options.deploymentName,
      sourceRevision: options.sourceRevision,
      releaseOwner: options.releaseOwner,
      startedAt,
      completedAt,
      mode: 'shadow' as const,
      counts: {
        source: snapshot.sourceCount,
        search: snapshot.searchProjectionCount,
        detail: snapshot.detailProjectionCount,
      },
      sourceSetDigest: snapshot.sourceSetDigest,
      projectionDigest: secondControl.verifiedProjectionDigest,
      readinessSetDigest: snapshot.readinessSetDigest,
      observedSinceCount: snapshot.observedSinceCount,
      unobservedSinceCount: snapshot.unobservedSinceCount,
      scheduledDueCount: cycle.dueCount,
      terminalOutcomeCounts: cycle.terminalOutcomeCounts,
      cycleDigest: cycle.cycleDigest,
    } as const))
  } catch (error) {
    if (mutationAttempted) {
      const rolledBack = await bestEffortOld(runtime, options, 't8_start_failure_rollback')
      throw new Error(`staging_observation_start_failed:rollback_${rolledBack ? 'succeeded' : 'failed'}`, { cause: error })
    }
    throw error
  } finally {
    await logs.close()
  }
}

async function completeStage(
  runtime: StagingRuntime,
  options: StageOptions,
  repositoryRoot: string,
): Promise<z.infer<typeof CompleteReceiptSchema>> {
  const baseline = await readStartReceipt(options.startArtifactPath ?? '', repositoryRoot)
  if (baseline.deploymentName !== options.deploymentName
    || baseline.sourceRevision !== options.sourceRevision
    || baseline.releaseOwner !== options.releaseOwner) {
    throw new Error('staging_observation_baseline_join_mismatch')
  }
  const now = runtime.now()
  if (now - baseline.startedAt < MIN_SOAK_MS) throw new Error('staging_observation_soak_incomplete')
  const expectedConfirmation = `cutover:${options.deploymentName}:${options.sourceRevision}:${options.releaseOwner}:${baseline.receiptDigest}`
  if (options.cutoverConfirmation !== expectedConfirmation) {
    throw new Error('staging_observation_cutover_confirmation_invalid')
  }
  let mutationAttempted = false
  try {
    const control = controlSchema.parse(await runtime.run(
      'capabilitySupplyOperations:readCurrentOperationReadControl',
      {},
    ))
    if (control.mode !== 'shadow') throw new Error('staging_observation_shadow_mode_required')
    mutationAttempted = true
    await backfillAll(runtime)
    const before = await readEvidence(runtime, options, baseline.startedAt)
    if (before.snapshot.sourceSetDigest !== baseline.sourceSetDigest) {
      throw new Error('staging_observation_source_set_changed')
    }
    await setMode(runtime, options, 'new', `t8_cutover:${baseline.receiptDigest}`)
    const afterControl = controlSchema.parse(await runtime.run(
      'capabilitySupplyOperations:readCurrentOperationReadControl',
      {},
    ))
    const after = await readEvidence(runtime, options, baseline.startedAt)
    if (afterControl.mode !== 'new'
      || afterControl.verifiedActiveCount !== after.snapshot.sourceCount
      || afterControl.verifiedProjectionDigest === undefined
      || after.snapshot.sourceSetDigest !== baseline.sourceSetDigest) {
      throw new Error('staging_observation_cutover_verification_failed')
    }
    const completedAt = runtime.now()
    return CompleteReceiptSchema.parse(receiptWithDigest({
      schemaVersion: 'current-operation-staging-observation:v1' as const,
      kind: 'current_operation_staging_complete' as const,
      deploymentName: options.deploymentName,
      sourceRevision: options.sourceRevision,
      releaseOwner: options.releaseOwner,
      startedAt: baseline.startedAt,
      completedAt,
      soakDurationMs: completedAt - baseline.startedAt,
      baselineReceiptDigest: baseline.receiptDigest,
      mode: 'new' as const,
      counts: {
        source: after.snapshot.sourceCount,
        search: after.snapshot.searchProjectionCount,
        detail: after.snapshot.detailProjectionCount,
      },
      sourceSetDigest: after.snapshot.sourceSetDigest,
      projectionDigest: afterControl.verifiedProjectionDigest,
      readinessSetDigest: after.snapshot.readinessSetDigest,
      observedSinceCount: after.snapshot.observedSinceCount,
      unobservedSinceCount: after.snapshot.unobservedSinceCount,
    } as const))
  } catch (error) {
    if (mutationAttempted) {
      const rolledBack = await bestEffortOld(runtime, options, 't8_complete_failure_rollback')
      throw new Error(`staging_observation_complete_failed:rollback_${rolledBack ? 'succeeded' : 'failed'}`, { cause: error })
    }
    throw error
  }
}

async function rollbackStage(
  runtime: StagingRuntime,
  options: StageOptions,
): Promise<z.infer<typeof RollbackReceiptSchema>> {
  const reason = boundedReasonSchema.parse(options.rollbackReason)
  await setMode(runtime, options, 'old', reason)
  const control = controlSchema.parse(await runtime.run(
    'capabilitySupplyOperations:readCurrentOperationReadControl',
    {},
  ))
  if (control.mode !== 'old') throw new Error('staging_observation_rollback_verification_failed')
  return RollbackReceiptSchema.parse(receiptWithDigest({
    schemaVersion: 'current-operation-staging-observation:v1' as const,
    kind: 'current_operation_staging_rollback' as const,
    deploymentName: options.deploymentName,
    sourceRevision: options.sourceRevision,
    releaseOwner: options.releaseOwner,
    completedAt: runtime.now(),
    mode: 'old' as const,
    reasonDigest: canonicalDigest({ reason }),
    projectionRowsRetained: true as const,
  } as const))
}

export async function observeCurrentOperationStaging(
  runtime: StagingRuntime,
  options: StageOptions,
  repositoryRoot = process.cwd(),
): Promise<StagingReceipt> {
  const receipt = options.stage === 'start'
    ? await startStage(runtime, options)
    : options.stage === 'complete'
      ? await completeStage(runtime, options, repositoryRoot)
      : await rollbackStage(runtime, options)
  try {
    return await writeStagingReceipt(receipt, options.receiptPath, repositoryRoot)
  } catch (error) {
    if (options.stage === 'rollback') throw error
    const rolledBack = await bestEffortOld(
      runtime,
      options,
      `t8_${options.stage}_receipt_failure_rollback`,
    )
    throw new Error(
      `staging_observation_${options.stage}_receipt_failed:rollback_${rolledBack ? 'succeeded' : 'failed'}`,
      { cause: error },
    )
  }
}

export function convexRunArguments(
  functionName: AllowedFunctionName,
  args: unknown,
  deploymentName: string,
): readonly string[] {
  if (!ALLOWED_FUNCTIONS.has(functionName)) throw new Error('staging_observation_function_forbidden')
  return [
    'run', functionName, JSON.stringify(args),
    '--deployment', deploymentSchema.parse(deploymentName),
    '--codegen', 'disable', '--typecheck', 'disable',
  ]
}

export function convexLogArguments(deploymentName: string): readonly string[] {
  return ['logs', '--success', '--jsonl', '--deployment', deploymentSchema.parse(deploymentName)]
}

export class JsonlRecordBuffer {
  readonly records: unknown[] = []
  #buffer = ''
  #receivedBytes = 0

  push(chunk: string): void {
    this.#receivedBytes += Buffer.byteLength(chunk)
    if (this.#receivedBytes > MAX_LOG_BUFFER_BYTES) {
      throw new Error('staging_observation_log_buffer_exceeded')
    }
    this.#buffer += chunk
    const lines = this.#buffer.split('\n')
    this.#buffer = lines.pop() ?? ''
    for (const line of lines) {
      if (line.trim().length === 0) continue
      try {
        this.records.push(JSON.parse(line) as unknown)
      } catch {
        throw new Error('staging_observation_log_json_invalid')
      }
    }
  }

  finish(): void {
    if (this.#buffer.trim().length !== 0) throw new Error('staging_observation_log_json_fragment_incomplete')
  }
}

type SpawnProcess = (
  command: string,
  args: readonly string[],
  options: Readonly<{ cwd: string; env: NodeJS.ProcessEnv; shell: false }>,
) => ChildProcessWithoutNullStreams

export function convexCliInvocation(
  cli: string,
  args: readonly string[],
  repositoryRoot: string,
  deployKey: string | undefined,
): Readonly<{
  command: string
  args: readonly string[]
  options: Readonly<{ cwd: string; env: NodeJS.ProcessEnv; shell: false }>
}> {
  return {
    command: process.execPath,
    args: [cli, ...args],
    options: {
      cwd: repositoryRoot,
      env: { PATH: process.env.PATH, CONVEX_DEPLOY_KEY: deployKey },
      shell: false,
    },
  }
}

function parseRunOutput(output: string): unknown {
  try {
    return JSON.parse(output.trim()) as unknown
  } catch {
    throw new Error('staging_observation_convex_output_invalid')
  }
}

function extractStructuredEvents(raw: unknown): readonly unknown[] {
  if (typeof raw !== 'object' || raw === null) return []
  const value = raw as Record<string, unknown>
  if (value.kind !== 'Completion' || !Array.isArray(value.logLines)) return []
  return value.logLines.flatMap((line) => {
    if (typeof line !== 'object' || line === null) return []
    const messages = (line as Record<string, unknown>).messages
    if (!Array.isArray(messages)) return []
    return messages.flatMap((message) => {
      if (typeof message !== 'string') return []
      try {
        return [JSON.parse(message) as unknown]
      } catch {
        return []
      }
    })
  })
}

export function readinessCycleFromLogRecords(records: readonly unknown[]): CycleEvidence | undefined {
  for (const rawCycle of records) {
    if (typeof rawCycle !== 'object' || rawCycle === null) continue
    const completion = rawCycle as Record<string, unknown>
    if (completion.kind !== 'Completion'
      || completion.identifier !== 'capabilitySupply:scheduleDueCapabilityProbes') continue
    const cycleEvents = extractStructuredEvents(completion)
    const matchingCycleEvents = cycleEvents.filter((event) => (
      typeof event === 'object'
      && event !== null
      && (event as Record<string, unknown>).kind === 'capability_readiness_scheduled_cycle'
    ))
    if (matchingCycleEvents.length > 1) throw new Error('staging_observation_cycle_duplicate')
    if (matchingCycleEvents.length === 0) continue
    if (completion.caller !== 'Cron') throw new Error('staging_observation_cycle_caller_invalid')
    if (completion.error !== null || completion.willRetry !== false) {
      throw new Error('staging_observation_cycle_completion_error')
    }
    for (const rawEvent of matchingCycleEvents) {
      const cycle = z.strictObject({
        kind: z.literal('capability_readiness_scheduled_cycle'),
        schemaVersion: z.literal('capability-readiness-scheduled-cycle:v1'),
        observedAt: z.number().int().nonnegative(),
        dueCount: z.number().int().min(1).max(20),
        scheduledFunctionIds: z.array(z.string().min(1)).min(1).max(20),
      }).safeParse(rawEvent)
      if (!cycle.success) throw new Error('staging_observation_cycle_malformed')
      if (cycle.data.dueCount !== cycle.data.scheduledFunctionIds.length
        || new Set(cycle.data.scheduledFunctionIds).size !== cycle.data.dueCount) {
        throw new Error('staging_observation_cycle_malformed')
      }
      const expected = new Set(cycle.data.scheduledFunctionIds)
      const started = new Map<string, number>()
      const terminals = new Map<string, 'observed' | 'unavailable' | 'refused'>()
      for (const rawChild of records) {
        if (typeof rawChild !== 'object' || rawChild === null) continue
        const child = rawChild as Record<string, unknown>
        if (child.kind !== 'Completion'
          || child.identifier !== 'capabilitySupplyReadiness:probe') continue
        const childEvents = extractStructuredEvents(child)
        for (const childEvent of childEvents) {
          const childKind = typeof childEvent === 'object' && childEvent !== null
            ? (childEvent as Record<string, unknown>).kind
            : undefined
          if (childKind !== 'capability_readiness_probe_started'
            && childKind !== 'capability_readiness_probe_terminal') continue
          const rawScheduledFunctionId = (childEvent as Record<string, unknown>).scheduledFunctionId
          if (typeof rawScheduledFunctionId !== 'string' || !expected.has(rawScheduledFunctionId)) continue
          if (child.caller !== 'Scheduler') throw new Error('staging_observation_probe_caller_invalid')
          if (child.error !== null || child.willRetry !== false) {
            throw new Error('staging_observation_probe_child_error')
          }
          const start = z.strictObject({
            kind: z.literal('capability_readiness_probe_started'),
            schemaVersion: z.literal('capability-readiness-probe-event:v1'),
            observedAt: z.number().int().nonnegative(),
            scheduledFunctionId: z.string().min(1),
          }).safeParse(childEvent)
          if (childKind === 'capability_readiness_probe_started' && !start.success) {
            throw new Error('staging_observation_probe_start_malformed')
          }
          if (start.success) {
            if (started.has(start.data.scheduledFunctionId)) {
              throw new Error('staging_observation_probe_start_duplicate')
            }
            started.set(start.data.scheduledFunctionId, 1)
          }
          const terminal = z.union([
            z.strictObject({
              kind: z.literal('capability_readiness_probe_terminal'),
              schemaVersion: z.literal('capability-readiness-probe-event:v1'),
              observedAt: z.number().int().nonnegative(),
              scheduledFunctionId: z.string().min(1),
              terminalKind: z.literal('observed'),
              lifecycleState: z.enum(['inactive', 'active', 'withdrawn', 'incompatible']),
            }),
            z.strictObject({
              kind: z.literal('capability_readiness_probe_terminal'),
              schemaVersion: z.literal('capability-readiness-probe-event:v1'),
              observedAt: z.number().int().nonnegative(),
              scheduledFunctionId: z.string().min(1),
              terminalKind: z.literal('unavailable'),
              reason: z.enum([
                'publication_missing', 'publication_stale', 'offering_invalid', 'binding_invalid',
                'contract_missing', 'input_unrepresentable', 'effectful_probe_unsupported',
                'mcp_tool_missing', 'authority_stale', 'target_not_public',
              ]),
            }),
            z.strictObject({
              kind: z.literal('capability_readiness_probe_terminal'),
              schemaVersion: z.literal('capability-readiness-probe-event:v1'),
              observedAt: z.number().int().nonnegative(),
              scheduledFunctionId: z.string().min(1),
              terminalKind: z.literal('refused'),
              reason: z.enum(['revision_changed', 'target_changed']),
            }),
          ]).safeParse(childEvent)
          if (childKind === 'capability_readiness_probe_terminal' && !terminal.success) {
            throw new Error('staging_observation_probe_terminal_malformed')
          }
          if (terminal.success) {
            if (terminals.has(terminal.data.scheduledFunctionId)) throw new Error('staging_observation_probe_terminal_duplicate')
            terminals.set(terminal.data.scheduledFunctionId, terminal.data.terminalKind)
          }
        }
      }
      if ([...expected].some((id) => started.get(id) !== 1 || !terminals.has(id))) continue
      const terminalOutcomeCounts = { observed: 0, unavailable: 0, refused: 0 }
      for (const terminal of terminals.values()) terminalOutcomeCounts[terminal] += 1
      return {
        dueCount: cycle.data.dueCount,
        terminalOutcomeCounts,
        cycleDigest: canonicalDigest({
          schemaVersion: cycle.data.schemaVersion,
          observedAt: cycle.data.observedAt,
          dueCount: cycle.data.dueCount,
          jobSetDigest: canonicalDigest([...expected].sort()),
          terminalOutcomeCounts,
        }),
      }
    }
  }
  return undefined
}

export function createConvexRuntime(
  options: Pick<StageOptions, 'deploymentName'>,
  env: Environment = process.env,
  repositoryRoot = process.cwd(),
  spawnProcess: SpawnProcess = spawn,
): StagingRuntime {
  const cli = resolve(repositoryRoot, 'node_modules/convex/bin/main.js')
  const execute = async (args: readonly string[]): Promise<string> => await new Promise((resolvePromise, reject) => {
    const invocation = convexCliInvocation(cli, args, repositoryRoot, env.CONVEX_DEPLOY_KEY)
    const child = spawnProcess(invocation.command, invocation.args, invocation.options)
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString('utf8') })
    child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString('utf8') })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) resolvePromise(stdout)
      else reject(new Error(`staging_observation_convex_command_failed:${code ?? 'signal'}:${canonicalDigest(stderr)}`))
    })
  })
  return {
    now: () => Date.now(),
    run: async (functionName, args) => parseRunOutput(await execute(
      convexRunArguments(functionName, args, options.deploymentName),
    )),
    startLogs: async () => {
      const invocation = convexCliInvocation(
        cli,
        convexLogArguments(options.deploymentName),
        repositoryRoot,
        env.CONVEX_DEPLOY_KEY,
      )
      const child = spawnProcess(invocation.command, invocation.args, invocation.options)
      const recordBuffer = new JsonlRecordBuffer()
      const waiters = new Set<() => void>()
      let streamError: Error | undefined
      const notify = () => { for (const waiter of waiters) waiter() }
      child.stdout.on('data', (chunk: Buffer) => {
        try {
          recordBuffer.push(chunk.toString('utf8'))
        } catch (error) {
          streamError = error instanceof Error ? error : new Error(String(error))
        }
        notify()
      })
      child.stderr.on('data', () => undefined)
      child.on('error', (error) => { streamError = error; notify() })
      child.on('close', (code) => {
        if (code !== null && code !== 0) streamError = new Error(`staging_observation_log_stream_failed:${code}`)
        notify()
      })
      return {
        waitForCycle: async (timeoutMs) => await new Promise<CycleEvidence>((resolvePromise, reject) => {
          const deadline = Date.now() + timeoutMs
          let timer: NodeJS.Timeout | undefined
          const inspect = () => {
            try {
              if (streamError !== undefined) throw streamError
              const evidence = readinessCycleFromLogRecords(recordBuffer.records)
              if (evidence !== undefined) {
                if (timer !== undefined) clearTimeout(timer)
                waiters.delete(inspect)
                resolvePromise(evidence)
                return
              }
              const remaining = deadline - Date.now()
              if (remaining <= 0) throw new Error('staging_observation_cycle_timeout')
              if (timer !== undefined) clearTimeout(timer)
              timer = setTimeout(inspect, remaining)
            } catch (error) {
              if (timer !== undefined) clearTimeout(timer)
              waiters.delete(inspect)
              reject(error)
            }
          }
          waiters.add(inspect)
          inspect()
        }),
        close: async () => {
          child.kill('SIGTERM')
          await new Promise<void>((resolvePromise) => {
            if (child.exitCode !== null || child.signalCode !== null) resolvePromise()
            else child.once('close', () => resolvePromise())
          })
        },
      }
    },
  }
}

export async function main(
  args: readonly string[] = process.argv.slice(2),
  env: Environment = process.env,
  repositoryRoot = process.cwd(),
): Promise<StagingReceipt> {
  const options = parseStageOptions(args, env)
  return await observeCurrentOperationStaging(
    createConvexRuntime(options, env, repositoryRoot),
    options,
    repositoryRoot,
  )
}

const entrypoint = process.argv[1]
if (entrypoint !== undefined && import.meta.url === pathToFileURL(entrypoint).href) {
  try {
    const receipt = await main()
    process.stdout.write(`Current Operation staging ${receipt.kind} completed; receipt=${resolveReleasePath(process.argv[process.argv.indexOf('--receipt') + 1] ?? '')}\n`)
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  }
}
