import { createHash, randomUUID } from 'node:crypto'
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import * as lockfile from 'proper-lockfile'
import { z } from 'zod'
import { configPath } from './config'
import { CliFailure } from './output'
import type { CliOptions } from './args'

const pendingSchema = z.strictObject({
  clientId: z.string().min(1),
  deviceCode: z.string().min(1),
  userCode: z.string().min(1),
  verificationUri: z.url(),
  expiresAt: z.number().finite().positive(),
  intervalMs: z.number().finite().positive(),
  nextPollAt: z.number().finite().nonnegative(),
  provider: z.boolean(),
})

export type PendingConnect = z.infer<typeof pendingSchema>
export type PendingConnectStore = Readonly<{
  read: () => PendingConnect | undefined
  write: (pending: PendingConnect) => void
  clear: () => void
}>

/** Keep one device request per origin, role and environment, across CLI runs. */
export async function withPendingConnect<T>(
  options: Pick<CliOptions, 'baseUrl' | 'provider' | 'environment'>,
  run: (store: PendingConnectStore) => Promise<T>,
): Promise<T> {
  const directory = join(dirname(configPath()), 'pending-connections')
  mkdirSync(directory, { recursive: true, mode: 0o700 })
  chmodSync(directory, 0o700)
  const identity = JSON.stringify([new URL(options.baseUrl).origin, options.provider === true, options.environment ?? null])
  const path = join(directory, `${createHash('sha256').update(identity).digest('hex')}.json`)
  let release: () => Promise<void>
  try {
    release = await lockfile.lock(path, { realpath: false, stale: 30_000, retries: 0 })
  } catch {
    throw new CliFailure('Another CLI process is connecting this account. Wait for it to finish.', {
      kind: 'FAILED_PRECONDITION', code: 'connect_in_progress',
    })
  }
  const clear = () => rmSync(path, { force: true })
  try {
    return await run({
      clear,
      read: () => {
        if (!existsSync(path)) return undefined
        let pending: PendingConnect
        try {
          pending = pendingSchema.parse(JSON.parse(readFileSync(path, 'utf8')))
        } catch {
          throw new CliFailure('The saved connection request cannot be read. Existing credentials are unchanged.', {
            kind: 'FAILED_PRECONDITION', code: 'connect_pending_invalid',
          })
        }
        if (pending.expiresAt <= Date.now()) { clear(); return undefined }
        return pending
      },
      write: (pending) => {
        const temporary = `${path}.${randomUUID()}.tmp`
        try {
          writeFileSync(temporary, JSON.stringify(pendingSchema.parse(pending)), { mode: 0o600, flag: 'wx' })
          renameSync(temporary, path)
        } finally { rmSync(temporary, { force: true }) }
      },
    })
  } finally { await release() }
}
