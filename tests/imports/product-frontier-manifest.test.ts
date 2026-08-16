import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import {
  listActions,
  listMcpActions,
  mcpToolName,
} from '@/modules/actions'
import { ANSWER_EVAL_COVERAGE_REQUIREMENTS } from '../../eval/answer/lib/cases'

type ProductFrontierManifest = Readonly<{
  schemaVersion: string
  requiredActionIds: readonly string[]
  protectedActionIds: readonly string[]
  requiredMcpTools: readonly Readonly<{
    id: string
    toolName: string
    readOnly: boolean
  }>[]
  evalCoverageTags: readonly string[]
}>

const PRODUCT_FRONTIER_MANIFEST_VERSION = 'ae-product-frontier:v1'

const productFrontierManifest = JSON.parse(
  readFileSync(
    '.planning/evidence/product-frontier-baseline/product-frontier-manifest.json',
    'utf8',
  ),
) as ProductFrontierManifest

describe('product frontier manifest', () => {
  it('passes the structural positive frontier floor', () => {
    const output = execFileSync(process.execPath, ['tools/release/verify-product-frontier.mjs'], {
      encoding: 'utf8',
    })
    expect(JSON.parse(output)).toEqual({ ok: true, errors: [] })
  })

  it('keeps the live action registry at or above the frozen frontier floor', () => {
    expect(productFrontierManifest.schemaVersion).toBe(PRODUCT_FRONTIER_MANIFEST_VERSION)
    const liveIds = listActions().map((action) => action.id)
    expect(liveIds).toEqual(productFrontierManifest.requiredActionIds)
    for (const id of productFrontierManifest.protectedActionIds) {
      expect(liveIds).toContain(id)
    }
  })

  it('keeps MCP tool names identical to the frozen frontier descriptors', () => {
    const live = listMcpActions().map((action) => ({
      id: action.id,
      toolName: mcpToolName(action),
      readOnly: action.readOnly,
    }))
    expect(live).toEqual(productFrontierManifest.requiredMcpTools)
  })

  it('keeps Answer eval coverage tags at the frontier floor', () => {
    expect(ANSWER_EVAL_COVERAGE_REQUIREMENTS.map((requirement) => requirement.tag)).toEqual(
      productFrontierManifest.evalCoverageTags,
    )
  })

  it('refuses hollow green by requiring Study and WorkTree remain registered', () => {
    expect(findActionId('study.start')).toBe('study.start')
    expect(findActionId('study.inspect')).toBe('study.inspect')
    expect(findActionId('workTree.create')).toBe('workTree.create')
    expect(findActionId('operation.invoke')).toBe('operation.invoke')
  })
})

function findActionId(id: string): string | undefined {
  return listActions().find((action) => action.id === id)?.id
}
