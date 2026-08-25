import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import {
  CompleteReceiptSchema,
  JsonlRecordBuffer,
  RollbackReceiptSchema,
  StartReceiptSchema,
  convexCliInvocation,
  convexLogArguments,
  convexRunArguments,
  observeCurrentOperationStaging,
  parseStageOptions,
  parseStartReceipt,
  parseStagingReceipt,
  readinessCycleFromLogRecords,
  resolveReleasePath,
  writeStagingReceipt,
  type LogStream,
  type StageOptions,
  type StagingRuntime,
} from '../../../tools/release/current-operation-staging-observation'

const revision = '0123456789abcdef0123456789abcdef01234567'
const deploymentName = 'fabricated-staging-123'
const owner = 'fabricated-release-owner'
const deployKey = `dev:${deploymentName}|fabricated-secret-material-123456`
const projectionDigest = `sha256:${'1'.repeat(64)}`
const sourceSetDigest = `sha256:${'2'.repeat(64)}`
const readinessSetDigest = `sha256:${'3'.repeat(64)}`
const cycleDigest = `sha256:${'4'.repeat(64)}`
const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map(async (root) => await rm(root, { recursive: true, force: true })))
})

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'ae-t8-staging-observation.'))
  roots.push(root)
  return root
}

function options(
  stage: StageOptions['stage'],
  receipt = `output/release/${stage}.json`,
): StageOptions {
  return {
    stage,
    deploymentName,
    sourceRevision: revision,
    releaseOwner: owner,
    receiptPath: receipt,
    ...(stage === 'rollback' ? { rollbackReason: 'fabricated operator rollback' } : {}),
  }
}

type RuntimeControls = Readonly<{
  now?: number
  sourceCount?: number
  searchCount?: number
  detailCount?: number
  truncated?: boolean
  unexplained?: number
  sourceDigest?: string
  failAfterNew?: boolean
  failSetMode?: 'shadow' | 'new'
  cycleError?: Error
  backfill?: readonly unknown[]
  cycle?: Awaited<ReturnType<LogStream['waitForCycle']>>
}>

