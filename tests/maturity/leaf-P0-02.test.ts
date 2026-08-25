import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { listMcpActionDescriptors } from '@/modules/actions'
import { OPERATION_INVOKE_ROUTE_CONTRACT } from '@/modules/capability-execution/operation-invoke-entry'
import { COMMANDS } from '../../tools/ae/commands/manifest'

type HttpEntry = Readonly<{
  id: string
  host: 'tanstack' | 'convex'
  methods: readonly string[]
  path: string
  routerPath: string
  owner: string
  source: string
}>

type McpEntry = Readonly<{ actionId: string; toolName: string; owner: string }>
type CliEntry = Readonly<{ command: string; owner: string; source: string }>
type Inventory = Readonly<{
  canonicalInvocationPath: string
  excludedInfrastructure: readonly Readonly<{ source: string; reason: string }>[]
  http: readonly HttpEntry[]
  mcp: readonly McpEntry[]
  cli: readonly CliEntry[]
}>

const repositoryRoot = resolve(import.meta.dirname, '../..')
const inventoryPath = resolve(
  repositoryRoot,
  '.planning/maturity-execution/contracts/public-surface-inventory.json',
)
const inventory = JSON.parse(readFileSync(inventoryPath, 'utf8')) as Inventory
const canonicalOwners = new Set([
  'actions',
  'agent-access',
  'answer',
  'capability-execution',
  'capability-supply',
  'discovery',
  'market',
  'money',
  'platform-operations',
  'registry',
])

function routeFiles(directory: string): readonly string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = resolve(directory, entry.name)
    if (entry.isDirectory()) return routeFiles(absolute)
    return [absolute]
  })
}

function repositoryPath(absolute: string): string {
  return absolute.slice(repositoryRoot.length + 1)
}

function unique(values: readonly string[]): boolean {
  return new Set(values).size === values.length
}

describe('P0-02 public surface inventory', () => {
  it('assigns one owner to every implemented TanStack and Convex HTTP contract', () => {
    const excluded = new Set(inventory.excludedInfrastructure.map(({ source }) => source))
    const discoveredTanStack = routeFiles(resolve(repositoryRoot, 'src/routes'))
      .filter((file) => readFileSync(file, 'utf8').match(/handlers\s*:/u) !== null)
      .map(repositoryPath)
      .filter((file) => !excluded.has(file))
      .sort()
    const inventoriedTanStack = inventory.http
      .filter(({ host }) => host === 'tanstack')
      .map(({ source }) => source)
      .sort()

    expect(inventoriedTanStack).toEqual(discoveredTanStack)
    expect(inventory.http.filter(({ host }) => host === 'convex').map(({ source }) => source))
      .toEqual(['convex/http.ts'])
    expect(unique(inventory.http.map(({ id }) => id))).toBe(true)
    expect(unique(inventory.http.flatMap(({ methods, path }) => methods.map((method) => `${method} ${path}`))))
      .toBe(true)

    for (const route of inventory.http) {
      expect(canonicalOwners.has(route.owner), `${route.id} has no canonical owner`).toBe(true)
      const source = readFileSync(resolve(repositoryRoot, route.source), 'utf8')
      if (route.host === 'tanstack') {
        expect(source).toContain(`createFileRoute('${route.routerPath}')`)
      } else {
        expect(source).toMatch(new RegExp(`path:\\s*['\"]${route.routerPath.replaceAll('/', '\\/')}['\"]`, 'u'))
      }
    }
  })

  it('assigns one owner to every MCP tool projected from the action registry', () => {
    const actual = listMcpActionDescriptors()
      .map(({ id: actionId, toolName }) => ({ actionId, toolName }))
      .sort((left, right) => left.actionId.localeCompare(right.actionId))
    const expected = inventory.mcp
      .map(({ actionId, toolName }) => ({ actionId, toolName }))
      .sort((left, right) => left.actionId.localeCompare(right.actionId))

    expect(actual).toEqual(expected)
    expect(unique(inventory.mcp.map(({ actionId }) => actionId))).toBe(true)
    expect(unique(inventory.mcp.map(({ toolName }) => toolName))).toBe(true)
    expect(inventory.mcp.every(({ owner }) => canonicalOwners.has(owner))).toBe(true)
  })

  it('assigns one owner to every dispatched root CLI command', () => {
    expect(inventory.cli.map(({ command }) => command).sort()).toEqual(Object.keys(COMMANDS).sort())
    expect(unique(inventory.cli.map(({ command }) => command))).toBe(true)
    for (const command of inventory.cli) {
      expect(canonicalOwners.has(command.owner), `${command.command} has no canonical owner`).toBe(true)
      expect(readFileSync(resolve(repositoryRoot, command.source), 'utf8').length).toBeGreaterThan(0)
    }
  })

  it('keeps call canonical and rejects execute as a current HTTP or ADR contract', () => {
    expect(inventory.canonicalInvocationPath).toBe('/api/v1/operations/call')
    expect(OPERATION_INVOKE_ROUTE_CONTRACT.invoke.path).toBe(inventory.canonicalInvocationPath)
    expect(inventory.http.some(({ path }) => path === '/api/v1/operations/execute')).toBe(false)

    const currentAdrs = routeFiles(resolve(repositoryRoot, '.planning/adr'))
      .filter((file) => file.endsWith('.md'))
    for (const document of currentAdrs) {
      expect(readFileSync(document, 'utf8'), repositoryPath(document))
        .not.toContain('/api/v1/operations/execute')
    }
    expect(readFileSync(resolve(repositoryRoot, '.planning/maturity-execution/PLAN.md'), 'utf8'))
      .not.toContain('/api/v1/operations/execute')
  })
})
