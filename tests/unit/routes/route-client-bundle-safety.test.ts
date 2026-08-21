import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * `src/routeTree.gen.ts` is client-bundled and imports every route module,
 * including server-only API routes. A top-level `node:` import anywhere in a
 * route's runtime module graph therefore reaches the browser, throws during
 * hydration, and leaves every page as inert server-rendered HTML — the whole
 * product, not just the offending route.
 *
 */

const repoRoot = path.resolve(__dirname, '../../..')
const routesDir = path.join(repoRoot, 'src/routes')

function resolveSpecifier(specifier: string, importer: string): string | undefined {
  const base = specifier.startsWith('@/')
    ? path.join(repoRoot, 'src', specifier.slice(2))
    : specifier.startsWith('.')
      ? path.resolve(path.dirname(importer), specifier)
      : undefined
  if (base === undefined) return undefined
  for (const candidate of [`${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts'), path.join(base, 'index.tsx'), base]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate
  }
  return undefined
}

/** Runtime imports only. `import type` is erased and cannot reach the bundle. */
const runtimeImportPattern = /(?:^|\n)\s*(?:import|export)\s+(?!type\s)(?:[^;'"]*?\sfrom\s*)?['"]([^'"]+)['"]/g

function collectRouteFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name)
    if (entry.isDirectory()) return collectRouteFiles(full)
    return /\.tsx?$/.test(entry.name) ? [full] : []
  })
}

function findNodeBuiltinPath(entry: string): readonly string[] | undefined {
  const visited = new Set<string>()
  const queue: Array<readonly string[]> = [[entry]]
  while (queue.length > 0) {
    const chain = queue.shift()
    if (chain === undefined) break
    const file = chain[chain.length - 1]
    if (file === undefined || visited.has(file)) continue
    visited.add(file)
    let source: string
    try {
      source = readFileSync(file, 'utf8')
    } catch {
      continue
    }
    for (const match of source.matchAll(runtimeImportPattern)) {
      const specifier = match[1]
      if (specifier === undefined) continue
      if (specifier.startsWith('node:')) return [...chain, specifier]
      const resolved = resolveSpecifier(specifier, file)
      if (resolved !== undefined) queue.push([...chain, resolved])
    }
  }
  return undefined
}

describe('route modules stay client-bundle safe', () => {
  const routeFiles = collectRouteFiles(routesDir)

  it('finds route modules to check', () => {
    expect(routeFiles.length).toBeGreaterThan(20)
  })

  it.each(routeFiles.map((file) => [path.relative(repoRoot, file), file] as const))(
    '%s reaches no node: builtin at module scope',
    (relative, file) => {
      const chain = findNodeBuiltinPath(file)
      const rendered = chain?.map((step) => (step.startsWith('node:') ? step : path.relative(repoRoot, step))).join('\n  -> ')
      expect(
        chain,
        `${relative} pulls a Node builtin into the client route tree, which breaks hydration for every page:\n  ${rendered}\n\nMove the Node-only work behind a dynamic import inside the handler, or use a runtime-agnostic API.`
      ).toBeUndefined()
    }
  )
})
