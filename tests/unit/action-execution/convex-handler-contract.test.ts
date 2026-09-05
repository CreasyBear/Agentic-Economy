import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const handler = readFileSync('convex/actionExecutionControl.ts', 'utf8')
const durableContract = readFileSync(
  'src/modules/action-execution/internal/durable-contracts.ts',
  'utf8',
)
const moduleSchema = readFileSync(
  'src/modules/action-execution/internal/convex-schema.ts',
  'utf8',
)

describe('private Convex Action Execution transaction contract', () => {
  it('accepts the module-owned current attempt write and replaces its current projection', () => {
    expect(durableContract).toContain('currentAttemptWrite?: DurableAttemptRow')
    expect(handler).toContain('currentAttemptWrite: v.optional(attemptRow)')
    expect(handler).toContain("withIndex('by_executionRef_and_attemptRef'")
    expect(handler).toContain('ctx.db.replace(existingAttempt._id, attemptWrite)')
    expect(handler).not.toContain('newAttempt')

    const immutableRefusal = handler.indexOf("code: 'command_identity_conflict'")
    const monotonicRefusal = handler.indexOf(
      'args.row.executionVersion <= current.executionVersion',
    )
    const controlWrite = handler.indexOf("ctx.db.insert('actionExecutionControls'")
    expect(immutableRefusal).toBeGreaterThan(-1)
    expect(monotonicRefusal).toBeGreaterThan(immutableRefusal)
    expect(controlWrite).toBeGreaterThan(monotonicRefusal)
  })

  it('uses the shared transition validator and appends history without dropping it', () => {
    expect(moduleSchema).toContain('export const attemptTransitionValue = v.object({')
    expect(moduleSchema).toContain('attemptTransition: v.optional(attemptTransitionValue)')
    expect(handler).toContain('attemptTransitionValue,')
    expect(handler).toContain('attemptTransition: v.optional(attemptTransitionValue)')
    expect(handler).toMatch(/ctx\.db\.insert\('actionExecutionHistory',\s*\{\s*\.\.\.args\.history,/u)
  })

  it('exposes exact indexed reads required by the durable adapter', () => {
    expect(handler).toContain('export const readAttempt = internalQuery({')
    expect(handler).toContain('export const readHistoryCommand = internalQuery({')
    expect(handler).toContain("withIndex('by_executionRef_and_commandId'")
  })
})
