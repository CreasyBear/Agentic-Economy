import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import {
  isQuarantineSurfaceRetired,
  isQuarantineWrite,
  QUARANTINE_FAMILY_ACTION_PREFIXES,
  QUARANTINE_READ_KEEP_ACTION_ID,
  QUARANTINE_SURFACE_RETIRED_CODE,
  QUARANTINE_WRITES_FROZEN_CODE,
  quarantineSurfaceRetiredProblemInput,
  quarantineWriteProblemInput,
  quarantineWriteServerError,
} from '@/modules/product-frontier/quarantine-write-admission'
import { findAction, listActions } from '@/modules/actions'
import { actionToToolContract } from '@/modules/actions/tool-contract'

const productFrontierManifest = JSON.parse(
  readFileSync(
    '.planning/evidence/product-frontier-baseline/product-frontier-manifest.json',
    'utf8',
  ),
) as { quarantineFamilies: readonly { actionIds: readonly string[] }[] }

describe('quarantine write admission', () => {
  it('treats quarantineFamilies mutating action ids as frozen writes', () => {
    const families = productFrontierManifest.quarantineFamilies
    if (!Array.isArray(families)) throw new Error('quarantine_families_missing')
    for (const family of families) {
      if (typeof family !== 'object' || family === null) continue
      const actionIds = Reflect.get(family, 'actionIds')
      if (!Array.isArray(actionIds)) continue
      for (const actionId of actionIds) {
        if (typeof actionId !== 'string') continue
        expect(QUARANTINE_FAMILY_ACTION_PREFIXES.some((prefix) => actionId.startsWith(prefix))).toBe(true)
        const action = findAction(actionId)
        expect(action, actionId).toBeDefined()
        if (action === undefined) continue
        expect(isQuarantineWrite(actionId, action.readOnly)).toBe(!action.readOnly)
      }
    }
    expect(isQuarantineWrite('operation.invoke', false)).toBe(false)
    expect(isQuarantineWrite('registry.operations.search', true)).toBe(false)
  })

  it('projects RFC 9457 problem input without HTTP 410', () => {
    const problem = quarantineWriteProblemInput('customerRequest.run')
    expect(problem.status).toBe(403)
    expect(problem.status).not.toBe(410)
    expect(problem.code).toBe('quarantine_writes_frozen')
    expect(problem.kind).toBe('FAILED_PRECONDITION')
    expect(problem.retryable).toBe(false)
    expect(listActions().some((action) => action.id === 'customerRequest.run')).toBe(false)
    expect(findAction('customerRequest.run')).toBeDefined()
  })

  it('tombstones Study inspect execution through the tool contract and keeps inquiry customer-record', async () => {
    const start = findAction('study.start')
    const inspect = findAction('study.inspect')
    if (start === undefined || inspect === undefined) throw new Error('study_actions_missing')
    const frozen = actionToToolContract(start)
    await expect(frozen.execute({ input: {}, context: { request: new Request('https://ae.test') } }))
      .rejects.toThrow(QUARANTINE_SURFACE_RETIRED_CODE)
    const inspectContract = actionToToolContract(inspect)
    await expect(inspectContract.execute({ input: {}, context: { request: new Request('https://ae.test') } }))
      .rejects.toThrow(QUARANTINE_SURFACE_RETIRED_CODE)
    expect(inspect.readOnly).toBe(true)
    expect(isQuarantineWrite(inspect.id, inspect.readOnly)).toBe(false)
    expect(isQuarantineSurfaceRetired(inspect.id)).toBe(true)
    expect(isQuarantineSurfaceRetired(QUARANTINE_READ_KEEP_ACTION_ID)).toBe(false)
  })

  it('projects HTTP/MCP tombstones as RFC 9457 410 without a GONE kind', () => {
    const problem = quarantineSurfaceRetiredProblemInput('customerRequest.run')
    expect(problem.status).toBe(410)
    expect(problem.kind).toBe('NOT_FOUND')
    expect(problem.code).toBe('quarantine_surface_retired')
    expect(problem.retryable).toBe(false)
    expect(problem.instance).toBe('customerRequest.run')
  })

  it('projects a typed server-fn error without HTTP 410', () => {
    const error = quarantineWriteServerError('inquiry.submit')
    expect(error).toEqual({
      kind: 'error',
      code: QUARANTINE_WRITES_FROZEN_CODE,
      retryable: false,
      reason:
        'This quarantined surface no longer accepts writes. Use /api/v1/operations/call for paid market work.',
    })
    expect(quarantineWriteProblemInput('inquiry.submit').status).toBe(403)
  })
})
