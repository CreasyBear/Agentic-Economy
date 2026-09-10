import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

// Reuses the dependency graph the repo already computes for
// `npm run deps:check` (see tools/dev/deps-ratchet.mjs): one `depcruise`
// run against the shared `.dependency-cruiser.cjs` config, cached at module
// scope so every `it` below (and any future one) shares the single run.
const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const DEPCRUISE_BIN = resolve(PROJECT_ROOT, 'node_modules/.bin/depcruise')
const CONFIG_PATH = resolve(PROJECT_ROOT, '.dependency-cruiser.cjs')

type DepcruiseDependency = Readonly<{
  resolved: string
  dependencyTypes: readonly string[]
}>
type DepcruiseModule = Readonly<{
  source: string
  dependencies: readonly DepcruiseDependency[]
}>

function runDepcruise(): readonly DepcruiseModule[] {
  const args = ['--config', CONFIG_PATH, '--output-type', 'json', 'src', 'convex']
  let stdout: string
  try {
    stdout = execFileSync(DEPCRUISE_BIN, args, {
      cwd: PROJECT_ROOT,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  } catch (error) {
    // depcruise exits non-zero when any error-severity rule fires; stdout
    // still carries the JSON report in that case (see deps-ratchet.mjs).
    const stdoutFromError = (error as { stdout?: unknown }).stdout
    if (typeof stdoutFromError !== 'string' || stdoutFromError.length === 0) throw error
    stdout = stdoutFromError
  }
  return (JSON.parse(stdout) as { modules: readonly DepcruiseModule[] }).modules
}

const MODULES = runDepcruise()

// dependency-cruiser's config excludes `node_modules` from the reported
// graph, so an edge into an npm package (e.g. `@coinbase/cdp-sdk`) never
// appears as a dependency entry - only edges into Node core builtins (e.g.
// `crypto`) survive. Detect the npm package by reading the importing
// file's own source text instead.
const CDP_SDK_IMPORT = /(?:from|import)\s*\(?\s*["']@coinbase\/cdp-sdk["']/

function isValueEdge(dependency: DepcruiseDependency): boolean {
  // Type-only import/export specifiers are erased at compile time and
  // never reach the Convex bundle, so they cannot trip the "use node" check.
  return !dependency.dependencyTypes.includes('type-only')
}

// Some depcruise module "sources" are pseudo-modules for specifiers it
// could not resolve to a real file (e.g. an unresolvable `vite/client`
// type reference) or Node core builtins (e.g. `crypto`) - neither has an
// on-disk file to read.
function isRepoFile(source: string): boolean {
  return existsSync(resolve(PROJECT_ROOT, source))
}

function fileText(source: string): string {
  return readFileSync(resolve(PROJECT_ROOT, source), 'utf8')
}

function importsCdpSdkDirectly(source: string): boolean {
  return isRepoFile(source) && CDP_SDK_IMPORT.test(fileText(source))
}

function importsCryptoAsValue(module: DepcruiseModule): boolean {
  return module.dependencies.some(
    (dependency) =>
      (dependency.resolved === 'crypto' || dependency.resolved === 'node:crypto') && isValueEdge(dependency),
  )
}

const NODE_ONLY_MODULES = new Set(
  MODULES.filter((module) => importsCryptoAsValue(module) || importsCdpSdkDirectly(module.source)).map(
    (module) => module.source,
  ),
)

const VALUE_EDGES_BY_SOURCE = new Map<string, readonly string[]>(
  MODULES.map((module) => [module.source, module.dependencies.filter(isValueEdge).map((dependency) => dependency.resolved)]),
)

function hasUseNodeDirective(source: string): boolean {
  return isRepoFile(source) && /^\s*['"]use node['"]/.test(fileText(source))
}

// Repo-file-only reachability by value (non-type-only) imports, matching
// what actually survives into a Convex bundle for the default (isolate)
// runtime. Returns the first offending path found, if any.
type SearchNode = Readonly<{ current: string; path: readonly string[] }>

function findNodeOnlyPath(start: string): readonly string[] | undefined {
  const visited = new Set<string>([start])
  const queue: SearchNode[] = [{ current: start, path: [start] }]
  for (let index = 0; index < queue.length; index += 1) {
    const node = queue[index]
    if (node === undefined) continue
    if (NODE_ONLY_MODULES.has(node.current)) return node.path
    for (const next of VALUE_EDGES_BY_SOURCE.get(node.current) ?? []) {
      if (visited.has(next)) continue
      visited.add(next)
      queue.push({ current: next, path: [...node.path, next] })
    }
  }
  return undefined
}

describe('node-only modules stay out of the default Convex runtime', () => {
  it('keeps @coinbase/cdp-sdk and node:crypto unreachable from every convex/*.ts file without "use node"', () => {
    const defaultRuntimeConvexFiles = MODULES.map((module) => module.source).filter(
      (source) =>
        source.startsWith('convex/') &&
        !source.startsWith('convex/_generated/') &&
        !source.endsWith('.test.ts') &&
        isRepoFile(source) &&
        !hasUseNodeDirective(source),
    )
    // Sanity-check the fixture itself: if this drops to zero, the scan
    // target changed shape and the assertion below would pass vacuously.
    expect(defaultRuntimeConvexFiles.length).toBeGreaterThan(0)

    const offenders = defaultRuntimeConvexFiles
      .map((source) => findNodeOnlyPath(source))
      .filter((path): path is readonly string[] => path !== undefined)
      .map((path) => path.join(' -> '))

    expect(offenders).toEqual([])
  })
})
