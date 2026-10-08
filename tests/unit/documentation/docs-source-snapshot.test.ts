import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { digest, snapshot } from '../../../tools/docs/export-docs'

const git = vi.hoisted(() => ({ exec: vi.fn() }))
vi.mock('node:child_process', () => ({ execFileSync: git.exec }))
let directory: string | undefined
const configureGit = (deleted: boolean) => git.exec.mockImplementation((_command: string, args: string[]) => {
  if (args[0] === 'rev-parse') return Buffer.from('candidate-head')
  if (args.includes('--diff-filter=D')) return Buffer.from(deleted ? 'src/deleted.ts\0' : '')
  if (args[0] === 'diff') return Buffer.from('src/deleted.ts\0')
  if (args.includes('--cached')) return Buffer.from('src/current.ts\0src/deleted.ts\0')
  return Buffer.from('')
})
afterEach(async () => { if (directory !== undefined) await rm(directory, { recursive: true, force: true }); directory = undefined; vi.clearAllMocks() })
describe('documentation source snapshot', () => {
  it('records a tracked deletion as dirty while hashing only current files', async () => {
    directory = await mkdtemp(join(tmpdir(), 'ae-docs-snapshot-'))
    await mkdir(join(directory, 'src'))
    await writeFile(join(directory, 'src/current.ts'), 'export const current = true\n')
    configureGit(true)
    const result = await snapshot(directory)
    expect(result.sources).toEqual({ 'src/current.ts': digest('export const current = true\n') })
    expect(result.dirtySources).toEqual({ 'src/deleted.ts': 'deleted' })
  })
  it('still rejects an unexpected missing source instead of producing false provenance', async () => {
    directory = await mkdtemp(join(tmpdir(), 'ae-docs-snapshot-'))
    await mkdir(join(directory, 'src'))
    await writeFile(join(directory, 'src/current.ts'), 'current')
    configureGit(false)
    await expect(snapshot(directory)).rejects.toMatchObject({ code: 'ENOENT' })
  })
})
