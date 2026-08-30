import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFile, readdir, stat } from 'node:fs/promises'
import { join, relative, resolve } from 'node:path'
import { promisify } from 'node:util'

import {
  assertGeneratedSnapshotUnchanged,
  assertPinnedNitroNightly,
  protectedGeneratedPaths,
} from './release-integrity'

const run = promisify(execFile)
const root = resolve(process.cwd())

async function snapshotFile(path: string): Promise<string> {
  const [contents, metadata] = await Promise.all([readFile(path), stat(path)])
  return createHash('sha256')
    .update(contents)
    .update(String(metadata.mode & 0o777))
    .digest('hex')
}

async function snapshotPath(path: string): Promise<Readonly<Record<string, string>>> {
  const absolute = resolve(root, path)
  const metadata = await stat(absolute)
  if (metadata.isFile()) return { [path]: await snapshotFile(absolute) }
  const entries = await readdir(absolute, { recursive: true, withFileTypes: true })
  const files = entries
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name))
    .sort()
  return Object.fromEntries(await Promise.all(files.map(async (file) => [
    relative(root, file).split('\\').join('/'),
    await snapshotFile(file),
  ])))
}

async function snapshotGeneratedPaths(): Promise<Readonly<Record<string, string>>> {
  return Object.assign({}, ...await Promise.all(protectedGeneratedPaths.map(snapshotPath))) as Readonly<Record<string, string>>
}

const separator = process.argv.indexOf('--')
const generator = separator === -1 ? [] : process.argv.slice(separator + 1)
const generatorCommand = generator[0]
if (generatorCommand === undefined) throw new Error('generated_source_command_required_after_double_dash')

const [packageManifestText, packageLockText] = await Promise.all([
  readFile(resolve(root, 'package.json'), 'utf8'),
  readFile(resolve(root, 'package-lock.json'), 'utf8'),
])

const nitroVersion = assertPinnedNitroNightly(
  JSON.parse(packageManifestText) as unknown,
  JSON.parse(packageLockText) as unknown,
)
const before = await snapshotGeneratedPaths()
const generated = await run(generatorCommand, generator.slice(1), {
  cwd: root,
  maxBuffer: 10 * 1024 * 1024,
})
process.stdout.write(generated.stdout)
process.stderr.write(generated.stderr)
const after = await snapshotGeneratedPaths()
assertGeneratedSnapshotUnchanged(before, after)
process.stdout.write(`RELEASE_INTEGRITY_PASS nitro=${nitroVersion}\n`)
