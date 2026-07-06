import { describe, expect, it } from 'vitest'

import { findAction, listAgentToolActions } from '@/modules/actions'

describe('demand.capture action', () => {
  it('is registered for UI/HTTP surfaces but not agent tools', () => {
    const action = findAction('demand.capture')

    expect(action).toBeDefined()
    expect(action?.surfaces).toEqual(['ui', 'http'])
    expect(listAgentToolActions().map((candidate) => candidate.id)).not.toContain('demand.capture')
  })

  it.each([
    { name: 'empty service', service: '' },
    { name: 'blank service', service: '   ' },
  ])('rejects $name', ({ service }) => {
    const action = findAction('demand.capture')
    if (!action) {
      throw new Error('demand.capture action is not registered')
    }

    const result = action.schema.safeParse({
      service,
      suburb: 'Fitzroy',
    })

    expect(result.success).toBe(false)
  })

  it('accepts valid input and trims service and suburb', () => {
    const action = findAction('demand.capture')
    if (!action) {
      throw new Error('demand.capture action is not registered')
    }

    const result = action.schema.safeParse({
      service: '  roof repair  ',
      suburb: '  Brunswick  ',
      note: '  leaking after rain  ',
      queryText: '  roofers brunswick  ',
    })

    expect(result.success).toBe(true)
    expect(result.data).toEqual({
      service: 'roof repair',
      suburb: 'Brunswick',
      note: 'leaking after rain',
      queryText: 'roofers brunswick',
    })
  })
})
