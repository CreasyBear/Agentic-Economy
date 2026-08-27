import { readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

export type ScanTarget = {
  root: string
  includeExtensions?: readonly string[]
  exclude?: readonly string[]
}

export type ScanViolation = {
  file: string
  line: number
  rule: string
  message: string
  excerpt: string
}

const defaultExtensions = [
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.css',
  '.md',
  '.json',
  '.fixture',
] as const

const ignoredDirectories = new Set([
  '.git',
  '.planning',
  '.codex',
  '.agents',
  'coverage',
  'dist',
  'node_modules',
  'playwright-report',
  'test-results',
])

export function findFiles(targets: readonly ScanTarget[]): readonly string[] {
  const files: string[] = []
  for (const target of targets) collectFiles(target.root, target, files)
  return files.sort()
}

function collectFiles(root: string, target: ScanTarget, files: string[]): void {
  let stats
  try {
    stats = statSync(root)
  } catch {
    return
  }
  if (isExcluded(root, target.exclude ?? [])) return
  if (stats.isFile()) {
    if (hasAllowedExtension(root, target.includeExtensions ?? defaultExtensions)) files.push(root)
    return
  }
  if (!stats.isDirectory()) return
  const basename = root.split('/').at(-1) ?? root
  if (ignoredDirectories.has(basename)) return
  for (const entry of readdirSync(root)) collectFiles(join(root, entry), target, files)
}

function hasAllowedExtension(file: string, extensions: readonly string[]): boolean {
  return extensions.some((extension) => file.endsWith(extension))
}

function isExcluded(file: string, exclusions: readonly string[]): boolean {
  const normalized = relative(process.cwd(), file).replaceAll('\\', '/')
  return exclusions.some((exclude) => normalized === exclude || normalized.startsWith(`${exclude}/`))
}
