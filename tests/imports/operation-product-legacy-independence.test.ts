import { readFileSync } from 'node:fs'
import { globSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const operationProductEntrypoints = [
  ...globSync('tools/ae/**/*.ts'),
  'src/routes/mcp.ts',
  'src/lib/server/mcp-api.ts',
  ...globSync('src/routes/api.v1.market-operations*.ts'),
  ...globSync('src/routes/api.v1.operations*.ts'),
].sort()

const legacyModuleImport = /modules\/(?:answer(?:-thread)?|external-run|harness)(?:\/|['"])/u

describe('Operation product legacy independence', () => {
  it('keeps CLI, MCP, and Operation HTTP entrypoints independent of the legacy stack', () => {
    expect(operationProductEntrypoints).toEqual(expect.arrayContaining([
      'tools/ae/cli.ts',
      'src/routes/mcp.ts',
      'src/lib/server/mcp-api.ts',
      'src/routes/api.v1.market-operations.search.ts',
      'src/routes/api.v1.operations.call.ts',
    ]))

    expect(operationProductEntrypoints.filter((path) => (
      legacyModuleImport.test(readFileSync(path, 'utf8'))
    ))).toEqual([])
  })
})
