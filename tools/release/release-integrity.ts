import { relative, resolve, sep } from 'node:path'

type JsonObject = Record<string, unknown>

export type PackFile = Readonly<{
  mode: number
  path: string
  size: number
}>

export type PackReport = Readonly<{
  entryCount: number
  filename: string
  files: readonly PackFile[]
  integrity: string
  name: string
  shasum: string
  version: string
}>

export const protectedGeneratedPaths = [
  'convex/_generated',
  'src/routeTree.gen.ts',
] as const

function object(value: unknown, label: string): JsonObject {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${label}_must_be_an_object`)
  }
  return value as JsonObject
}

function string(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${label}_must_be_a_non_empty_string`)
  }
  return value
}

function normalizeRepositoryPath(path: string): string {
  return path.split(sep).join('/').replace(/^\.\//u, '')
}

export function assertGeneratedSnapshotUnchanged(
  before: Readonly<Record<string, string>>,
  after: Readonly<Record<string, string>>,
): void {
  const paths = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort()
  const drift = paths.filter((path) => before[path] !== after[path])
  if (drift.length > 0) throw new Error(`generated_artifact_drift:${drift.join('|')}`)
}

export function assertPinnedNitroNightly(
  packageManifest: unknown,
  packageLock: unknown,
): string {
  const manifest = object(packageManifest, 'package_manifest')
  const devDependencies = object(manifest.devDependencies, 'package_manifest_dev_dependencies')
  const requested = string(devDependencies.nitro, 'nitro_dependency')
  const match = /^npm:nitro-nightly@([^\s~^*|<>=]+)$/u.exec(requested)
  if (match === null) throw new Error('nitro_nightly_must_be_exactly_pinned')
  const requestedVersion = match[1]!
  if (!/^\d+\.\d+\.\d+-[0-9A-Za-z.-]+$/u.test(requestedVersion)) {
    throw new Error('nitro_nightly_version_must_be_an_immutable_version')
  }

  const lock = object(packageLock, 'package_lock')
  const packages = object(lock.packages, 'package_lock_packages')
  const root = object(packages[''], 'package_lock_root')
  const rootDevDependencies = object(root.devDependencies, 'package_lock_root_dev_dependencies')
  if (rootDevDependencies.nitro !== requested) {
    throw new Error('nitro_nightly_root_lock_spec_mismatch')
  }

  const lockedNitro = object(packages['node_modules/nitro'], 'package_lock_nitro')
  if (lockedNitro.name !== 'nitro-nightly' || lockedNitro.version !== requestedVersion) {
    throw new Error('nitro_nightly_lock_version_mismatch')
  }
  string(lockedNitro.integrity, 'nitro_nightly_lock_integrity')
  string(lockedNitro.resolved, 'nitro_nightly_lock_resolution')
  return requestedVersion
}

function exactPackFileSet(packageManifest: JsonObject): readonly string[] {
  if (!Array.isArray(packageManifest.files) || packageManifest.files.length === 0) {
    throw new Error('cli_package_files_allowlist_required')
  }
  const files = packageManifest.files.map((value, index) => string(value, `cli_package_file_${index}`))
  if (files.some((path) => (
    path.includes('*')
    || path.endsWith('/')
    || path.startsWith('/')
    || path.startsWith('./')
    || path.includes('\\')
    || path.split('/').includes('..')
  ))) {
    throw new Error('cli_package_files_must_be_exact_paths')
  }
  return [...new Set(['package.json', ...files])].sort()
}

export function assertCliPackIntegrity(
  packageManifest: unknown,
  report: unknown,
): PackReport {
  const manifest = object(packageManifest, 'cli_package_manifest')
  if (!Array.isArray(report) || report.length !== 1) {
    throw new Error('cli_pack_report_must_have_one_entry')
  }
  const packed = object(report[0], 'cli_pack_report')
  const filesValue = packed.files
  if (!Array.isArray(filesValue)) throw new Error('cli_pack_files_missing')
  const files = filesValue.map((value, index): PackFile => {
    const file = object(value, `cli_pack_file_${index}`)
    const path = string(file.path, `cli_pack_file_${index}_path`)
    if (!Number.isInteger(file.size) || Number(file.size) <= 0) {
      throw new Error(`cli_pack_file_${index}_must_be_non_empty`)
    }
    if (!Number.isInteger(file.mode)) throw new Error(`cli_pack_file_${index}_mode_missing`)
    return { mode: Number(file.mode), path, size: Number(file.size) }
  })

  const expected = exactPackFileSet(manifest)
  const actual = files.map((file) => file.path).sort()
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`cli_pack_file_set_mismatch:expected=${expected.join(',')}:actual=${actual.join(',')}`)
  }
  if (actual.some((path) => path.endsWith('.ts') || path.startsWith('tools/'))) {
    throw new Error('cli_pack_contains_repository_source')
  }

  const executablePath = string(object(manifest.bin, 'cli_package_bin').ae, 'cli_package_bin_ae')
  const executable = files.find((file) => file.path === executablePath)
  if (executable === undefined) throw new Error('cli_pack_executable_missing')
  if ((executable.mode & 0o111) === 0) throw new Error('cli_pack_executable_not_executable')

  const name = string(packed.name, 'cli_pack_name')
  const version = string(packed.version, 'cli_pack_version')
  if (name !== manifest.name || version !== manifest.version) {
    throw new Error('cli_pack_identity_mismatch')
  }
  if (packed.entryCount !== files.length) throw new Error('cli_pack_entry_count_mismatch')

  return {
    entryCount: Number(packed.entryCount),
    filename: string(packed.filename, 'cli_pack_filename'),
    files,
    integrity: string(packed.integrity, 'cli_pack_integrity'),
    name,
    shasum: string(packed.shasum, 'cli_pack_shasum'),
    version,
  }
}

export function repositoryRelativePath(root: string, path: string): string {
  const repositoryPath = normalizeRepositoryPath(relative(resolve(root), resolve(path)))
  if (repositoryPath === '..' || repositoryPath.startsWith('../')) {
    throw new Error('path_outside_repository')
  }
  return repositoryPath
}
