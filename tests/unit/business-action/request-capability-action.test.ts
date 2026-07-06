import { describe, expect, it } from 'vitest'

import { requestCapabilityAction } from '@/modules/business-action/business-action.actions'

describe('businessAction.requestCapability action contract', () => {
  it('keeps the reserve-booking proposal action out of quiet agent tools', () => {
    expect(requestCapabilityAction.id).toBe('businessAction.requestCapability')
    expect(requestCapabilityAction.readOnly).toBe(false)
    expect(requestCapabilityAction.surfaces).toEqual(['agentJson'])

    const boundaryText = requestCapabilityAction.boundaries.join(' ').toLowerCase()
    expect(boundaryText).toContain('proposal only')
    expect(boundaryText).toContain('owner must approve')
    expect(boundaryText).toContain('never books')
    expect(boundaryText).toContain('charges')
    expect(boundaryText).toContain('dispatches')
    expect(boundaryText).toContain('confirms')
  })

  it('refuses an agent request payload that omits the target business id', () => {
    const missingBusiness = requestCapabilityAction.schema.safeParse({})
    expect(missingBusiness.success).toBe(false)
    if (!missingBusiness.success) {
      expect(missingBusiness.error.issues.map((issue) => issue.path.join('.'))).toContain('businessId')
    }

    expect(requestCapabilityAction.schema.safeParse({ businessId: 'business:test-x' }).success).toBe(true)
  })
})
