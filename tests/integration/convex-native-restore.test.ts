import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { describe, expect, it } from 'vitest'
import { copyReleaseSource, runConvexCommand, startConvexDev, terminateIsolatedProcesses } from '../../tools/release/convex-anonymous-runtime'
import { compareConvexSnapshots, ConvexSnapshotDiagnostic, readConvexSnapshot } from '../../tools/release/convex-snapshot-compare'
import { compareRestoreArchives } from '../../tools/release/convex-restore'

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

async function ports(): Promise<number[]> {
  const servers = Array.from({ length: 4 }, () => createServer())
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
})
`)
  writeFileSync(join(convex, 'restoreProof.ts'), readFileSync(resolve('tests/fixtures/convex-restore-proof.ts'), 'utf8')
    .replace('../../convex/_generated/api', './_generated/api'))
  // Suppress application crons in both disposable copies: no provider work or expiry during the data proof.
  writeFileSync(join(convex, 'crons.ts'), "import { cronJobs } from 'convex/server'\nexport default cronJobs()\n")
}

/**
 * Requires fresh disposable anonymous roots, unique ports, maintained native CLI and matching code.
 * Ensures native import preserves the complete archive, real component records, typed values and bytes.
 * Invariant: source is untouched after export; timers are accounted for separately; no inherited selectors.
 * On violation fail, including saturation or cleanup; never retry against a shared/cloud deployment.
 */
describe.skipIf(process.env.AE_CONVEX_RESTORE_INTEGRATION !== 'true')('native Convex archive restoration', () => {
  it('restores all records/files, detects independent corruption and exposes the omitted scheduler', async () => {
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
      summary = { scope: match.scope, counts: match.counts, digests: match.digests,
        scheduledNamespaces: namespaces.length, sourceJobs, targetJobs, schedulerRecovery: 'not_restored',
        falsifiers: 6, backendVersion }
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
