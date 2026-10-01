import { execFile } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { describe, expect, it } from 'vitest'
import { copyReleaseSource, runConvexCommand, startConvexDev, terminateIsolatedProcesses } from '../../tools/release/convex-anonymous-runtime'
import { compareConvexSnapshots, ConvexSnapshotDiagnostic, readConvexSnapshot } from '../../tools/release/convex-snapshot-compare'
import { compareRestoreArchives } from '../../tools/release/convex-restore'

import { canonicalDigest } from '@/modules/common/canonical-digest'
import { createFormanceContext, executeFormanceMoneyCommand, installPackage4FormanceSchema,
  readFormanceHealth, readFormanceTransactionByReference } from '@/modules/money/formance'
import { adjustFormanceSpendingPeriod, bookFormanceFundingSettlement, prepareFormancePromotionalCreditGrant,
  refundFormanceSettledSale, releaseFormanceManagedCall, reserveFormanceManagedCall, settleFormanceManagedCall, syncFormanceCapacity,
  type FormanceManagedCallBooking } from '@/modules/money/formance-workflows'
import { bookFormanceTreasuryBatch } from '@/modules/money/formance-treasury'
import { readFormanceRestoreSnapshot } from '@/modules/money/formance-restore'
import type { Doc } from '../../convex/_generated/dataModel'
import { buildDevelopmentPublishedToolEvidence } from '../unit/capability-supply/fixtures/development-published-tool-evidence'

const runFile = promisify(execFile)
const sourceRoot = resolve('.')
const backendVersion = 'precompiled-2026-09-28-5c7cb5b'
const namespaces = ['', 'workpool', 'stripeWebhookWorkpool', 'notificationWorkpool', 'workflow', 'rateLimiter',
  'agent', 'migrations', 'marketEvidence', 'marketOperationEvidence', 'marketToolRatings', 'marketActiveTools',
  'marketActiveProviders', 'marketDirectoryFacets', 'workflow/workpool', 'workpool/batchWorker',
  'stripeWebhookWorkpool/batchWorker', 'notificationWorkpool/batchWorker', 'workflow/workpool/batchWorker']

function completeRowCount(stdout: string, limit: number): number {
  const lines = stdout.trim() === '' ? [] : stdout.trim().split('\n')
  if (lines.length >= limit) throw new Error('restore_proof_census_incomplete')
  for (const line of lines) JSON.parse(line)
  return lines.length
}

async function ports(count = 4): Promise<number[]> {
  const servers = Array.from({ length: count }, () => createServer())
  try {
    for (const server of servers) await new Promise<void>((done, reject) => {
      server.once('error', reject); server.listen(0, '127.0.0.1', done)
    })
    return servers.map((server) => {
      const address = server.address()
      if (!address || typeof address === 'string') throw new Error('restore_proof_port_missing')
      return address.port
    })
  } finally {
    for (const server of servers) if (server.listening) await new Promise<void>((done) => { server.close(() => done()) })
  }
}

function installFixture(directory: string): void {
  copyReleaseSource(sourceRoot, directory)
  const convex = join(directory, 'convex')
  renameSync(join(convex, 'schema.ts'), join(convex, 'restoreOriginalSchema.ts'))
  writeFileSync(join(convex, 'schema.ts'), `import original from './restoreOriginalSchema'
import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'
export default defineSchema({ ...original.tables,
  restoreProofRecords: defineTable({ ordinal:v.number(), value:v.string(), fractional:v.number(), integer:v.int64(), bytes:v.bytes(), special:v.object({ nan:v.number(), infinity:v.number(), negativeZero:v.number() }) }),
  restoreProofControl: defineTable({ threadId:v.string(), scheduledId:v.string(), timerRuns:v.number(), storageId:v.optional(v.id('_storage')) }),
  workRecoveryProof: defineTable(v.union(
    v.object({ kind:v.literal('queued'), workId:v.string(), count:v.number(), completions:v.number(), callbackWorkId:v.optional(v.string()) }),
    v.object({ kind:v.literal('calls'), createdBefore:v.number(), fixtureDigest:v.string(), executions:v.number(), entries:v.array(v.object({ callRef:v.string(), workId:v.string(), kind:v.union(v.literal('active'),v.literal('unfunded'),v.literal('held'),v.literal('possibly_released')), identityDigest:v.string() })) }),
  )),
})
`)
  writeFileSync(join(convex, 'restoreProof.ts'), readFileSync(resolve('tests/fixtures/convex-restore-proof.ts'), 'utf8')
    .replace('../../convex/_generated/api', './_generated/api'))
  writeFileSync(join(convex, 'workRecoveryProof.ts'), readFileSync(resolve('tests/fixtures/convex-work-recovery-proof.ts'), 'utf8')
    .replaceAll('../../convex/', './'))
  writeFileSync(join(convex, 'financialRestoreProof.ts'), readFileSync(resolve('tests/fixtures/convex-financial-restore-proof.ts'), 'utf8')
    .replaceAll('../../convex/', './'))
  // Suppress application crons in both disposable copies: no provider work or expiry during the data proof.
  writeFileSync(join(convex, 'crons.ts'), "import { cronJobs } from 'convex/server'\nexport default cronJobs()\n")
}

/**
 * Requires fresh disposable anonymous roots, unique ports, maintained native CLI and matching code.
 * Ensures native import preserves the complete archive, real component records, typed values and bytes.
 * Invariant: each archive has a fixed baseline; source stops before work resumes on target; no inherited selectors.
 * On violation fail, including saturation or cleanup; never retry against a shared/cloud deployment.
 */
