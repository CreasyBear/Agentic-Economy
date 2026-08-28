import { readFileSync } from 'node:fs'
import { globSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import {
  bundledCliInputs,
  legacyInputs,
  legacyModuleImport,
} from './support/operation-product-dependency-closure'

const operationProductEntrypoints = [
  ...globSync('tools/ae/**/*.ts'),
  'src/routes/mcp.ts',
  'src/lib/server/mcp-api.ts',
  ...globSync('src/routes/api.v1.market-operations*.ts'),
  ...globSync('src/routes/api.v1.operations*.ts'),
].sort()

const retiredRuntimeNoun = /CustomerRequest|Customer Request|WorkTree|Work Tree/u
describe('Operation product legacy independence', () => {
  it('keeps CLI, MCP, and Operation HTTP entrypoints independent of the legacy stack', async () => {
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

    const cliInputs = await bundledCliInputs('tools/ae/cli.ts')
    expect(cliInputs).toContain('tools/ae/cli.ts')
    expect(legacyInputs(cliInputs)).toEqual([])
  })

  it('keeps canonical action-invocation entrypoints free of retired runtime nouns', () => {
    expect([
      'src/modules/action-invocation/runtime.ts',
      'src/modules/action-invocation/public.ts',
      'src/modules/action-invocation/index.ts',
    ].filter((path) => retiredRuntimeNoun.test(readFileSync(path, 'utf8')))).toEqual([])
  })

  it('keeps the retired legacy-dynamic bundle deleted with zero imports anywhere', () => {
    expect(globSync('src/modules/capability-execution/legacy-dynamic/**')).toEqual([])
    const sources = [
      ...globSync('src/**/*.ts'),
      ...globSync('convex/**/*.ts'),
      ...globSync('tests/**/*.ts'),
      ...globSync('tools/**/*.ts'),
    ].filter((path) => !path.includes('_generated') && !path.includes('routeTree'))
    expect(sources.filter((path) => (
      /legacy-dynamic|DynamicPublished|PaidOperationSemantics|published_operation_succeeded|published_operation_refused/u
        .test(readFileSync(path, 'utf8')))
    ).sort()).toEqual([
      'src/modules/capability-execution/invocation-material.ts',
      'src/modules/capability-execution/invocation-worker/recovery/loading.ts',
      'tests/imports/action-invocation-host-boundaries.test.ts',
      'tests/imports/operation-product-legacy-independence.test.ts',
      'tests/unit/capability-execution/legacy-result-parity.test.ts',
    ])
  })
})