function fakeRuntime(controls: RuntimeControls = {}): StagingRuntime & {
  calls: Array<{ functionName: string; args: unknown }>
  cycleTimeouts: number[]
  mode: 'old' | 'shadow' | 'new'
} {
  const calls: Array<{ functionName: string; args: unknown }> = []
  const cycleTimeouts: number[] = []
  const backfill = [...(controls.backfill ?? [{
    processed: 1,
    rebuilt: 1,
    dropped: 0,
    unavailable: 0,
    isDone: true,
    continueCursor: 'done',
  }])]
  let backfillIndex = 0
  const runtime = {
    calls,
    cycleTimeouts,
    mode: 'old' as 'old' | 'shadow' | 'new',
    now: () => controls.now ?? 1_000,
    startLogs: async () => ({
      waitForCycle: async (timeoutMs: number) => {
        cycleTimeouts.push(timeoutMs)
        if (controls.cycleError !== undefined) throw controls.cycleError
        return controls.cycle ?? {
          dueCount: 1,
          terminalOutcomeCounts: { observed: 1, unavailable: 0, refused: 0 },
          cycleDigest,
        }
      },
      close: async () => undefined,
    }),
    run: async (functionName: string, args: unknown): Promise<unknown> => {
      calls.push({ functionName, args })
      if (functionName.endsWith('readCurrentOperationReadControl')) return {
        mode: runtime.mode,
        reason: 'fabricated',
        releaseOwner: owner,
        ...(runtime.mode === 'old'
          ? {}
          : { verifiedActiveCount: controls.sourceCount ?? 1, verifiedProjectionDigest: projectionDigest }),
        updatedAt: controls.now ?? 1_000,
        isDefault: runtime.mode === 'old',
      }
      if (functionName.endsWith('backfillCurrentOperationProjections')) {
        return backfill[Math.min(backfillIndex++, backfill.length - 1)]
      }
      if (functionName.endsWith('setCurrentOperationReadMode')) {
        const requested = (args as { mode?: unknown }).mode
        if (requested !== 'old' && requested !== 'shadow' && requested !== 'new') throw new Error('bad fake mode')
        if (controls.failSetMode === requested) throw new Error(`fabricated_${requested}_mode_failure`)
        runtime.mode = requested
        return { mode: requested }
      }
      if (functionName.endsWith('currentOperationStagingSnapshot')) {
        if (controls.failAfterNew === true && runtime.mode === 'new') {
          return { kind: 'unavailable', reason: 'source_revision_unavailable' }
        }
        const source = controls.sourceCount ?? 1
        return {
          kind: 'current_operation_staging_snapshot',
          schemaVersion: 'current-operation-staging-snapshot:v1',
          deploymentName,
          sourceRevision: revision,
          sourceCount: source,
          searchProjectionCount: controls.searchCount ?? source,
          detailProjectionCount: controls.detailCount ?? source,
          sourceSetDigest: controls.sourceDigest ?? sourceSetDigest,
          readinessSetDigest,
          observedSinceCount: source,
          unobservedSinceCount: 0,
          truncated: controls.truncated ?? false,
        }
      }
      if (functionName.endsWith('currentOperationShadowDiagnostics')) return {
        kind: 'current_operation_shadow_diagnostic',
        schemaVersion: 'current-operation-shadow-diagnostic:v1',
        sourceCount: controls.sourceCount ?? 1,
        projectionCount: controls.searchCount ?? controls.sourceCount ?? 1,
        comparedCount: controls.sourceCount ?? 1,
        explainedMismatchCount: 0,
        unexplainedMismatchCount: controls.unexplained ?? 0,
        truncated: controls.truncated ?? false,
        mismatches: [],
      }
      throw new Error(`unexpected fake function:${functionName}`)
    },
  }
  return runtime as StagingRuntime & {
    calls: Array<{ functionName: string; args: unknown }>
    cycleTimeouts: number[]
    mode: 'old' | 'shadow' | 'new'
  }
}

function completion(
  identifier: string,
  caller: string,
  events: readonly unknown[],
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    kind: 'Completion',
    identifier,
    caller,
    error: null,
    willRetry: false,
    logLines: [{ messages: events.map((event) => JSON.stringify(event)) }],
    ...overrides,
  }
}

function cycleRecords(
  terminals: readonly ('observed' | 'unavailable' | 'refused')[],
): unknown[] {
  const ids = terminals.map((_, index) => `fabricated-scheduled-${index + 1}`)
  const cycle = {
    kind: 'capability_readiness_scheduled_cycle',
    schemaVersion: 'capability-readiness-scheduled-cycle:v1',
    observedAt: 1_000,
    dueCount: ids.length,
    scheduledFunctionIds: ids,
  }
  return [
    completion('unrelated:function', 'Http', [{ kind: 'unrelated' }]),
    completion('capabilitySupply:scheduleDueCapabilityProbes', 'Cron', [cycle]),
    ...ids.map((scheduledFunctionId, index) => completion(
      'capabilitySupplyReadiness:probe',
      'Scheduler',
      [
        {
          kind: 'capability_readiness_probe_started',
          schemaVersion: 'capability-readiness-probe-event:v1',
          observedAt: 1_001 + index,
          scheduledFunctionId,
        },
        terminals[index] === 'observed'
          ? {
              kind: 'capability_readiness_probe_terminal',
              schemaVersion: 'capability-readiness-probe-event:v1',
              observedAt: 1_100 + index,
              scheduledFunctionId,
              terminalKind: 'observed',
              lifecycleState: 'active',
            }
          : {
              kind: 'capability_readiness_probe_terminal',
              schemaVersion: 'capability-readiness-probe-event:v1',
              observedAt: 1_100 + index,
              scheduledFunctionId,
              terminalKind: terminals[index],
              reason: terminals[index] === 'unavailable' ? 'target_not_public' : 'target_changed',
            },
      ],
    )),
  ]
}