describe.skipIf(process.env.AE_CONVEX_RESTORE_INTEGRATION !== 'true')('native Convex archive restoration', () => {
  it('restores records/files, quarantines and retires old dispatches, then executes new work once', async () => {
    const root = mkdtempSync(join(tmpdir(), 'ae-convex-restore-'))
    const source = join(root, 'source')
    const target = join(root, 'target')
    const stopBackends: Array<() => Promise<void>> = []
    const failures: unknown[] = []
    let summary: Record<string, unknown> | undefined
    const command = async (isolatedRoot: string, args: readonly string[]) => {
      try { return await runConvexCommand({ sourceRoot, isolatedRoot, args,
        retainBackendOnSuccess: ['run', 'data', 'export', 'import'].includes(args[0] ?? '') }) }
      catch (error) {
        throw new Error(`restore_proof_${isolatedRoot === source ? 'source' : 'target'}_${args[0]}_${args[1]}_failed`, { cause: error })
      }
    }
    const invoke = async (isolatedRoot: string, method: string, args: object = {}): Promise<unknown> => {
      const { stdout } = await command(isolatedRoot, ['run', `restoreProof:${method}`, JSON.stringify(args)])
      // The maintained CLI emits no stdout for a successful null-returning function.
      if (stdout.trim() === '' && ['seed', 'corrupt', 'deleteFile'].includes(method)) return null
      return JSON.parse(stdout)
    }
    const invokeWork = async <T>(isolatedRoot: string, method: string, args: object = {}): Promise<T> => {
      const { stdout } = await command(isolatedRoot, ['run', `workRecoveryProof:${method}`, JSON.stringify(args)])
      return JSON.parse(stdout) as T
    }
    const pollWork = async <T>(method: string, ready: (value: T) => boolean): Promise<T> => {
      const deadline = Date.now() + 90_000
      let last: T | undefined
      while (Date.now() < deadline) {
        const value = await invokeWork<T>(target, method)
        last = value
        if (ready(value)) return value
        await new Promise(done => setTimeout(done, 1_000))
      }
      throw new Error(`restore_proof_work_timeout:${method}`, { cause: last })
    }
    const exportArchive = async (isolatedRoot: string, name: string): Promise<string> => {
      const path = join(root, `${name}.zip`)
      await command(isolatedRoot, ['export', '--include-file-storage', '--path', path])
      return path
    }
    const census = async (isolatedRoot: string): Promise<Record<string, number>> => {
      const counts: Record<string, number> = {}
      for (const namespace of namespaces) {
        // `data --format jsonLines` can contain display-only Bytes()/bigint syntax.
        // `run` emits maintained Convex JSON, including arbitrary scheduled arguments.
        const response = await command(isolatedRoot, ['run', '--inline-query',
          'await ctx.db.system.query("_scheduled_functions").take(101)',
          ...(namespace === '' ? [] : ['--component', namespace])])
        const rows: unknown = JSON.parse(response.stdout)
        if (!Array.isArray(rows) || rows.length >= 100) throw new Error('restore_proof_census_incomplete')
        counts[namespace || 'root'] = rows.length
      }
      return counts
    }
    try {
      mkdirSync(source); mkdirSync(target)
      installFixture(source); installFixture(target)
      const allocated = await ports()
      for (const [index, directory] of [source, target].entries()) {
        console.log(`Restore proof: prepare ${index === 0 ? 'source' : 'target'}`)
        await command(directory, ['dev', '--once', '--skip-push', '--local-cloud-port', String(allocated[index * 2]),
          '--local-site-port', String(allocated[index * 2 + 1]), '--local-backend-version', backendVersion])
        await command(directory, ['env', 'set', 'AE_DEPLOYMENT_ENVIRONMENT', 'development'])
        await command(directory, ['env', 'set', 'CLERK_JWT_ISSUER_DOMAIN', 'https://release-proof.invalid'])
        stopBackends.push(await startConvexDev({ sourceRoot, isolatedRoot: directory, backendVersion }))
      }
      expect(await invoke(target, 'countRecords')).toBe(0)
      await invoke(source, 'seed')
      const storageId = await invoke(source, 'storeFile')
      expect(typeof storageId).toBe('string')
      const before = await invoke(source, 'inspect')
      expect(before).toMatchObject({ records: 1_007, typedValuesValid: true, firstValue: 'record-0',
        threadTitle: 'Restore proof', messageCount: 1, messagesComplete: true, timerRuns: 0, scheduledCallbackPresent: true })
      const sourceJobs = await census(source)
      expect(sourceJobs.root).toBe(1)
      const limited = await command(source, ['data', 'restoreProofRecords', '--format', 'jsonLines', '--limit', '1000'])
      expect(() => completeRowCount(limited.stdout, 1_000)).toThrow('restore_proof_census_incomplete')
      const oldestRecordId = (before as { oldestRecordId: string }).oldestRecordId
      expect(limited.stdout).not.toContain(JSON.stringify(oldestRecordId))
      const baseline = await exportArchive(source, 'baseline')
      console.log('Restore proof: source archive exported')
      const manifest = await readConvexSnapshot(baseline)
      expect(manifest.tables.find((table) => table.path === 'restoreProofRecords')?.count).toBe(1_007)
      expect(manifest.storageFiles).toHaveLength(1)
      const archivedNamespaces = new Set(manifest.tables.map((table) => table.path.split('/').slice(0, -1)
        .filter((part) => part !== '_components').join('/')))
      expect([...archivedNamespaces].sort()).toEqual([...namespaces].sort())
      const restore = () => command(target, ['import', baseline, '--replace', '--yes'])
      await restore()
      console.log('Restore proof: target imported')
      const after = await invoke(target, 'inspect')
      expect(after).toEqual({ ...(before as object), scheduledCallbackPresent: false })
      const targetJobs = await census(target)
      expect(Object.values(targetJobs).every((count) => count === 0)).toBe(true)
      const expectedFile = Uint8Array.from({ length: 1_031 }, (_, index) => index % 256)
      expect(await invoke(target, 'readFile', { storageId })).toEqual({ bytes: expectedFile.length,
        sha256: createHash('sha256').update(expectedFile).digest('hex') })
      const restored = await exportArchive(target, 'restored')
      const match = await compareConvexSnapshots(baseline, restored)
      expect(match).toMatchObject({ kind: 'matched', scope: 'records_and_files' })
      const receipt = join(root, 'receipt.json')
      await compareRestoreArchives(['--source', baseline, '--restored', restored, '--receipt', receipt])
      expect(JSON.parse(readFileSync(receipt, 'utf8'))).toMatchObject(match)
      expect(statSync(receipt).mode & 0o777).toBe(0o600)
      await expect(compareRestoreArchives(['--source', baseline, '--restored', restored, '--receipt', receipt])).rejects.toThrow()
      for (const kind of ['old_record', 'missing_record', 'extra_record', 'component']) {
        await restore()
        await invoke(target, 'corrupt', { kind })
        const corrupt = await exportArchive(target, kind)
        await expect(compareConvexSnapshots(baseline, corrupt)).rejects.toBeInstanceOf(ConvexSnapshotDiagnostic)
      }
      await restore()
      await invoke(target, 'deleteFile', { storageId })
      await expect(compareConvexSnapshots(baseline, await exportArchive(target, 'deleted-file')))
        .rejects.toBeInstanceOf(ConvexSnapshotDiagnostic)
      const fileMember = manifest.storageFiles[0]!.path
      const corruptedFile = join(root, 'file-corruption', fileMember)
      mkdirSync(dirname(corruptedFile), { recursive: true })
      expectedFile[1] = 44
      writeFileSync(corruptedFile, expectedFile)
      const changedArchive = join(root, 'changed-file.zip')
      copyFileSync(baseline, changedArchive)
      await runFile('/usr/bin/zip', ['-q', changedArchive, fileMember], { cwd: join(root, 'file-corruption') })
      await expect(readConvexSnapshot(changedArchive)).rejects.toMatchObject({ code: 'snapshot_storage_checksum_mismatch' })
      const failedReceipt = join(root, 'failed-receipt.json')
      await expect(compareRestoreArchives(['--source', baseline, '--restored', changedArchive, '--receipt', failedReceipt])).rejects.toThrow()
      expect(() => statSync(failedReceipt)).toThrow()
      // Restore actual component queues and synthetic durable Call evidence separately from the data proof.
      console.log('Restore proof: seed original work and stranded Call evidence')
      const calls = await invokeWork<{ createdBefore: number; fixtureDigest: string }>(source, 'seedCalls', {
        runAt: Date.now() + 86_400_000,
      })
      type CallProof = {
        fixtureDigest: string; identitiesPreserved: boolean; activePrefix: boolean; activePending: number; workFinished: number; executions: number
        states: Array<{ callRef: string; workId: string; workState: string; kind: string; state: string; resultKind: string; attemptRef: string | null;
          effectGeneration: number | null; financialState: string | null; reservationRefsPreserved: boolean;
          reconciliation: null | { disposition: string; reason: string } }>
      }
      const sourceDeadline = Date.now() + 90_000
      let sourceCalls = await invokeWork<CallProof>(source, 'readCalls')
      while (sourceCalls.workFinished !== 3 && Date.now() < sourceDeadline) {
        await new Promise(done => setTimeout(done, 1_000))
        sourceCalls = await invokeWork<CallProof>(source, 'readCalls')
      }
      expect(sourceCalls).toMatchObject({ fixtureDigest: calls.fixtureDigest, identitiesPreserved: true,
        activePrefix: true, activePending: 25, workFinished: 3, executions: 2 })
      // Capture interrupted cancellations too: duplicate cancel ACKs do not refresh
      // runner handles, so the target must explicitly re-register its runner.
      await command(source, ['run', 'lib:stop', '{"name":"main"}', '--component', 'workpool/batchWorker'])
      expect(await invokeWork(source, 'requestCallCancellations')).toEqual({ requested: 28 })
      const runAt = Date.now() + 30_000
      const queued = await invokeWork<{ workId: string }>(source, 'seedQueued', { runAt })
      await command(source, ['run', 'lib:cancel', JSON.stringify({ id: queued.workId }), '--component', 'workpool'])
      const workBaseline = await exportArchive(source, 'work-baseline')
      expect(await invokeWork(source, 'readQueued')).toMatchObject({ workId: queued.workId, state: 'pending', count: 0, completions: 0 })
      expect(runAt - Date.now()).toBeGreaterThan(5_000)
      await stopBackends[0]!()
      await command(target, ['import', workBaseline, '--replace', '--yes'])
      expect(await compareConvexSnapshots(workBaseline, await exportArchive(target, 'work-restored')))
        .toMatchObject({ kind: 'matched', scope: 'records_and_files' })
      const firstPage = await invokeWork(target, 'beginCallRecovery')
      expect(firstPage).toMatchObject({ scanned: 25, recovered: 0, waiting: 25, isDone: false })
      const recovered = await pollWork<CallProof>('readCalls', value => value.states
        .filter(row => row.kind !== 'active').every(row => row.state !== 'pending'))
      expect(recovered).toMatchObject({ fixtureDigest: calls.fixtureDigest, identitiesPreserved: true, activePending: 25 })
      expect(recovered.states.every(row => row.reservationRefsPreserved)).toBe(true)
      expect(recovered.states.find(row => row.kind === 'unfunded')).toMatchObject({ state: 'refused', resultKind: 'refused' })
      for (const kind of ['held', 'possibly_released']) {
        expect(recovered.states.find(row => row.kind === kind)).toMatchObject({ state: 'reconciliation_required',
          resultKind: 'reconciliation_required', reconciliation: { disposition: 'automatic' } })
      }
      const uncertainBefore = sourceCalls.states.find(row => row.kind === 'possibly_released')!
      expect(recovered.states.find(row => row.kind === 'possibly_released')).toMatchObject({
        attemptRef: uncertainBefore.attemptRef, effectGeneration: uncertainBefore.effectGeneration,
        financialState: 'outcome_unknown',
      })
      // Concurrent repeats retain the same durable classification and original work generations.
      await Promise.all([invokeWork(target, 'beginCallRecovery'), invokeWork(target, 'beginCallRecovery')])
      expect(await invokeWork(target, 'readCalls')).toEqual(recovered)
      console.log('Restore proof: missing Call completion recovery passed; inspect restored runner')
      const failedRunners = async (minimum: number) => {
        const deadline = Date.now() + 30_000
        do {
          const runnerHistory = await command(target, ['run', '--inline-query',
            'return (await ctx.db.system.query("_scheduled_functions").take(101)).filter(job => job.state.kind === "failed").map(job => ({ name: job.name, state: job.state }))',
            '--component', 'workpool/batchWorker'])
          const failures = JSON.parse(runnerHistory.stdout) as Array<{ name: string; state: { error: string } }>
          if (failures.length >= minimum) return failures
          await new Promise(done => setTimeout(done, 200))
        } while (Date.now() < deadline)
        throw new Error('restore_proof_expected_handle_failure_missing')
      }
      await command(target, ['run', 'kick:forceKick', '{}', '--component', 'workpool'])
      await failedRunners(1)
      await command(target, ['run', 'kick:forceKick', '{}', '--component', 'workpool'])
      // Keep the unsupported original-handle resume failure visible. The supported
      // operation below retires old jobs; it does not claim their handles resumed.
      const runnerFailures = await failedRunners(2)
      expect(runnerFailures.every(job => job.state.error.includes('Function handle not found'))).toBe(true)
      type QueuedProof = { workId: string; state: string; count: number; completions: number; callbackWorkId: string | null }
      expect(await invokeWork<QueuedProof>(target, 'readQueued')).toEqual({
        workId: queued.workId, state: 'pending', count: 0, completions: 0, callbackWorkId: null,
      })
      expect(await invokeWork(target, 'readCalls')).toEqual(recovered)

      // Restore the unclassified baseline again to exercise the operator path before
      // any automatic failure classifier could infer no effect from an old snapshot.
      // Stop the first experiment's monitor before replacing its durable state.
      await command(target, ['run', 'lib:stop', '{"name":"main"}', '--component', 'workpool/batchWorker'])
      await command(target, ['import', workBaseline, '--replace', '--yes'])
      await command(target, ['run', 'lib:stop', '{"name":"main"}', '--component', 'workpool/batchWorker'])
      // Installed Workpool retains this maintenance forwarder, which only pings
      // current runner handles. A stopped BatchWorker remains stopped after ping.
      await command(target, ['run', 'loop:updateRunStatus', '{}', '--component', 'workpool'])
      const admission = await command(target, ['run', 'workloadCron:admit', '{"name":"reconcile due facilitator invocations"}'])
      const workload: unknown = JSON.parse(admission.stdout)
      const quarantine = async (rows: CallProof['states']) => {
        const { stdout } = await command(target, ['run', 'capabilityCalls:quarantineRestoredDispatches', JSON.stringify({
          workload, dispatches: rows.map(row => ({ callRef: row.callRef, expectedWorkId: row.workId })),
        })])
        return JSON.parse(stdout)
      }
      const prefix = sourceCalls.states.slice(0, 25)
      expect(await quarantine(prefix)).toEqual({ kind: 'accepted', quarantined: 25, replayed: 0 })
      const repeat = await Promise.all([quarantine(prefix), quarantine(prefix)])
      expect(repeat).toEqual(Array.from({ length: 2 }, () => ({ kind: 'accepted', quarantined: 0, replayed: 25 })))
      expect(await quarantine(sourceCalls.states.slice(25))).toEqual({ kind: 'accepted', quarantined: 3, replayed: 0 })
      await command(target, ['run', 'lib:cancel', JSON.stringify({ id: queued.workId }), '--component', 'workpool'])
      await command(target, ['run', 'lib:start', '{"name":"main"}', '--component', 'workpool/batchWorker'])
      const retired = await pollWork<CallProof>('readCalls', value => value.states.every(row => row.workState === 'finished'))
      expect(retired).toMatchObject({ fixtureDigest: calls.fixtureDigest, identitiesPreserved: true,
        activePending: 0, executions: sourceCalls.executions })
      expect(retired.states.every(row => row.state === 'reconciliation_required' && row.resultKind === 'reconciliation_required'
        && row.reservationRefsPreserved && row.reconciliation?.disposition === 'manual_review'
        && row.reconciliation.reason === 'unknown_settlement')).toBe(true)
      for (const row of sourceCalls.states) {
        expect(retired.states.find(item => item.callRef === row.callRef)).toMatchObject({
          workId: row.workId, attemptRef: row.attemptRef, effectGeneration: row.effectGeneration,
          financialState: row.financialState === 'reserved' ? 'outcome_unknown' : row.financialState,
        })
      }
      const oldQueued = await pollWork<QueuedProof>('readQueued', value => value.state === 'finished')
      expect(oldQueued).toEqual({ workId: queued.workId, state: 'finished', count: 0, completions: 0, callbackWorkId: null })
      expect(await invokeWork(target, 'beginCallRecovery')).toMatchObject({ scanned: 0, recovered: 0, isDone: true })
      for (const attempt of [0, 5]) {
        const expiry = await command(target, ['run', 'moneyX402Expiry:schedule', JSON.stringify({
          callRef: retired.states[0]!.callRef, attempt, runAt: Date.now(),
        })])
        expect(JSON.parse(expiry.stdout)).toBe(false)
      }
      expect(await invokeWork(target, 'readCalls')).toEqual(retired)
      const fresh = await invokeWork<{ workId: string }>(target, 'enqueueFreshProbe', { retiredWorkId: queued.workId })
      expect(fresh.workId).not.toBe(queued.workId)
      await command(target, ['run', 'kick:forceKick', '{}', '--component', 'workpool'])
      await command(target, ['run', 'kick:forceKick', '{}', '--component', 'workpool'])
      const resumed = await pollWork<QueuedProof>('readQueued', value => value.state === 'finished' && value.completions > 0)
      expect(resumed).toEqual({ workId: fresh.workId, state: 'finished', count: 1, completions: 1, callbackWorkId: fresh.workId })
      expect(await invokeWork(target, 'readCalls')).toEqual(retired)
      summary = { scope: match.scope, counts: match.counts, digests: match.digests,
        scheduledNamespaces: namespaces.length, sourceJobs, targetJobs, schedulerRecovery: 'not_restored',
        falsifiers: 6, backendVersion, workRecovery: { originalHandleResume: 'unsupported', runnerFailures: runnerFailures.length,
          retiredCalls: retired.states.length, oldCallEffects: retired.executions - sourceCalls.executions,
          retiredProbeEffects: oldQueued.count, freshProbeEffects: resumed.count, freshProbeCompletions: resumed.completions,
          forceKicks: 4, strandedCallsRecovered: 3,
          fixtureDigest: calls.fixtureDigest, sourceStoppedBeforeResume: true, externalEffectsProven: false } }
    } catch (error) {
      failures.push(error)
    } finally {
      const stopped = await Promise.allSettled(stopBackends.map((stop) => stop()))
      const cleanup = await Promise.allSettled([terminateIsolatedProcesses(source), terminateIsolatedProcesses(target)])
      for (const result of [...stopped, ...cleanup]) if (result.status === 'rejected') failures.push(result.reason)
      if (cleanup.every((result) => result.status === 'fulfilled')) {
        try { rmSync(root, { recursive: true, force: true }) }
        catch (error) { failures.push(error) }
      }
    }
    if (failures.length > 0) throw new AggregateError(failures, 'restore_proof_failed')
    console.log(JSON.stringify(summary))
  }, 900_000)
})

