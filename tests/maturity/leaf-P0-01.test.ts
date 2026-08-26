import { globSync, readFileSync } from 'node:fs'
import { relative } from 'node:path'

import { describe, expect, it } from 'vitest'

const routeTreePath = 'src/routeTree.gen.ts'
const routeSourcePattern = 'src/routes/**/*.{ts,tsx}'
const publicApiRoutePattern = /createFileRoute\(\s*(['"])(\/api(?:\/[^'"]*)?)\1\s*\)/g

type PublicApiRoute = Readonly<{
  file: string
  generatedImport: string
  path: string
}>

function publicApiRoutes(): readonly PublicApiRoute[] {
  return globSync(routeSourcePattern)
    .sort()
    .flatMap((file) => {
      const source = readFileSync(file, 'utf8')
      return [...source.matchAll(publicApiRoutePattern)].map((match) => {
        const path = match[2]
        if (path === undefined) {
          throw new Error(`Could not read the createFileRoute path in ${file}`)
        }
        return {
          file,
          generatedImport: `./routes/${relative('src/routes', file)
            .replaceAll('\\', '/')
            .replace(/\.(?:ts|tsx)$/, '')}`,
          path,
        }
      })
    })
}

function includesTypedRoute(source: string, path: string): boolean {
  return source.includes(`'${path}': {`) || source.includes(`"${path}": {`)
}

function registrationProblems(
  routes: readonly PublicApiRoute[],
  generatedRouteTree: string,
): readonly string[] {
  return routes.flatMap(({ file, generatedImport, path }) => {
    const problems: string[] = []
    if (
      !generatedRouteTree.includes(`from '${generatedImport}'`) &&
      !generatedRouteTree.includes(`from "${generatedImport}"`)
    ) {
      problems.push(`${file}: missing generated import ${generatedImport}`)
    }
    if (!includesTypedRoute(generatedRouteTree, path)) {
      problems.push(`${file}: missing generated typed route ${path}`)
    }
    return problems
  })
}

describe('P0-01 public API route generation baseline', () => {
  it('binds the registry handler to its committed public path', () => {
    const registryRoute = readFileSync('src/routes/api.v1.registry.ts', 'utf8')

    expect(registryRoute).toContain("createFileRoute('/api/v1/registry')")
  })

  it('keeps every committed public API route in the generated typed route tree', () => {
    const routes = publicApiRoutes()
    const generatedRouteTree = readFileSync(routeTreePath, 'utf8')
    const problems = registrationProblems(routes, generatedRouteTree)

    expect(routes.length).toBeGreaterThan(10)
    expect(
      problems,
      `TanStack route generation is stale. Regenerate ${routeTreePath} before committing:\n${problems.join('\n')}`,
    ).toEqual([])
  })

  it('detects a generated tree that silently omits the registry route', () => {
    const registry = publicApiRoutes().find(({ path }) => path === '/api/v1/registry')
    expect(registry).toBeDefined()
    if (registry === undefined) throw new Error('Registry route source is missing')

    const problems = registrationProblems([registry], '/* generated tree without registry */')

    expect(problems).toEqual([
      'src/routes/api.v1.registry.ts: missing generated import ./routes/api.v1.registry',
      'src/routes/api.v1.registry.ts: missing generated typed route /api/v1/registry',
    ])
  })
})
