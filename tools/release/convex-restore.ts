import { open, unlink } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'
import { compareConvexSnapshots, ConvexSnapshotDiagnostic } from './convex-snapshot-compare'

/** Read-only archive comparison. Target identity, scheduler recovery and hosted RPO/RTO are separate evidence. */
export async function compareRestoreArchives(args: readonly string[]): Promise<void> {
  const { values } = parseArgs({ args: [...args], strict: true, allowPositionals: false,
    options: { source: { type: 'string' }, restored: { type: 'string' }, receipt: { type: 'string' } } })
  if (!values.source || !values.restored || !values.receipt) throw new Error('convex_restore_arguments_required')
  const source = resolve(values.source)
  const restored = resolve(values.restored)
  const receipt = resolve(values.receipt)
  if (source === restored || source === receipt || restored === receipt) throw new Error('convex_restore_paths_must_differ')
  const result = await compareConvexSnapshots(source, restored)
  const file = await open(receipt, 'wx', 0o600)
  try {
    await file.writeFile(`${JSON.stringify({ ...result, comparedAt: new Date().toISOString() }, null, 2)}\n`)
    await file.sync()
  } catch (error) {
    await unlink(receipt)
    throw error
  } finally { await file.close() }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  compareRestoreArchives(process.argv.slice(2)).then(() => {
    process.stdout.write('Convex archive records and files match. Scheduler recovery is unverified.\n')
  }).catch((error: unknown) => {
    const code = error instanceof ConvexSnapshotDiagnostic ? error.code : 'convex_restore_comparison_failed'
    process.stderr.write(`${code}\n`)
    process.exitCode = 1
  })
}