describe('T8 current Operation staging observation', () => {
  it('accepts only an exact dedicated dev deployment key and complete stage arguments', () => {
    const start = parseStageOptions([
      'start', '--deployment', deploymentName, '--revision', revision,
      '--owner', owner, '--receipt', 'output/release/start.json',
    ], { CONVEX_DEPLOY_KEY: deployKey })
    expect(start).toMatchObject({ stage: 'start', deploymentName, sourceRevision: revision, releaseOwner: owner })

    const complete = parseStageOptions([
      'complete', '--deployment', deploymentName, '--revision', revision,
      '--owner', owner, '--receipt', 'output/release/complete.json',
      '--start-artifact', 'output/release/start.json', '--confirm-cutover', 'fabricated-confirmation',
    ], { CONVEX_DEPLOY_KEY: deployKey })
    expect(complete.stage).toBe('complete')

    const rollback = parseStageOptions([
      'rollback', '--deployment', deploymentName, '--revision', revision,
      '--owner', owner, '--receipt', 'output/release/rollback.json', '--reason', 'operator rollback',
    ], { CONVEX_DEPLOY_KEY: deployKey })
    expect(rollback).toMatchObject({ stage: 'rollback', rollbackReason: 'operator rollback' })
  })

  it.each([
    ['prod key', `prod:${deploymentName}|fabricated-secret-material-123456`, {}],
    ['preview key', `preview:${deploymentName}|fabricated-secret-material-123456`, {}],
    ['project key', 'project:fabricated|fabricated-secret-material-123456', {}],
    ['partial dev key', `dev:${deploymentName}|short`, {}],
    ['different dev deployment', 'dev:different-staging-123|fabricated-secret-material-123456', {}],
    ['ambient deployment', deployKey, { CONVEX_DEPLOYMENT: 'ambient-target' }],
    ['ambient URL', deployKey, { CONVEX_URL: 'https://fabricated.invalid' }],
    ['configured production identity', deployKey, { AE_T8_PRODUCTION_CONVEX_DEPLOYMENT: deploymentName }],
  ])('rejects the unsafe %s', (_label, key, extraEnvironment) => {
    expect(() => parseStageOptions([
      'start', '--deployment', deploymentName, '--revision', revision,
      '--owner', owner, '--receipt', 'output/release/start.json',
    ], { CONVEX_DEPLOY_KEY: key, ...extraEnvironment })).toThrow()
  })

  it.each(['prod', 'production', 'staging', 'dev'])('rejects the %s target alias', (alias) => {
    expect(() => parseStageOptions([
      'start', '--deployment', alias, '--revision', revision,
      '--owner', owner, '--receipt', 'output/release/start.json',
    ], { CONVEX_DEPLOY_KEY: `dev:${alias}|fabricated-secret-material-123456` })).toThrow()
  })

  it('rejects malformed revisions, missing/duplicate/extra arguments, empty owners and rollback reasons', () => {
    const base = ['start', '--deployment', deploymentName, '--revision', revision, '--owner', owner, '--receipt', 'output/release/start.json']
    const environment = { CONVEX_DEPLOY_KEY: deployKey }
    expect(() => parseStageOptions([...base, '--extra', 'value'], environment)).toThrow('staging_observation_argument_invalid')
    expect(() => parseStageOptions(base.slice(0, -2), environment)).toThrow('staging_observation_argument_missing')
    expect(() => parseStageOptions([...base, '--owner', owner], environment)).toThrow('staging_observation_argument_invalid')
    expect(() => parseStageOptions(base.map((value) => value === revision ? revision.toUpperCase() : value), environment)).toThrow()
    expect(() => parseStageOptions(base.map((value) => value === owner ? ' ' : value), environment)).toThrow()
    expect(() => parseStageOptions([
      'rollback', '--deployment', deploymentName, '--revision', revision,
      '--owner', owner, '--receipt', 'output/release/r.json', '--reason', ' ',
    ], environment)).toThrow()
  })

  it('constructs only the exact Convex command allowlist without a shell or unsafe operations', () => {
    const functions = [
      'capabilitySupplyOperations:readCurrentOperationReadControl',
      'capabilitySupplyOperations:backfillCurrentOperationProjections',
      'capabilitySupplyOperations:currentOperationShadowDiagnostics',
      'capabilitySupplyOperations:currentOperationStagingSnapshot',
      'capabilitySupplyOperations:setCurrentOperationReadMode',
    ] as const
    for (const functionName of functions) {
      const command = convexRunArguments(functionName, { mode: 'old' }, deploymentName)
      expect(command).toEqual([
        'run', functionName, '{"mode":"old"}', '--deployment', deploymentName,
        '--codegen', 'disable', '--typecheck', 'disable',
      ])
      const serialized = command.join(' ')
      for (const forbidden of [' deploy ', ' dev ', ' push ', '--prod', 'money', 'Call', 'provider', 'scheduler']) {
        expect(` ${serialized} `).not.toContain(forbidden)
      }
    }
    expect(convexLogArguments(deploymentName)).toEqual([
      'logs', '--success', '--jsonl', '--deployment', deploymentName,
    ])
    expect(() => convexRunArguments('money:charge' as never, {}, deploymentName)).toThrow('staging_observation_function_forbidden')
    const invocation = convexCliInvocation(
      '/fabricated/repository/node_modules/convex/bin/main.js',
      convexLogArguments(deploymentName),
      '/fabricated/repository',
      deployKey,
    )
    expect(invocation).toMatchObject({
      command: process.execPath,
      args: [
        '/fabricated/repository/node_modules/convex/bin/main.js',
        'logs', '--success', '--jsonl', '--deployment', deploymentName,
      ],
      options: {
        cwd: '/fabricated/repository',
        env: { CONVEX_DEPLOY_KEY: deployKey },
        shell: false,
      },
    })
  })

  it('parses fragmented JSONL without retaining an incomplete or malformed line', () => {
    const buffer = new JsonlRecordBuffer()
    buffer.push('{"kind":"Completion","identifier":"fabricated"')
    buffer.push('}\n{"kind":"Progress"}\n')
    expect(buffer.records).toEqual([
      { kind: 'Completion', identifier: 'fabricated' },
      { kind: 'Progress' },
    ])
    expect(() => buffer.finish()).not.toThrow()
    const incomplete = new JsonlRecordBuffer()
    incomplete.push('{"kind":"Completion"')
    expect(() => incomplete.finish()).toThrow('staging_observation_log_json_fragment_incomplete')
    const malformed = new JsonlRecordBuffer()
    expect(() => malformed.push('{bad}\n')).toThrow('staging_observation_log_json_invalid')
  })

  it.each([
    [['observed'] as const, { observed: 1, unavailable: 0, refused: 0 }],
    [['unavailable'] as const, { observed: 0, unavailable: 1, refused: 0 }],
    [['refused'] as const, { observed: 0, unavailable: 0, refused: 1 }],
    [Array.from({ length: 20 }, (_, index) => index % 3 === 0 ? 'unavailable' as const : 'observed' as const), { observed: 13, unavailable: 7, refused: 0 }],
  ])('accepts a bounded complete cron/scheduler lineage %#', (terminals, counts) => {
    expect(readinessCycleFromLogRecords(cycleRecords(terminals))).toMatchObject({
      dueCount: terminals.length,
      terminalOutcomeCounts: counts,
      cycleDigest: expect.stringMatching(/^sha256:[0-9a-f]{64}$/u),
    })
  })

  it('rejects duplicate/malformed cycles, duplicate terminals, caller drift, child errors, and incomplete lineages', () => {
    const records = cycleRecords(['observed'])
    const wrongCron = structuredClone(records)
    ;(wrongCron[1] as Record<string, unknown>).caller = 'Scheduler'
    expect(() => readinessCycleFromLogRecords(wrongCron)).toThrow('staging_observation_cycle_caller_invalid')
    const wrongScheduler = structuredClone(records)
    ;(wrongScheduler[2] as Record<string, unknown>).caller = 'Cron'
    expect(() => readinessCycleFromLogRecords(wrongScheduler)).toThrow('staging_observation_probe_caller_invalid')
    const childError = structuredClone(records)
    ;(childError[2] as Record<string, unknown>).error = 'fabricated failure'
    expect(() => readinessCycleFromLogRecords(childError)).toThrow('staging_observation_probe_child_error')
    expect(readinessCycleFromLogRecords(records.slice(0, -1))).toBeUndefined()

    const duplicateTerminal = structuredClone(records)
    const line = ((duplicateTerminal[2] as { logLines: Array<{ messages: string[] }> }).logLines[0])
    line?.messages.push(line.messages[1]!)
    expect(() => readinessCycleFromLogRecords(duplicateTerminal)).toThrow('staging_observation_probe_terminal_duplicate')

    const duplicateStart = structuredClone(records)
    const startLine = ((duplicateStart[2] as { logLines: Array<{ messages: string[] }> }).logLines[0])
    startLine?.messages.unshift(startLine.messages[0]!)
    expect(() => readinessCycleFromLogRecords(duplicateStart)).toThrow('staging_observation_probe_start_duplicate')

    const duplicateCycle = structuredClone(records)
    const cycleLine = ((duplicateCycle[1] as { logLines: Array<{ messages: string[] }> }).logLines[0])
    cycleLine?.messages.push(cycleLine.messages[0]!)
    expect(() => readinessCycleFromLogRecords(duplicateCycle)).toThrow('staging_observation_cycle_duplicate')

    const duplicateIds = structuredClone(records)
    const rawCycle = JSON.parse(((duplicateIds[1] as { logLines: Array<{ messages: string[] }> }).logLines[0]?.messages[0]) ?? '{}') as Record<string, unknown>
    rawCycle.dueCount = 2
    rawCycle.scheduledFunctionIds = ['fabricated-scheduled-1', 'fabricated-scheduled-1']
    ;(duplicateIds[1] as { logLines: Array<{ messages: string[] }> }).logLines[0]!.messages[0] = JSON.stringify(rawCycle)
    expect(() => readinessCycleFromLogRecords(duplicateIds)).toThrow('staging_observation_cycle_malformed')

    const malformedCycle = structuredClone(records)
    const malformedCycleLine = (malformedCycle[1] as { logLines: Array<{ messages: string[] }> }).logLines[0]!
    const malformedCycleEvent = JSON.parse(malformedCycleLine.messages[0]!) as Record<string, unknown>
    malformedCycleEvent.dueCount = '1'
    malformedCycleLine.messages[0] = JSON.stringify(malformedCycleEvent)
    expect(() => readinessCycleFromLogRecords(malformedCycle)).toThrow('staging_observation_cycle_malformed')

    const fabricatedReason = structuredClone(cycleRecords(['unavailable']))
    const fabricatedReasonLine = (fabricatedReason[2] as { logLines: Array<{ messages: string[] }> }).logLines[0]!
    const fabricatedTerminal = JSON.parse(fabricatedReasonLine.messages[1]!) as Record<string, unknown>
    fabricatedTerminal.reason = 'fabricated_reason'
    fabricatedReasonLine.messages[1] = JSON.stringify(fabricatedTerminal)
    expect(() => readinessCycleFromLogRecords(fabricatedReason)).toThrow('staging_observation_probe_terminal_malformed')
  })

  it('starts logs first, pages twice, proves retry digest stability, leaves shadow, and writes a sanitized 0600 receipt', async () => {
    const root = await temporaryRoot()
    const runtime = fakeRuntime({ backfill: [
      { processed: 1, rebuilt: 1, dropped: 0, unavailable: 0, isDone: true, continueCursor: 'done-a' },
      { processed: 1, rebuilt: 1, dropped: 0, unavailable: 0, isDone: true, continueCursor: 'done-b' },
    ] })
    const receipt = await observeCurrentOperationStaging(runtime, options('start'), root)
    expect(StartReceiptSchema.parse(receipt)).toMatchObject({ mode: 'shadow', counts: { source: 1, search: 1, detail: 1 } })
    expect(runtime.mode).toBe('shadow')
    expect(runtime.calls.filter((call) => call.functionName.endsWith('backfillCurrentOperationProjections'))).toHaveLength(2)
    const path = resolveReleasePath('output/release/start.json', root)
    expect((await stat(path)).mode & 0o777).toBe(0o600)
    const serialized = await readFile(path, 'utf8')
    for (const forbidden of ['scheduledFunctionId', 'requestId', 'operationRef', 'publicationRef', 'CONVEX_DEPLOY_KEY', 'fabricated-secret-material']) {
      expect(serialized).not.toContain(forbidden)
    }
    await expect(writeStagingReceipt(receipt, 'output/release/start.json', root)).rejects.toThrow('staging_observation_receipt_exists')
  })

  it.each([
    ['zero sources', { sourceCount: 0 }],
    ['257 sentinel', { truncated: true }],
    ['unequal search', { searchCount: 0 }],
    ['unequal detail', { detailCount: 0 }],
    ['unexplained mismatch', { unexplained: 1 }],
  ])('fails start closed for %s and immediately restores old', async (_label, controls) => {
    const root = await temporaryRoot()
    const runtime = fakeRuntime(controls)
    await expect(observeCurrentOperationStaging(runtime, options('start'), root))
      .rejects.toThrow('staging_observation_start_failed:rollback_succeeded')
    expect(runtime.mode).toBe('old')
  })

  it.each([
    ['no progress', [
      { processed: 0, rebuilt: 0, dropped: 0, unavailable: 0, isDone: false, continueCursor: 'next' },
    ], 'staging_observation_backfill_no_progress'],
    ['repeated cursor', [
      { processed: 1, rebuilt: 1, dropped: 0, unavailable: 0, isDone: false, continueCursor: 'same' },
      { processed: 1, rebuilt: 1, dropped: 0, unavailable: 0, isDone: false, continueCursor: 'same' },
    ], 'staging_observation_backfill_cursor_repeated'],
  ])('fails paginated backfill on %s', async (_label, backfill, error) => {
    const root = await temporaryRoot()
    try {
      await observeCurrentOperationStaging(fakeRuntime({ backfill }), options('start'), root)
      throw new Error('expected staged backfill failure')
    } catch (caught) {
      expect(caught).toMatchObject({
        message: 'staging_observation_start_failed:rollback_succeeded',
        cause: { message: error },
      })
    }
  })

  it('fails closed above 256 processed backfill rows', async () => {
    const root = await temporaryRoot()
    const pages = Array.from({ length: 33 }, (_, index) => ({
      processed: index === 32 ? 1 : 8,
      rebuilt: index === 32 ? 1 : 8,
      dropped: 0,
      unavailable: 0,
      isDone: index === 32,
      continueCursor: `cursor-${index}`,
    }))
    await expect(observeCurrentOperationStaging(fakeRuntime({ backfill: pages }), options('start'), root))
      .rejects.toThrow('staging_observation_start_failed:rollback_succeeded')
  })

  it('rolls back old after backfill when shadow transition or the bounded cycle times out', async () => {
    const shadowRoot = await temporaryRoot()
    const shadowFailure = fakeRuntime({ failSetMode: 'shadow' })
    await expect(observeCurrentOperationStaging(shadowFailure, options('start'), shadowRoot))
      .rejects.toThrow('staging_observation_start_failed:rollback_succeeded')
    expect(shadowFailure.mode).toBe('old')

    const timeoutRoot = await temporaryRoot()
    const timeout = fakeRuntime({ cycleError: new Error('staging_observation_cycle_timeout') })
    await expect(observeCurrentOperationStaging(timeout, options('start'), timeoutRoot))
      .rejects.toThrow('staging_observation_start_failed:rollback_succeeded')
    expect(timeout.cycleTimeouts).toEqual([7 * 60_000])
    expect(timeout.mode).toBe('old')
  })

  it('requires a strict 24-hour digest-bound baseline join before cutting over to new', async () => {
    const root = await temporaryRoot()
    const startRuntime = fakeRuntime({ now: 1_000 })
    const start = StartReceiptSchema.parse(await observeCurrentOperationStaging(startRuntime, options('start'), root))
    const completeOptions: StageOptions = {
      ...options('complete'),
      startArtifactPath: 'output/release/start.json',
      cutoverConfirmation: `cutover:${deploymentName}:${revision}:${owner}:${start.receiptDigest}`,
    }
    const early = fakeRuntime({ now: 1_000 + 86_399_999 })
    early.mode = 'shadow'
    await expect(observeCurrentOperationStaging(early, completeOptions, root)).rejects.toThrow('staging_observation_soak_incomplete')
    expect(early.mode).toBe('shadow')

    const completeRuntime = fakeRuntime({ now: 1_000 + 86_400_000 })
    completeRuntime.mode = 'shadow'
    const complete = await observeCurrentOperationStaging(completeRuntime, completeOptions, root)
    expect(CompleteReceiptSchema.parse(complete)).toMatchObject({
      mode: 'new',
      baselineReceiptDigest: start.receiptDigest,
      sourceSetDigest,
      soakDurationMs: 86_400_000,
    })
    expect(completeRuntime.mode).toBe('new')
  })

  it('rejects baseline owner/source/deployment/set drift and invalid cutover confirmation', async () => {
    const root = await temporaryRoot()
    const start = StartReceiptSchema.parse(await observeCurrentOperationStaging(fakeRuntime(), options('start'), root))
    const base: StageOptions = {
      ...options('complete'),
      startArtifactPath: 'output/release/start.json',
      cutoverConfirmation: `cutover:${deploymentName}:${revision}:${owner}:${start.receiptDigest}`,
    }
    const badOwner = fakeRuntime({ now: 86_401_000 })
    badOwner.mode = 'shadow'
    await expect(observeCurrentOperationStaging(badOwner, { ...base, releaseOwner: 'other-owner' }, root))
      .rejects.toThrow('staging_observation_baseline_join_mismatch')
    const badDeployment = fakeRuntime({ now: 86_401_000 })
    badDeployment.mode = 'shadow'
    await expect(observeCurrentOperationStaging(badDeployment, { ...base, deploymentName: 'other-staging-123' }, root))
      .rejects.toThrow('staging_observation_baseline_join_mismatch')
    const badSource = fakeRuntime({ now: 86_401_000 })
    badSource.mode = 'shadow'
    await expect(observeCurrentOperationStaging(badSource, { ...base, sourceRevision: 'abcdef0123456789abcdef0123456789abcdef01' }, root))
      .rejects.toThrow('staging_observation_baseline_join_mismatch')
    const badConfirmation = fakeRuntime({ now: 86_401_000 })
    badConfirmation.mode = 'shadow'
    await expect(observeCurrentOperationStaging(badConfirmation, { ...base, cutoverConfirmation: 'cutover:wrong' }, root))
      .rejects.toThrow('staging_observation_cutover_confirmation_invalid')
    const drift = fakeRuntime({ now: 86_401_000, sourceDigest: `sha256:${'9'.repeat(64)}` })
    drift.mode = 'shadow'
    await expect(observeCurrentOperationStaging(drift, base, root))
      .rejects.toThrow('staging_observation_complete_failed:rollback_succeeded')
    expect(drift.mode).toBe('old')
  })

  it('restores old if post-cutover verification fails', async () => {
    const root = await temporaryRoot()
    const start = StartReceiptSchema.parse(await observeCurrentOperationStaging(fakeRuntime(), options('start'), root))
    const runtime = fakeRuntime({ now: 86_401_000, failAfterNew: true })
    runtime.mode = 'shadow'
    await expect(observeCurrentOperationStaging(runtime, {
      ...options('complete'),
      startArtifactPath: 'output/release/start.json',
      cutoverConfirmation: `cutover:${deploymentName}:${revision}:${owner}:${start.receiptDigest}`,
    }, root)).rejects.toThrow('staging_observation_complete_failed:rollback_succeeded')
    expect(runtime.mode).toBe('old')
  })

  it('restores old if exclusive start-receipt persistence fails after shadow transition', async () => {
    const root = await temporaryRoot()
    await observeCurrentOperationStaging(fakeRuntime(), options('start'), root)
    const retry = fakeRuntime()
    await expect(observeCurrentOperationStaging(retry, options('start'), root))
      .rejects.toThrow('staging_observation_start_receipt_failed:rollback_succeeded')
    expect(retry.mode).toBe('old')
  })

  it('restores old if exclusive completion-receipt persistence fails after cutover', async () => {
    const root = await temporaryRoot()
    const start = StartReceiptSchema.parse(await observeCurrentOperationStaging(fakeRuntime(), options('start'), root))
    const completeOptions: StageOptions = {
      ...options('complete'),
      startArtifactPath: 'output/release/start.json',
      cutoverConfirmation: `cutover:${deploymentName}:${revision}:${owner}:${start.receiptDigest}`,
    }
    const first = fakeRuntime({ now: 86_401_000 })
    first.mode = 'shadow'
    await observeCurrentOperationStaging(first, completeOptions, root)

    const retry = fakeRuntime({ now: 86_401_001 })
    retry.mode = 'shadow'
    await expect(observeCurrentOperationStaging(retry, completeOptions, root))
      .rejects.toThrow('staging_observation_complete_receipt_failed:rollback_succeeded')
    expect(retry.mode).toBe('old')
  })

  it('rolls back independently with old-only commands and never backfills', async () => {
    const root = await temporaryRoot()
    const runtime = fakeRuntime()
    runtime.mode = 'new'
    const receipt = await observeCurrentOperationStaging(runtime, options('rollback'), root)
    expect(RollbackReceiptSchema.parse(receipt)).toMatchObject({ mode: 'old', projectionRowsRetained: true })
    expect(runtime.mode).toBe('old')
    expect(runtime.calls.some((call) => call.functionName.endsWith('backfillCurrentOperationProjections'))).toBe(false)
    expect(runtime.calls.filter((call) => call.functionName.endsWith('setCurrentOperationReadMode')))
      .toEqual([expect.objectContaining({ args: expect.objectContaining({ mode: 'old' }) })])
  })

  it('enforces strict receipt schema/digest and release-directory confinement', async () => {
    const root = await temporaryRoot()
    const start = StartReceiptSchema.parse(await observeCurrentOperationStaging(fakeRuntime(), options('start'), root))
    expect(() => parseStartReceipt({ ...start, receiptDigest: `sha256:${'0'.repeat(64)}` }))
      .toThrow('staging_observation_start_receipt_digest_mismatch')
    expect(() => parseStagingReceipt({ ...start, receiptDigest: `sha256:${'0'.repeat(64)}` }))
      .toThrow('staging_observation_receipt_digest_mismatch')
    expect(() => parseStartReceipt({ ...start, operationRef: 'operation:private' })).toThrow()
    expect(() => resolveReleasePath('../outside.json', root)).toThrow('staging_observation_receipt_path_outside_release_directory')
    expect(() => resolveReleasePath('output/release', root)).toThrow('staging_observation_receipt_path_outside_release_directory')
  })
})