/** A stale application archive must not rewind the independently surviving ledger.
 * Requires source/target effect writers stopped and drained before reconciliation.
 * Ensures original accounting evidence is recovered with zero native money writes;
 * missing/conflicting evidence preserves the hold. This does not prove chain settlement,
 * delivery, later remedies or complete application restore.
 */
describe.skipIf(process.env.AE_CONVEX_RESTORE_INTEGRATION !== 'true'
  || process.env.AE_FORMANCE_INTEGRATION !== 'true')('native financial recovery after Convex restore', () => {
  it.each([{ unbound: false, refund: false, release: false }, { unbound: true, refund: false, release: false },
    { unbound: false, refund: true, release: false }, { unbound: false, refund: false, release: true }])(
    'repairs post-snapshot accounting with the complete native ledger unchanged (unbound=$unbound, refund=$refund, release=$release)', async ({ unbound, refund, release }) => {
    type Record = { call: Doc<'capabilityCalls'>; quote: Doc<'capabilityQuotes'>;
      booking: FormanceManagedCallBooking; obligation: Doc<'moneyProviderObligations'> | null;
      grants: Doc<'moneyPromotionalGrants'>[]; workState: string }
    const root = mkdtempSync(join(tmpdir(), 'ae-convex-money-restore-'))
    const source = join(root, 'source'), target = join(root, 'target')
    const allocated = await ports(5)
    const suffix = randomUUID().replaceAll('-', '').slice(0, 12)
    const project = `ae-convex-money-${suffix}`
    const configuration = { environment: 'sandbox' as const, ledger: `ae-convex-money-${suffix}`,
      gatewayUrl: `http://127.0.0.1:${allocated[4]}`, requestTimeoutMs: 10_000 }
    const context = createFormanceContext(configuration)
    const docker = async (args: string[]) => (await runFile('docker', ['compose', '--project-name', project,
      '-f', resolve('tests/config/native-money/compose.yml'), ...args], { timeout: 120_000,
      env: { ...process.env, AE_NATIVE_MONEY_PORT: String(allocated[4]) }, maxBuffer: 4 * 1024 * 1024 })).stdout
    const command = async (directory: string, args: string[]) => runConvexCommand({ sourceRoot, isolatedRoot: directory,
      args, retainBackendOnSuccess: ['run', 'data', 'export', 'import'].includes(args[0] ?? '') })
    const invoke = async <T>(directory: string, name: string, args: object = {}): Promise<T> => {
      const { stdout } = await command(directory, ['run', name, JSON.stringify(args)])
      return (stdout.trim() === '' ? null : JSON.parse(stdout)) as T
    }
    const inspect = async (directory: string): Promise<Record[]> => JSON.parse(
      await invoke<string>(directory, 'financialRestoreProof:inspect')) as Record[]
    const snapshot = async () => {
      const value = await readFormanceRestoreSnapshot(configuration)
      if (value.kind !== 'available') throw new Error(value.code)
      return value.snapshot.summary
    }
    const stops: Array<() => Promise<void>> = [], failures: unknown[] = []
    let summary: object | undefined
    try {
      console.log('Financial restore: start isolated native ledger and two Convex deployments')
      await docker(['up', '--detach', '--wait', '--wait-timeout', '90'])
      const deadline = Date.now() + 30_000
      let healthy = false
      while (!healthy && Date.now() < deadline) {
        try {
          const response = await context.sdk.getVersions({ retries: { strategy: 'none' }, timeoutMs: 2_000 })
          healthy = response.getVersionsResponse?.versions.some(v => v.name === 'ledger' && v.version === 'v2.4.14' && v.health) === true
        } catch { /* Startup only: retry bounded native readiness before any booking. */ }
        if (!healthy) await new Promise(done => setTimeout(done, 250))
      }
      expect(healthy).toBe(true)
      expect(await installPackage4FormanceSchema(context)).toMatchObject({ kind: 'completed' })
      expect(await readFormanceHealth(context)).toMatchObject({ kind: 'ready' })
      for (const [index, directory] of [source, target].entries()) {
        mkdirSync(directory); installFixture(directory)
        await command(directory, ['dev', '--once', '--skip-push', '--local-cloud-port', String(allocated[index * 2]),
          '--local-site-port', String(allocated[index * 2 + 1]), '--local-backend-version', backendVersion])
        for (const [name, value] of Object.entries({ AE_DEPLOYMENT_ENVIRONMENT: 'development',
          CLERK_JWT_ISSUER_DOMAIN: 'https://release-proof.invalid', AE_FORMANCE_ENVIRONMENT: 'sandbox',
          AE_FORMANCE_GATEWAY_URL: configuration.gatewayUrl, AE_FORMANCE_LEDGER: configuration.ledger })) {
          await command(directory, ['env', 'set', name, value])
        }
        stops.push(await startConvexDev({ sourceRoot, isolatedRoot: directory, backendVersion }))
      }
      const now = Date.now(), digest = canonicalDigest({ proof: 'financial-restore' })
      await invoke(source, 'financialRestoreProof:seed', { toolJson: JSON.stringify(buildDevelopmentPublishedToolEvidence().tool),
        now, unbound, ...(refund ? { reportOwner: true } : {}), ...(release ? { release: true } : {}) })
      const seeded = await inspect(source)
      expect(seeded).toHaveLength(4)
      const first = seeded[0]!.booking
      expect(await bookFormanceFundingSettlement(context, { commandRef: 'funding:restore', idempotencyKey: 'funding:restore',
        accountRef: first.accountRef, processorRef: 'processor:restore', principalUnits: '1000000', serviceFeeUnits: '1',
        taxUnits: '1', totalUnits: '1000002', policyDigest: digest, externalEvidenceDigest: digest })).toMatchObject({ kind: 'completed' })
      for (const periodKind of ['day', 'month'] as const) {
        const period = periodKind === 'day' ? first.spendingPeriods!.daily : first.spendingPeriods!.monthly
        expect(await adjustFormanceSpendingPeriod(context, { principalRef: first.principalRef, periodKind,
          ...period, previousLimitUnits: '0', targetLimitUnits: period.limitUnits, authorityDigest: digest })).toMatchObject({ kind: 'completed' })
      }
      expect(await syncFormanceCapacity(context, { commandRef: 'capacity:restore', idempotencyKey: 'capacity:restore',
        kind: 'legal_customer_exposure', subjectRef: first.legalCustomerRef, generation: 1, targetUnits: '10000000',
        policyDigest: digest, externalEvidenceDigest: digest })).toMatchObject({ kind: 'completed' })
      const identity = { environment: 'sandbox' as const, custodyRef: first.treasuryRef, custodyGeneration: 1,
        network: 'eip155:84532', asset: '0x036cbd53842c5426634e7929541ec2318f3dcf7e',
        address: `0x${'2'.repeat(40)}`, bufferTargetUnits: '1000000' }
      expect(await bookFormanceTreasuryBatch(context, identity, { batchRef: digest, custodyRef: first.treasuryRef,
        custodyGeneration: 1, previousCheckpoint: null, previousBufferUnits: '0', bufferIncreaseUnits: '1000000',
        observation: { kind: 'observed', environment: 'sandbox', network: identity.network, asset: identity.asset,
          address: identity.address, fromBlock: '100', checkpoint: { blockNumber: '100', blockHash: `0x${'4'.repeat(64)}`,
            balanceUnits: '10000000' }, blockTimestamp: now, transfers: [], caughtUp: true, observedAt: now },
        state: { kind: 'pending' }, createdAt: now })).toMatchObject({ kind: 'completed' })
      for (const { booking } of seeded) {
        for (const grant of booking.promotionalCreditAllocation!.grants) {
          const prepared = prepareFormancePromotionalCreditGrant({ ...grant, accountRef: booking.accountRef, commandDigest: digest })
          if (prepared.kind !== 'prepared') throw new Error(prepared.code)
          expect(await executeFormanceMoneyCommand(context, prepared.command)).toMatchObject({ kind: 'completed' })
        }
        if (!unbound) {
          const reservation = await reserveFormanceManagedCall(context, booking)
          if (reservation.kind !== 'completed') throw new Error(JSON.stringify(reservation))
          expect(await invoke(source, 'moneyManagedCall:attachReservation', { callRef: booking.callRef,
            transactionRefs: reservation.transactionRefs })).toEqual({ kind: 'attached', replayed: false })
        }
      }
      const originalIds = async (refs: readonly string[]) => {
        const ids = []
        for (const ref of refs) {
          const transaction = await readFormanceTransactionByReference(context, ref)
          if (transaction.kind !== 'found') throw new Error('proof_native_transaction_missing')
          ids.push(transaction.transactionId)
        }
        return ids
      }
      if (refund) {
        type ReportRecord = Omit<Record, 'workState'> & {
          report: Doc<'paidCallReports'> | null; grants: Doc<'moneyPromotionalGrants'>[];
          resolution: Doc<'purchaseResolutionRecords'>; projection: Doc<'capabilityCallProjections'>;
          marketFacts: Doc<'marketEvidenceFacts'>[]
        }
        const inspectReports = async (directory: string): Promise<ReportRecord[]> => JSON.parse(
          await invoke<string>(directory, 'financialRestoreProof:inspectReports')) as ReportRecord[]
        const settlements = []
        for (const { booking } of seeded) {
          const result = await settleFormanceManagedCall(context, { booking,
            externalEvidenceDigest: canonicalDigest({ effect: booking.callRef }) })
          if (result.kind !== 'completed') throw new Error(JSON.stringify(result))
          settlements.push({ callRef: booking.callRef, transactionRefs: [...result.transactionRefs] })
        }
        await invoke(source, 'financialRestoreProof:completeSales', { settlements, now: Date.now() })
        const identity = { subject: 'user_financial_restore', issuer: 'https://release-proof.invalid', exp: Math.floor(now / 1_000) + 86_400,
          tokenIdentifier: 'https://release-proof.invalid|user_financial_restore' }
        for (const label of ['paid', 'promo', 'conflict']) {
          const callRef = `call:financial-restore:${label}`
          const response = await command(source, ['run', 'financialRestoreProof:admitReport', JSON.stringify({ callRef }),
            '--identity', JSON.stringify(identity)])
          expect(JSON.parse(JSON.parse(response.stdout))).toMatchObject({ kind: 'pending', callRef })
        }
        const archived = await inspectReports(source)
        expect(archived.filter(row => row.report?.state === 'pending')).toHaveLength(3)
        expect(archived.every(row => row.call.state === 'completed' && row.resolution.terminalState === 'completed'
          && row.obligation?.state === 'settled' && row.call.usage?.chargeState === 'paid'
          && row.grants.length === 1 && row.grants.every(grant => grant.availableUnits === '0'))).toBe(true)
        expect(archived.filter(row => row.report !== null).every(row => row.marketFacts.length === 1)).toBe(true)
        const archive = join(root, 'before-refund.zip')
        await command(source, ['export', '--include-file-storage', '--path', archive])
        await stops[0]!()
        console.log('Refund restore: source stopped; post original approved refunds on surviving native ledger')
        const native = new Map<string, { refs: readonly string[]; ids: string[] }>()
        for (const { report } of archived) {
          if (report === null) continue
          const result = await refundFormanceSettledSale(context, { booking: report.booking,
            originalSettlementRefs: report.originalSettlementRefs, reportDigest: report.reportDigest })
          if (result.kind !== 'completed') throw new Error(JSON.stringify(result))
          const ids = await originalIds(result.transactionRefs)
          native.set(report.callRef, { refs: result.transactionRefs, ids })
          if (report.callRef.endsWith(':conflict')) {
            await context.sdk.ledger.v2.addMetadataOnTransaction({ ledger: configuration.ledger, id: BigInt(ids[0]!),
              requestBody: { command_digest: '0'.repeat(64) }, idempotencyKey: 'proof:conflicting-refund-evidence', schemaVersion: 'v1.5.0' })
          }
        }
        const ledgerBaseline = await snapshot()
        await command(target, ['import', archive, '--replace', '--yes'])
        expect(await inspectReports(target)).toEqual(archived)
        const process = (callRef: string) => invoke<boolean>(target, 'capabilityCallReports:process', { callRef })
        for (const before of archived) {
          const positive = before.call.callRef.endsWith(':paid') || before.call.callRef.endsWith(':promo')
          expect(await Promise.all([process(before.call.callRef), process(before.call.callRef)]))
            .toEqual(before.call.callRef.endsWith(':conflict') ? [false, false] : [true, true])
          const after = (await inspectReports(target)).find(row => row.call.callRef === before.call.callRef)!
          expect(await snapshot()).toEqual(ledgerBaseline)
          if (!positive) {
            expect(after).toEqual({ ...before, report: before.report === null ? null : {
              ...before.report, nextWorkAt: after.report!.state === 'pending' ? after.report!.nextWorkAt : undefined,
              updatedAt: after.report!.updatedAt } })
            continue
          }
          const original = native.get(before.call.callRef)!
          expect(before.call.result?.kind).toBe('completed')
          if (before.call.result?.kind !== 'completed' || after.call.result?.kind !== 'completed') throw new Error('proof_delivery_missing')
          const originalReceipt = before.call.result.receipt
          expect(after.call.result).toEqual({ ...before.call.result, usage: after.call.result.usage,
            receipt: { ...originalReceipt, state: 'refunded', refundState: 'released', transactionRef: original.refs[0],
              accountingTransactionRefs: [...before.report!.originalSettlementRefs, ...original.refs] } })
          expect(after.call.usage).toEqual({ ...before.call.usage, chargeState: 'refunded',
            transactionRef: original.refs[0], observedAt: after.call.usage!.observedAt })
          expect(after.call.result.usage).toEqual(after.call.usage)
          expect(after.call).toEqual({ ...before.call, result: after.call.result, usage: after.call.usage,
            formanceFinancialState: 'released', formanceReleaseRefs: original.refs, updatedAt: after.call.updatedAt })
          if (before.report?.state !== 'pending' || after.report?.state !== 'posted') throw new Error('proof_report_transition_missing')
          const { nextWorkAt, ...originalReport } = before.report
          expect(nextWorkAt).toBeLessThanOrEqual(after.report.postedAt)
          expect(after.report).toEqual({ ...originalReport, state: 'posted',
            buyerRefundTransactionRef: original.refs[0], transactionRefs: original.refs,
            postedAt: after.report.postedAt, updatedAt: after.report.updatedAt })
          expect(after.report.originalResolution.recordDigest).toBe(before.resolution.recordDigest)
          expect(after.resolution).toEqual({ ...before.resolution, terminalState: 'refunded', paymentState: 'released',
            resolutionRef: after.resolution.resolutionRef, recordDigest: after.resolution.recordDigest,
            resolvedAt: after.resolution.resolvedAt })
          expect(after.projection).toMatchObject({ state: 'completed', deliveryState: 'delivered', paymentState: 'released' })
          expect(after.grants).toEqual(before.grants.map(grant => ({ ...grant, availableUnits: grant.amountUnits,
            updatedAt: after.grants.find(row => row.grantRef === grant.grantRef)!.updatedAt })))
          expect(after.quote).toEqual(before.quote)
          expect(after.obligation).toEqual(before.obligation)
          expect(after.marketFacts).toEqual(before.marketFacts)
        }
        const recovered = await inspectReports(target)
        for (const row of recovered.filter(value => value.report?.state === 'posted')) {
          expect(await Promise.all([process(row.call.callRef), process(row.call.callRef)])).toEqual([true, true])
          expect(await refundFormanceSettledSale(context, { booking: row.report!.booking,
            originalSettlementRefs: row.report!.originalSettlementRefs, reportDigest: row.report!.reportDigest }))
            .toMatchObject({ kind: 'completed', replayed: true, transactionRefs: native.get(row.call.callRef)!.refs })
        }
        expect(await inspectReports(target)).toEqual(recovered)
        expect(await snapshot()).toEqual(ledgerBaseline)
        for (const { refs, ids } of native.values()) for (const [index, ref] of refs.entries()) {
          expect(await readFormanceTransactionByReference(context, ref)).toMatchObject({ kind: 'found', transactionId: ids[index] })
        }
        summary = { evidenceClass: 'native-convex-approved-refund-restore', verification: 'PASS', recovered: 2,
          conflictingRefundRefused: 1, missingReportUnchanged: 1, originalTransactionIdsPreserved: true,
          nativeWritesDuringRecovery: 0, ledger: ledgerBaseline, sourceStopped: true, approvalHistoryLossRecovered: false }
      } else {
        await invoke(source, 'workloadCron:ensurePlatformWorkloadIdentities')
        await command(source, ['run', 'lib:stop', '{"name":"main"}', '--component', 'workpool/batchWorker'])
        const archived = await inspect(source)
        const archive = join(root, release ? 'before-release.zip' : 'before-settlement.zip')
        await command(source, ['export', '--include-file-storage', '--path', archive])
        await stops[0]!()
        console.log(`Financial restore: source stopped; create post-snapshot native ${release ? 'releases' : 'settlements'}`)
        const native = new Map<string, { refs: readonly string[]; ids: string[] }>()
        const reservations = new Map<string, { refs: readonly string[]; ids: string[] }>()
        for (const { booking } of seeded.filter(row => !row.call.callRef.endsWith(':missing'))) {
          if (unbound) {
            const reservation = await reserveFormanceManagedCall(context, booking)
            if (reservation.kind !== 'completed') throw new Error(JSON.stringify(reservation))
            const ids = await originalIds(reservation.transactionRefs)
            reservations.set(booking.callRef, { refs: reservation.transactionRefs, ids })
            if (booking.callRef.endsWith(':conflict')) {
              await context.sdk.ledger.v2.addMetadataOnTransaction({ ledger: configuration.ledger, id: BigInt(ids[2]!),
                requestBody: { command_digest: '0'.repeat(64) }, idempotencyKey: 'proof:conflicting-reservation-evidence', schemaVersion: 'v1.5.0' })
              continue
            }
          }
          const evidence = { booking, externalEvidenceDigest: canonicalDigest({ effect: booking.callRef }) }
          const settlement = release
            ? await releaseFormanceManagedCall(context, { ...evidence, submissionProvenAbsent: true })
            : await settleFormanceManagedCall(context, evidence)
          if (settlement.kind !== 'completed') throw new Error(JSON.stringify(settlement))
          const ids = await originalIds(settlement.transactionRefs)
          native.set(booking.callRef, { refs: settlement.transactionRefs, ids })
          if (booking.callRef.endsWith(':conflict')) {
            await context.sdk.ledger.v2.addMetadataOnTransaction({ ledger: configuration.ledger, id: BigInt(ids[1]!),
                requestBody: { command_digest: '0'.repeat(64) }, idempotencyKey: 'proof:conflicting-provider-evidence', schemaVersion: 'v1.5.0' })
          }
        }
        const ledgerBaseline = await snapshot()
        await command(target, ['import', archive, '--replace', '--yes'])
        expect(await inspect(target)).toEqual(archived)
        await command(target, ['run', 'lib:stop', '{"name":"main"}', '--component', 'workpool/batchWorker'])
        await command(target, ['run', 'loop:updateRunStatus', '{}', '--component', 'workpool'])
        let held = await inspect(target)
        if (unbound) {
          expect(held.every(row => row.workState === 'absent' && row.obligation === null
            && row.call.formanceReservationRefs === undefined && row.call.formanceReservationDigest === undefined)).toBe(true)
          const repair = (callRef: string) => invoke(target, 'moneyManagedCallLifecycle:reconcileReservation', { callRef, now: Date.now() })
          for (const before of held) {
            const positive = before.call.callRef.endsWith(':paid') || before.call.callRef.endsWith(':promo')
            const results = await Promise.all([repair(before.call.callRef), repair(before.call.callRef)])
            if (positive) {
              expect(results).toContainEqual({ kind: 'accepted', state: 'outcome_unknown', replayed: false })
              expect(results).toContainEqual({ kind: 'accepted', state: 'outcome_unknown', replayed: true })
            } else expect(results).toEqual(Array.from({ length: 2 }, () => ({ kind: 'refused', code: 'formance_reservation_evidence_invalid' })))
            expect(await snapshot()).toEqual(ledgerBaseline)
          }
          const repaired = await inspect(target)
          for (const row of repaired) {
            const before = held.find(value => value.call.callRef === row.call.callRef)!
            const original = reservations.get(row.call.callRef)
            const positive = row.call.callRef.endsWith(':paid') || row.call.callRef.endsWith(':promo')
            if (!positive) { expect(row).toEqual(before); continue }
            expect(row).toEqual({ ...before, call: { ...before.call,
              formanceReservationRefs: original!.refs, formanceReservationDigest: canonicalDigest({
                format: 'ae.formance-managed-call-reservation:v1', callRef: row.call.callRef, transactionRefs: original!.refs }),
              formanceFinancialState: 'outcome_unknown', state: 'reconciliation_required', dispatchState: 'reconciliation_required',
              result: row.call.result, reconciliation: row.call.reconciliation, updatedAt: row.call.updatedAt }, obligation: row.obligation })
            expect(row.call.result).toMatchObject({ kind: 'reconciliation_required', callRef: row.call.callRef, evidence: { retry: 'reconcile_before_retry' } })
            expect(row.call.reconciliation).toMatchObject({ disposition: 'manual_review', reason: 'unknown_settlement' })
            expect(row.obligation).toMatchObject({ obligationRef: `provider-obligation:${row.call.callRef}`, callRef: row.call.callRef,
              toolRef: row.booking.toolRef, providerRef: row.booking.providerRef, buyerAccountRef: row.booking.accountRef,
              buyerAmountUnits: row.booking.buyerAmountUnits, providerAmountUnits: row.booking.providerAmountUnits,
              buyerAsset: 'AUD', buyerExponent: 6, providerAsset: 'USDC', providerExponent: 6,
              state: 'held', settlementMethod: 'managed_x402', payoutEligibility: 'ineligible_x402',
              evidenceRefs: [row.booking.quoteRef, ...original!.refs] })
            expect(await repair(row.call.callRef)).toEqual({ kind: 'accepted', state: 'outcome_unknown', replayed: true })
          }
          expect(await inspect(target)).toEqual(repaired)
          held = repaired
        } else {
          const workload = await invoke(target, 'workloadCron:admit', { name: 'reconcile due facilitator invocations' })
          expect(await invoke(target, 'capabilityCalls:quarantineRestoredDispatches', { workload,
            dispatches: archived.map(({ call }) => ({ callRef: call.callRef, expectedWorkId: call.workId })) }))
            .toEqual({ kind: 'accepted', quarantined: 4, replayed: 0 })
          await command(target, ['run', 'lib:start', '{"name":"main"}', '--component', 'workpool/batchWorker'])
          const retireDeadline = Date.now() + 60_000
          while (held.some(row => row.workState !== 'finished') && Date.now() < retireDeadline) {
            await new Promise(done => setTimeout(done, 500)); held = await inspect(target)
          }
          expect(held.every(row => row.workState === 'finished')).toBe(true)
          expect(held.every(row => row.call.formanceFinancialState === 'outcome_unknown'
            && row.call.reconciliation?.disposition === 'manual_review')).toBe(true)
        }
        const recover = (callRef: string) => invoke(target,
          release ? 'moneyManagedCallLifecycle:reconcileRelease' : 'moneyManagedCallLifecycle:reconcileSettlement', { callRef, now: Date.now() })
        for (const row of held) {
          const positive = row.call.callRef.endsWith(':paid') || row.call.callRef.endsWith(':promo')
          const refusal = { kind: 'refused', code: unbound ? 'managed_call_state_conflict'
            : release ? 'formance_release_evidence_invalid' : 'formance_settled_sale_evidence_invalid' }
          if (release) {
            const results = await Promise.all([recover(row.call.callRef), recover(row.call.callRef)])
            if (positive) {
              expect(results).toContainEqual({ kind: 'accepted', state: 'released', replayed: false })
              expect(results).toContainEqual({ kind: 'accepted', state: 'released', replayed: true })
            } else expect(results).toEqual([refusal, refusal])
          } else expect(await recover(row.call.callRef)).toMatchObject(positive
            ? { kind: 'accepted', state: 'settled', replayed: false } : refusal)
          expect(await snapshot()).toEqual(ledgerBaseline)
        }
        const recovered = await inspect(target)
        for (const row of recovered) {
          const before = held.find(value => value.call.callRef === row.call.callRef)!
          const expected = native.get(row.call.callRef)
          if (row.call.callRef.endsWith(':paid') || row.call.callRef.endsWith(':promo')) {
            if (release) {
              expect(before.grants).toHaveLength(1)
              expect(row).toEqual({ ...before,
                call: { ...before.call, formanceFinancialState: 'released', formanceReleaseRefs: expected!.refs,
                  updatedAt: row.call.updatedAt },
                obligation: { ...before.obligation, state: 'reversed', updatedAt: row.obligation!.updatedAt },
                grants: before.grants.map(grant => ({ ...grant, availableUnits: grant.amountUnits,
                  updatedAt: row.grants.find(value => value.grantRef === grant.grantRef)!.updatedAt })),
              })
              expect(row.call.reconciliation).toMatchObject({ disposition: 'manual_review', reason: 'unknown_settlement' })
              expect(row.call.result?.kind).toBe('reconciliation_required')
              expect(await invoke(target, 'capabilityCalls:readRecovery', {
                callRef: row.call.callRef, principalId: row.call.principalId,
              })).toMatchObject({ requiresManualSettlementReview: true, result: row.call.result })
              expect(await invoke(target, 'moneyManagedCallLifecycle:releaseBeforeSubmission', {
                callRef: row.call.callRef, now: Date.now(),
              })).toEqual({ kind: 'refused', code: 'call_manual_settlement_review_required' })
            } else expect(row).toEqual({ ...before, call: { ...before.call, formanceFinancialState: 'settled',
              formanceSettlementRefs: expected!.refs, buyerSaleTransactionRef: expected!.refs[0], updatedAt: row.call.updatedAt },
            obligation: { ...before.obligation, state: 'settled', settlementTransactionRef: expected!.refs[1],
              evidenceRefs: [...new Set([...before.obligation!.evidenceRefs, ...expected!.refs])],
              settledAt: row.obligation!.settledAt, updatedAt: row.obligation!.updatedAt } })
            expect(await Promise.all([recover(row.call.callRef), recover(row.call.callRef)]))
              .toEqual(Array.from({ length: 2 }, () => ({ kind: 'accepted', state: release ? 'released' : 'settled', replayed: true })))
          } else expect(row).toEqual(before)
        }
        expect(await inspect(target)).toEqual(recovered)
        expect(await snapshot()).toEqual(ledgerBaseline)
        for (const { refs, ids } of [...native.values(), ...reservations.values()]) for (const [index, ref] of refs.entries()) {
          expect(await readFormanceTransactionByReference(context, ref)).toMatchObject({ kind: 'found', transactionId: ids[index] })
        }
        summary = { evidenceClass: release ? 'native-convex-unpaid-release-restore' : 'native-convex-financial-restore', verification: 'PASS', recovered: 2,
          reservationsRepaired: unbound ? 2 : 0, refused: 2, manualHoldsPreserved: unbound ? 2 : 4,
          nativeWritesDuringRecovery: 0, ledger: ledgerBaseline,
          originalTransactionIdsPreserved: true, sourceStopped: true, chainOrDeliveryProven: false }
      }
    } catch (error) { failures.push(error) }
    finally {
      const stopped = await Promise.allSettled(stops.map(stop => stop()))
      const cleaned = await Promise.allSettled([terminateIsolatedProcesses(source), terminateIsolatedProcesses(target)])
      for (const result of [...stopped, ...cleaned]) if (result.status === 'rejected') failures.push(result.reason)
      try {
        await docker(['down', '--volumes', '--remove-orphans', '--timeout', '10'])
        expect((await docker(['ps', '--all', '--quiet'])).trim()).toBe('')
      } catch (error) { failures.push(error) }
      if (cleaned.every(result => result.status === 'fulfilled')) rmSync(root, { recursive: true, force: true })
    }
    if (failures.length > 0) throw new AggregateError(failures, 'financial_restore_proof_failed')
    console.log(JSON.stringify(summary))
  }, 900_000)
})
