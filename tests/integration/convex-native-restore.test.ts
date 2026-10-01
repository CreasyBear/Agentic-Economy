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
import { createSourceWriteAdmission, sourceWriteCommandBodyDigest, sourceWriteCommandDigest } from '@/modules/security/source-write-admission'
import type { AdminCommandReceipt } from '@/lib/operator/admin-console/contracts'
import { createFormanceContext, executeFormanceMoneyCommand, installPackage4FormanceSchema,
  readFormanceHealth, readFormanceTransactionByReference } from '@/modules/money/formance'
import { adjustFormanceSpendingPeriod, bookFormanceFundingSettlement, prepareFormancePromotionalCreditGrant,
  prepareFormancePromotionalCreditExpiry,
  refundFormanceSettledSale, releaseFormanceManagedCall, reserveFormanceManagedCall, settleFormanceManagedCall, syncFormanceCapacity,
  type FormanceManagedCallBooking } from '@/modules/money/formance-workflows'
import { bookFormanceTreasuryBatch, readFormanceTreasuryBalances } from '@/modules/money/formance-treasury'
import type { TreasuryChainObservation, TreasuryProgress } from '@/modules/money/treasury'
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
  writeFileSync(join(convex, 'treasuryRestoreProof.ts'), readFileSync(resolve('tests/fixtures/convex-treasury-restore-proof.ts'), 'utf8')
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


/** Requires original admin intent and a surviving ledger; synthetic identity/MFA
 * only. Ensures native archive replay cannot issue credit twice or manufacture
 * missing approval. Expiry resumes its frozen revision. No chain delivery claim. */
describe.skipIf(process.env.AE_CONVEX_RESTORE_INTEGRATION !== 'true'
  || process.env.AE_FORMANCE_INTEGRATION !== 'true')('native promotional recovery after Convex restore', () => {
  it('recovers approved grants and frozen expiry once, refusing missing authority and conflicting postings', async () => {
    type Evidence = { grants: Doc<'moneyPromotionalGrants'>[]; operations: Doc<'operationKeys'>[]; audits: Doc<'auditEvents'>[] }
    type Work = { kind: 'grant' | 'expiry'; grantRef: string; accountRef: string; environment: 'sandbox';
      amountUnits: string; expiresAt: number; commandDigest: string; revision: number }
    const root = mkdtempSync(join(tmpdir(), 'ae-convex-promo-restore-'))
    const source = join(root, 'source'), target = join(root, 'target')
    const allocated = await ports(5), suffix = randomUUID().replaceAll('-', '').slice(0, 12)
    const project = `ae-convex-promo-${suffix}`, secret = randomUUID() + randomUUID()
    const configuration = { environment: 'sandbox' as const, ledger: project,
      gatewayUrl: `http://127.0.0.1:${allocated[4]}`, requestTimeoutMs: 10_000 }
    const context = createFormanceContext(configuration)
    const docker = async (args: string[]) => (await runFile('docker', ['compose', '--project-name', project,
      '-f', resolve('tests/config/native-money/compose.yml'), ...args], { timeout: 120_000,
      env: { ...process.env, AE_NATIVE_MONEY_PORT: String(allocated[4]) }, maxBuffer: 4 * 1024 * 1024 })).stdout
    const command = (directory: string, args: string[]) => runConvexCommand({ sourceRoot, isolatedRoot: directory,
      args, retainBackendOnSuccess: ['run', 'data', 'export', 'import'].includes(args[0] ?? '') })
    const invoke = async <T>(directory: string, name: string, args: object = {}, identity?: object): Promise<T> => {
      const { stdout } = await command(directory, ['run', name, JSON.stringify(args),
        ...(identity === undefined ? [] : ['--identity', JSON.stringify(identity)])])
      return (stdout.trim() === '' ? null : JSON.parse(stdout)) as T
    }
    const inspect = async (directory: string): Promise<Evidence> => JSON.parse(
      await invoke<string>(directory, 'financialRestoreProof:inspectPromotional')) as Evidence
    const snapshot = async () => {
      const result = await readFormanceRestoreSnapshot(configuration)
      if (result.kind !== 'available') throw new Error(result.code)
      return result.snapshot.summary
    }
    const stops: Array<() => Promise<void>> = [], failures: unknown[] = []
    let summary: object | undefined
    try {
      console.log('Promotional restore: start isolated ledger and two Convex deployments')
      await docker(['up', '--detach', '--wait', '--wait-timeout', '90'])
      const deadline = Date.now() + 30_000
      let healthy = false
      while (!healthy && Date.now() < deadline) {
        try {
          const response = await context.sdk.getVersions({ retries: { strategy: 'none' }, timeoutMs: 2_000 })
          healthy = response.getVersionsResponse?.versions.some(v => v.name === 'ledger' && v.health) === true
        } catch { /* Bounded readiness only, before any financial write. */ }
        if (!healthy) await new Promise(done => setTimeout(done, 250))
      }
      expect(healthy).toBe(true)
      expect(await installPackage4FormanceSchema(context)).toMatchObject({ kind: 'completed' })
      expect(await readFormanceHealth(context)).toMatchObject({ kind: 'ready' })
      for (const [index, directory] of [source, target].entries()) {
        mkdirSync(directory); installFixture(directory)
        await command(directory, ['dev', '--once', '--skip-push', '--local-cloud-port', String(allocated[index * 2]),
          '--local-site-port', String(allocated[index * 2 + 1]), '--local-backend-version', backendVersion])
        // Admission immediately schedules processing. Leave source Formance absent
        // so the pending authority survives without an uncontrolled native write.
        const environment = { AE_DEPLOYMENT_ENVIRONMENT: 'development',
          CLERK_JWT_ISSUER_DOMAIN: 'https://release-proof.invalid', AE_SOURCE_WRITE_SECRET: secret,
          ...(index === 0 ? {} : { AE_FORMANCE_ENVIRONMENT: 'sandbox',
            AE_FORMANCE_GATEWAY_URL: configuration.gatewayUrl, AE_FORMANCE_LEDGER: configuration.ledger }) }
        for (const [name, value] of Object.entries(environment)) await command(directory, ['env', 'set', name, value])
        stops.push(await startConvexDev({ sourceRoot, isolatedRoot: directory, backendVersion }))
      }
      const accountRef = await invoke<string>(source, 'financialRestoreProof:seedPromotionalOwner')
      const identity = { subject: 'user_financial_restore', issuer: 'https://release-proof.invalid',
        exp: Math.floor(Date.now() / 1_000) + 86_400, tokenIdentifier: 'https://release-proof.invalid|user_financial_restore' }
      expect(await invoke(source, 'interactiveAuthority:materializeCurrentInteractiveAuthority', {}, identity)).toBeTruthy()
      const refs = new Map<string, string>()
      for (const label of ['valid', 'missing-authority', 'conflict']) {
        const input = { action: 'grant_promotional_credit' as const,
          input: { accountRef, environment: 'sandbox' as const, amountUnits: '10000000', expiresAt: Date.now() + 180_000 },
          reasonCode: 'onboarding' as const, evidenceRefs: ['evidence:disposable-promotional-restore'],
          operationKey: `restore:${label}`, correlationId: `restore:${label}`, approval: { kind: 'execute' as const },
          proof: { reverificationId: `test:mfa:${randomUUID()}`, firstFactorAgeMinutes: 0, secondFactorAgeMinutes: 0,
            subject: identity.subject, evidenceObservedAt: Date.now() } }
        const request = { method: 'POST', initiatorOrigin: 'https://release-proof.invalid', targetOrigin: 'https://release-proof.invalid',
          targetPath: '/__test/promotional-restore', targetQuery: '', bodyDigest: sourceWriteCommandBodyDigest(input) }
        const signed = { ...input, sourceWriteRequest: request, sourceWrite: await createSourceWriteAdmission({
          scope: 'admin_operator', operationKey: input.operationKey, correlationId: input.correlationId,
          commandDigest: sourceWriteCommandDigest(input), request, now: Date.now(), env: { AE_SOURCE_WRITE_SECRET: secret } }) }
        const receipt = await invoke<AdminCommandReceipt<'grant_promotional_credit'>>(source, 'moneyPromotionalCredit:grant', signed, identity)
        expect(receipt).toMatchObject({ kind: 'pending', action: 'grant_promotional_credit' })
        if (receipt.kind !== 'pending' || receipt.effectRefs[0] === undefined) throw new Error('proof_grant_not_admitted')
        refs.set(label, receipt.effectRefs[0])
      }
      // Wait for the deliberately unconfigured scheduled workers before freezing.
      for (const grantRef of refs.values()) expect(await invoke(source, 'moneyPromotionalCredit:process', { grantRef })).toBe(false)
      const archived = await inspect(source)
      expect(archived.grants).toHaveLength(3)
      expect(archived.grants.every(row => row.bookingState === 'pending' && row.availableUnits === '0')).toBe(true)
      expect(archived.operations.every(row => row.status === 'in_progress')).toBe(true)
      expect(archived.audits.filter(row => row.eventType === 'money.promotional_credit_requested')).toHaveLength(3)
      const archive = join(root, 'pending-grants.zip')
      await command(source, ['export', '--include-file-storage', '--path', archive])
      await stops[0]!()
      const native = new Map<string, { reference: string; id: string }>()
      for (const label of ['valid', 'conflict']) {
        const row = archived.grants.find(row => row.grantRef === refs.get(label))!
        const prepared = prepareFormancePromotionalCreditGrant({ grantRef: row.grantRef, accountRef: row.accountRef,
          amountUnits: row.amountUnits, expiresAt: row.expiresAt, commandDigest: row.commandDigest, revision: 1 })
        if (prepared.kind !== 'prepared') throw new Error(prepared.code)
        // One conflict has valid digests but wrong native amount. Replay must
        // compare postings, not just the command's declared metadata.
        const submitted = label === 'conflict' ? { ...prepared.command,
          variables: { ...prepared.command.variables, amount: 'AUD/6 9999999' } } : prepared.command
        expect(await executeFormanceMoneyCommand(context, submitted)).toMatchObject({ kind: 'completed' })
        const transaction = await readFormanceTransactionByReference(context, prepared.command.commandRef)
        if (transaction.kind !== 'found') throw new Error('proof_native_grant_missing')
        native.set(row.grantRef, { reference: prepared.command.commandRef, id: transaction.transactionId })
      }
      const baseline = await snapshot()
      await command(target, ['import', archive, '--replace', '--yes'])
      expect(await inspect(target)).toEqual(archived)
      await invoke(target, 'financialRestoreProof:removePromotionalApproval', { grantRef: refs.get('missing-authority')! })
      const before = await inspect(target)
      const processGrant = (grantRef: string) => invoke<boolean>(target, 'moneyPromotionalCredit:process', { grantRef })
      for (const label of ['valid', 'missing-authority', 'conflict']) {
        const grantRef = refs.get(label)!
        expect(await Promise.all([processGrant(grantRef), processGrant(grantRef)]))
          .toEqual(label === 'valid' ? [true, true] : [false, false])
        expect(await snapshot()).toEqual(baseline)
      }
      const recovered = await inspect(target)
      const grantRef = refs.get('valid')!, original = native.get(grantRef)!
      const booked = recovered.grants.find(row => row.grantRef === grantRef)!
      expect(booked).toMatchObject({ bookingState: 'booked', availableUnits: '10000000', transactionRef: original.reference })
      const operation = recovered.operations.find(row => row.key === 'restore:valid')!
      expect(operation.status).toBe('succeeded')
      const receipt = JSON.parse(operation.resultJson!)
      expect(receipt).toMatchObject({ kind: 'completed', effectRefs: [grantRef, original.reference] })
      expect(operation.resultHash).toBe(canonicalDigest(receipt))
      expect(recovered.audits.filter(row => row.eventType === 'money.promotional_credit_granted')).toHaveLength(1)
      for (const label of ['missing-authority', 'conflict']) {
        const old = before.grants.find(row => row.grantRef === refs.get(label))!
        const after = recovered.grants.find(row => row.grantRef === old.grantRef)!
        expect(after).toEqual({ ...old, nextWorkAt: after.nextWorkAt, updatedAt: after.updatedAt })
        expect(recovered.operations.find(row => row.key === `restore:${label}`)).toEqual(before.operations.find(row => row.key === `restore:${label}`))
      }
      expect(await readFormanceTransactionByReference(context, original.reference)).toMatchObject({ kind: 'found', transactionId: original.id })
      console.log('Promotional restore: grant recovered; export frozen expiry before native completion')
      while (Date.now() <= booked.expiresAt) await new Promise(done => setTimeout(done, Math.min(1_000, booked.expiresAt - Date.now() + 1)))
      const expiry = await invoke<Work>(target, 'moneyPromotionalCredit:claimWork', { grantRef })
      expect(expiry).toMatchObject({ kind: 'expiry', revision: 1, amountUnits: '10000000' })
      const frozen = await inspect(target), expiryArchive = join(root, 'pending-expiry.zip')
      await command(target, ['export', '--include-file-storage', '--path', expiryArchive])
      const { kind: _kind, environment: _environment, ...expiryInput } = expiry
      const preparedExpiry = prepareFormancePromotionalCreditExpiry(expiryInput)
      if (preparedExpiry.kind !== 'prepared') throw new Error(preparedExpiry.code)
      expect(await executeFormanceMoneyCommand(context, preparedExpiry.command)).toMatchObject({ kind: 'completed' })
      const expiryNative = await readFormanceTransactionByReference(context, preparedExpiry.command.commandRef)
      if (expiryNative.kind !== 'found') throw new Error('proof_native_expiry_missing')
      const expiryBaseline = await snapshot()
      await command(target, ['import', expiryArchive, '--replace', '--yes'])
      expect(await inspect(target)).toEqual(frozen)
      const expiryResults = await Promise.all([processGrant(grantRef), processGrant(grantRef)])
      expect(expiryResults).toContain(true)
      const expired = await inspect(target)
      expect(expired.grants.find(row => row.grantRef === grantRef)).toMatchObject({ bookingState: 'booked', availableUnits: '0', expiryRevision: 1 })
      expect(expired.grants.find(row => row.grantRef === grantRef)?.pendingExpiry).toBeUndefined()
      expect(expired.operations).toEqual(recovered.operations)
      expect(expired.audits.filter(row => row.eventType === 'money.promotional_credit_expired')).toHaveLength(1)
      expect(await processGrant(grantRef)).toBe(true)
      expect((await inspect(target)).audits).toEqual(expired.audits)
      expect(await snapshot()).toEqual(expiryBaseline)
      expect(await readFormanceTransactionByReference(context, preparedExpiry.command.commandRef))
        .toMatchObject({ kind: 'found', transactionId: expiryNative.transactionId })
      summary = { grantsAdmitted: 3, recovered: 1, missingAuthorityRefused: 1, wrongPostingRefused: 1,
        frozenExpiryRecovered: 1, duplicateNativeTransactions: 0, sourceStoppedBeforeRecovery: true,
        nativeGrantId: original.id, nativeExpiryId: expiryNative.transactionId, ledgerUnchangedOnRecovery: true,
        syntheticMfa: true, chainOrProviderDeliveryProven: false }
    } catch (error) { failures.push(error) }
    finally {
      const stopped = await Promise.allSettled(stops.map(stop => stop()))
      const cleanup = await Promise.allSettled([terminateIsolatedProcesses(source), terminateIsolatedProcesses(target),
        docker(['down', '--volumes', '--remove-orphans'])])
      for (const result of [...stopped, ...cleanup]) if (result.status === 'rejected') failures.push(result.reason)
      if (cleanup.every(result => result.status === 'fulfilled')) {
        try { rmSync(root, { recursive: true, force: true }) } catch (error) { failures.push(error) }
      }
    }
    if (failures.length > 0) throw new AggregateError(failures, 'promotional_restore_proof_failed')
    console.log(JSON.stringify(summary))
  }, 900_000)
})

/** Original ranges and protected-buffer plans survive only when their intent is
 * in the archive. Exact native replay repairs that intent; current cash alone
 * cannot manufacture a missing range or replenish spendable capacity. */
describe.skipIf(process.env.AE_CONVEX_RESTORE_INTEGRATION !== 'true'
  || process.env.AE_FORMANCE_INTEGRATION !== 'true')('native treasury recovery after Convex restore', () => {
  it('replays surviving opening/deposit ranges and refuses a lost buffer range without native writes', async () => {
    type Stored = { cursors: Doc<'moneyTreasuryCursors'>[]; batches: Doc<'moneyTreasuryBatches'>[] }
    type Reconciled = { result: { kind: 'completed'; caughtUp: boolean; batchRef?: string } | { kind: 'unavailable'; code: string }; chainReads: number }
    const root = mkdtempSync(join(tmpdir(), 'ae-convex-treasury-restore-'))
    const source = join(root, 'source'), target = join(root, 'target')
    const allocated = await ports(5), project = `ae-convex-treasury-${randomUUID().replaceAll('-', '').slice(0, 12)}`
    const configuration = { environment: 'sandbox' as const, ledger: project,
      gatewayUrl: `http://127.0.0.1:${allocated[4]}`, requestTimeoutMs: 10_000 }
    const context = createFormanceContext(configuration)
    const docker = async (args: string[]) => (await runFile('docker', ['compose', '--project-name', project,
      '-f', resolve('tests/config/native-money/compose.yml'), ...args], { timeout: 120_000,
      env: { ...process.env, AE_NATIVE_MONEY_PORT: String(allocated[4]) }, maxBuffer: 4 * 1024 * 1024 })).stdout
    const command = (directory: string, args: string[]) => runConvexCommand({ sourceRoot, isolatedRoot: directory,
      args, retainBackendOnSuccess: ['run', 'data', 'export', 'import'].includes(args[0] ?? '') })
    const invoke = async <T>(directory: string, method: string, args: object = {}): Promise<T> => {
      const response = await command(directory, ['run', `treasuryRestoreProof:${method}`, JSON.stringify(args)])
      return (response.stdout.trim() === '' ? null : JSON.parse(response.stdout)) as T
    }
    const progress = async (directory: string): Promise<TreasuryProgress> => JSON.parse(await invoke<string>(directory, 'read')) as TreasuryProgress
    const reconcile = async (observation?: TreasuryChainObservation): Promise<Reconciled> => JSON.parse(
      await invoke<string>(target, 'reconcile', observation === undefined ? {} : { observation })) as Reconciled
    const inspect = async (directory: string): Promise<Stored> => {
      const response = await command(directory, ['run', '--inline-query',
        '({cursors:await ctx.db.query("moneyTreasuryCursors").take(3),batches:await ctx.db.query("moneyTreasuryBatches").take(10)})'])
      const rows = JSON.parse(response.stdout) as Stored
      if (rows.cursors.length >= 3 || rows.batches.length >= 10) throw new Error('treasury_restore_source_incomplete')
      return rows
    }
    const native = async () => {
      const read = await readFormanceRestoreSnapshot(configuration)
      if (read.kind !== 'available') throw new Error(read.code)
      return read.snapshot
    }
    const archive = async (directory: string, label: string) => {
      const path = join(root, `${label}.zip`)
      await command(directory, ['export', '--include-file-storage', '--path', path])
      return path
    }
    const restore = async (path: string) => { await command(target, ['import', path, '--replace', '--yes']) }
    const stops: Array<() => Promise<void>> = [], failures: unknown[] = []
    let summary: object | undefined
    try {
      console.log('Treasury restore: start isolated native ledger and two Convex deployments')
      await docker(['up', '--detach', '--wait', '--wait-timeout', '90'])
      const deadline = Date.now() + 30_000
      let healthy = false
      while (!healthy && Date.now() < deadline) {
        try {
          const response = await context.sdk.getVersions({ retries: { strategy: 'none' }, timeoutMs: 2_000 })
          healthy = response.getVersionsResponse?.versions.some(version => version.name === 'ledger' && version.health) === true
        } catch { /* Readiness only, before native financial writes. */ }
        if (!healthy) await new Promise(done => setTimeout(done, 250))
      }
      expect(healthy).toBe(true)
      expect(await installPackage4FormanceSchema(context)).toMatchObject({ kind: 'completed' })
      expect(await readFormanceHealth(context)).toMatchObject({ kind: 'ready' })
      const address = `0x${'1'.repeat(40)}`, payer = `0x${'2'.repeat(40)}`
      const network = 'eip155:84532', asset = '0x036cbd53842c5426634e7929541ec2318f3dcf7e'
      // Synthetic sandbox configuration establishes the same canonical custody
      // identity in both deployments; this fixture never instantiates CDP.
      const environment = {
        AE_DEPLOYMENT_ENVIRONMENT: 'development', CLERK_JWT_ISSUER_DOMAIN: 'https://release-proof.invalid',
        AE_FORMANCE_ENVIRONMENT: 'sandbox',
        AE_FORMANCE_GATEWAY_URL: configuration.gatewayUrl, AE_FORMANCE_LEDGER: configuration.ledger,
        AE_X402_CUSTODY_ENABLED: 'true', AE_X402_CUSTODY_MAX_ATOMIC: '10000', AE_X402_CUSTODY_DAILY_MAX_ATOMIC: '100000',
        CDP_API_KEY_ID: 'fixture-key', CDP_API_KEY_SECRET: 'fixture-secret', CDP_WALLET_SECRET: 'fixture-wallet-secret',
        AE_X402_CDP_ACCOUNT_NAME: 'fixture-treasury-restore', AE_X402_CDP_EXPECTED_EVM_ADDRESS: address,
        AE_X402_CDP_ACCOUNT_POLICY_ID: '11111111-1111-4111-8111-111111111111',
        AE_X402_CDP_PROJECT_POLICY_ID: '22222222-2222-4222-8222-222222222222',
        AE_X402_CDP_POLICY_RULES_DIGEST: canonicalDigest('fixture-treasury-restore-policy'), AE_X402_CDP_CREDENTIAL_GENERATION: '1',
      }
      for (const [index, directory] of [source, target].entries()) {
        mkdirSync(directory); installFixture(directory)
        await command(directory, ['dev', '--once', '--skip-push', '--local-cloud-port', String(allocated[index * 2]),
          '--local-site-port', String(allocated[index * 2 + 1]), '--local-backend-version', backendVersion])
        for (const [name, value] of Object.entries(environment)) await command(directory, ['env', 'set', name, value])
        stops.push(await startConvexDev({ sourceRoot, isolatedRoot: directory, backendVersion }))
      }
      await invoke(source, 'initialize')
      const hash = (value: number) => `0x${value.toString(16).padStart(64, '0')}`
      const now = Date.now()
      const opening: TreasuryChainObservation = { kind: 'observed', environment: 'sandbox', network, asset, address,
        fromBlock: '100', checkpoint: { blockNumber: '100', blockHash: hash(100), balanceUnits: '5000' },
        blockTimestamp: now - 1_000, transfers: [], caughtUp: true, observedAt: now }
      const pendingOpening = JSON.parse(await invoke<string>(source, 'begin', { previousCheckpoint: null, observation: opening })) as TreasuryProgress
      if (pendingOpening.kind !== 'pending') throw new Error('treasury_restore_opening_not_pending')
      expect(pendingOpening.batch).toMatchObject({ previousCheckpoint: null, previousBufferUnits: '0', bufferIncreaseUnits: '5000' })
      const originalOpeningRows = await inspect(source), openingArchive = await archive(source, 'pending-opening')
      const postedOpening = await bookFormanceTreasuryBatch(context, pendingOpening.identity, pendingOpening.batch)
      if (postedOpening.kind !== 'completed') throw new Error('treasury_restore_opening_not_posted')
      const openingNative = await native()
      expect(openingNative.summary.counts.transactions).toBe(2)
      expect(await readFormanceTreasuryBalances(context, pendingOpening.identity)).toMatchObject({ availableUnits: '0', committedUnits: '0', bufferUnits: '5000' })
      const stopSource = stops[0]
      if (stopSource === undefined) throw new Error('treasury_restore_source_stop_missing')
      await stopSource()
      await restore(openingArchive)
      expect(await inspect(target)).toEqual(originalOpeningRows)
      expect(await compareConvexSnapshots(openingArchive, await archive(target, 'restored-opening'))).toMatchObject({ kind: 'matched' })
      // A peer can read an already-ready checkpoint. The worker that completes
      // the original pending range must skip chain I/O and retain its batchRef.
      const recoveredOpening = await Promise.all([reconcile(opening), reconcile(opening)])
      expect(recoveredOpening.every(read => read.result.kind === 'completed')).toBe(true)
      expect(recoveredOpening.some(read => read.chainReads === 0
        && read.result.kind === 'completed' && read.result.batchRef === pendingOpening.batch.batchRef)).toBe(true)
      const readyOpeningRows = await inspect(target)
      expect(readyOpeningRows.batches).toHaveLength(1)
      expect(readyOpeningRows.batches[0]?.state).toMatchObject({ kind: 'booked', transactionRefs: [...postedOpening.transactionRefs] })
      expect(readyOpeningRows.batches[0]).toEqual({ ...originalOpeningRows.batches[0], state: readyOpeningRows.batches[0]?.state })
      expect(await progress(target)).toMatchObject({ kind: 'ready', checkpoint: opening.checkpoint, bufferUnits: '5000' })
      expect((await Promise.all([reconcile(opening), reconcile(opening)])).every(read => read.result.kind === 'completed')).toBe(true)
      expect(await inspect(target)).toEqual(readyOpeningRows)
      expect(await native()).toEqual(openingNative)
      const readyArchive = await archive(target, 'ready-opening')

      const at = Date.now(), transferMaterial = { transactionHash: hash(201), logIndex: 0,
        blockNumber: '101', blockHash: hash(101), payer, recipient: address, amountUnits: '20000' }
      const deposit: TreasuryChainObservation = { ...opening, fromBlock: '101',
        checkpoint: { blockNumber: '101', blockHash: hash(101), balanceUnits: '25000' },
        blockTimestamp: at - 1_000, observedAt: at,
        transfers: [{ ...transferMaterial, evidenceDigest: canonicalDigest({ kind: 'ae.treasury-transfer:v1', network, asset, ...transferMaterial }) }] }
      const pendingDeposit = JSON.parse(await invoke<string>(target, 'begin', { previousCheckpoint: opening.checkpoint, observation: deposit })) as TreasuryProgress
      if (pendingDeposit.kind !== 'pending') throw new Error('treasury_restore_deposit_not_pending')
      expect(pendingDeposit.batch).toMatchObject({ previousBufferUnits: '5000', bufferIncreaseUnits: '5000' })
      const originalDepositRows = await inspect(target), depositArchive = await archive(target, 'pending-deposit')
      const postedDeposit = await bookFormanceTreasuryBatch(context, pendingDeposit.identity, pendingDeposit.batch)
      if (postedDeposit.kind !== 'completed') throw new Error('treasury_restore_deposit_not_posted')
      const depositNative = await native()
      expect(depositNative.summary.counts.transactions).toBe(4)
      expect(await readFormanceTreasuryBalances(context, pendingDeposit.identity)).toMatchObject({ availableUnits: '15000', committedUnits: '0', bufferUnits: '10000' })
      await restore(depositArchive)
      expect(await inspect(target)).toEqual(originalDepositRows)
      const recovered = await Promise.all([reconcile(deposit), reconcile(deposit)])
      expect(recovered.every(read => read.result.kind === 'completed')).toBe(true)
      // A racing peer may read the already-ready checkpoint; at least the worker
      // that finishes the original pending range must skip synthetic chain I/O.
      expect(recovered.some(read => read.chainReads === 0)).toBe(true)
      const readyDepositRows = await inspect(target)
      expect(readyDepositRows.batches).toHaveLength(2)
      expect(readyDepositRows.batches.find(batch => batch.batchRef === pendingDeposit.batch.batchRef)?.state)
        .toMatchObject({ kind: 'booked', transactionRefs: [...postedDeposit.transactionRefs] })
      expect(readyDepositRows.batches.find(batch => batch.batchRef === pendingOpening.batch.batchRef))
        .toEqual(readyOpeningRows.batches[0])
      const completedDeposit = readyDepositRows.batches.find(batch => batch.batchRef === pendingDeposit.batch.batchRef)
      expect(completedDeposit).toEqual({ ...originalDepositRows.batches.find(batch => batch.batchRef === pendingDeposit.batch.batchRef), state: completedDeposit?.state })
      expect(await progress(target)).toMatchObject({ kind: 'ready', checkpoint: deposit.checkpoint, bufferUnits: '10000' })
      expect((await reconcile(deposit)).result.kind).toBe('completed')
      expect(await inspect(target)).toEqual(readyDepositRows)
      expect(await native()).toEqual(depositNative)

      await restore(readyArchive)
      expect(await inspect(target)).toEqual(readyOpeningRows)
      const later: TreasuryChainObservation = { ...deposit, observedAt: Date.now(), blockTimestamp: Date.now() - 1_000,
        checkpoint: { blockNumber: '102', blockHash: hash(102), balanceUnits: '25000' } }
      expect(await reconcile(later)).toEqual({ result: { kind: 'unavailable', code: 'treasury_buffer_continuity_conflict' }, chainReads: 1 })
      const heldRows = await inspect(target), held = await progress(target)
      if (held.kind !== 'pending') throw new Error('treasury_restore_lost_range_not_held')
      expect(held.batch.batchRef).not.toBe(pendingDeposit.batch.batchRef)
      expect(held.batch).toMatchObject({ previousCheckpoint: opening.checkpoint, previousBufferUnits: '5000', bufferIncreaseUnits: '5000', state: { kind: 'pending' } })
      expect(heldRows.cursors[0]?.state).toMatchObject({ kind: 'applying', checkpoint: opening.checkpoint, batchRef: held.batch.batchRef })
      expect(await reconcile()).toEqual({ result: { kind: 'unavailable', code: 'treasury_buffer_continuity_conflict' }, chainReads: 0 })
      expect(await inspect(target)).toEqual(heldRows)
      expect(await native()).toEqual(depositNative)
      expect(await readFormanceTreasuryBalances(context, pendingDeposit.identity)).toMatchObject({ availableUnits: '15000', committedUnits: '0', bufferUnits: '10000' })
      summary = { openingRecovered: true, depositRecovered: true, lostBufferRangeRefused: true,
        duplicateNativeTransactions: 0, completeNativeEvidenceUnchangedOnRecovery: true,
        originalRangesPreserved: true, syntheticChainOnly: true, sourceStoppedBeforeRecovery: true }
    } catch (error) { failures.push(error) }
    finally {
      const stopped = await Promise.allSettled(stops.map(stop => stop()))
      const cleanup = await Promise.allSettled([terminateIsolatedProcesses(source), terminateIsolatedProcesses(target),
        docker(['down', '--volumes', '--remove-orphans'])])
      for (const result of [...stopped, ...cleanup]) if (result.status === 'rejected') failures.push(result.reason)
      if (cleanup.every(result => result.status === 'fulfilled')) {
        try { rmSync(root, { recursive: true, force: true }) } catch (error) { failures.push(error) }
      }
    }
    if (failures.length > 0) throw new AggregateError(failures, 'treasury_restore_proof_failed')
    console.log(JSON.stringify(summary))
  }, 900_000)
})
