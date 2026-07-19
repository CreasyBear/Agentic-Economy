import { describe, expect, it } from 'vitest'

import {
  SANDBOX_WORKFLOW_COHORTS,
  SANDBOX_WORKFLOW_PROVIDER_PROFILES,
  sandboxWorkflowCapabilityContractDocument,
} from '@/modules/sandbox-supply/workflow-cohorts'

describe('sandbox workflow cohorts', () => {
  it('defines six economically distinct workflows with typed composition', () => {
    expect(SANDBOX_WORKFLOW_COHORTS.map(({ cohortId }) => cohortId)).toEqual([
      'procurement',
      'itinerary',
      'public-event-activation',
      'journey-management',
      'recurring-operations',
      'exception-coordination',
    ])

    for (const cohort of SANDBOX_WORKFLOW_COHORTS) {
      expect(cohort.steps).toHaveLength(cohort.cohortId === 'itinerary' ? 7 : 3)
      expect(new Set(cohort.steps.map(({ businessName }) => businessName))).toHaveLength(cohort.steps.length)
      expect(cohort.steps.filter(({ completionEvidence }) => completionEvidence)).toHaveLength(1)
      expect(cohort.steps.at(-1)?.completionEvidence).toBe(true)
      expect(cohort.steps.at(-1)?.recovery).toBe('reconcile_required')
      expect(cohort.curveballs.length).toBeGreaterThanOrEqual(3)

      if (cohort.cohortId === 'itinerary') continue
      for (let index = 1; index < cohort.steps.length; index += 1) {
        expect(cohort.steps[index]?.inputSemanticIdentity)
          .toBe(cohort.steps[index - 1]?.outputSemanticIdentity)
      }
    }

    const itinerary = SANDBOX_WORKFLOW_COHORTS.find(({ cohortId }) => cohortId === 'itinerary')
    const builder = itinerary?.steps.find(({ providerKey }) => providerKey === 'itinerary-builder')
    expect(builder?.optionalInputs).toEqual([
      { field: 'transferPlan', semanticIdentity: 'ae.transfer-plan:v1' },
      { field: 'hotelPlan', semanticIdentity: 'ae.hotel-plan:v1' },
      { field: 'meetingSchedule', semanticIdentity: 'ae.meeting-schedule:v1' },
      { field: 'dinnerPlan', semanticIdentity: 'ae.dinner-plan:v1' },
    ])
  })

  it('keeps every completion boundary short of unproven real-world fulfilment', () => {
    const claims = SANDBOX_WORKFLOW_COHORTS
      .flatMap((cohort) => [cohort.completionBoundary, cohort.prohibitedClaim])
      .join(' ')
      .toLowerCase()

    expect(claims).toContain('no order or payment')
    expect(claims).toContain('no reservation or ticketing')
    expect(claims).toContain('no application, commitment, certification, or approval')
    expect(claims).toContain('no hidden operator coordination')
    expect(claims).toContain('no fabricated field completion')
    expect(claims).toContain('no claim that recovery actions occurred')
  })

  it('requires the packaging specification that changes which procurement options are viable', () => {
    const profile = SANDBOX_WORKFLOW_PROVIDER_PROFILES['procurement-brief']
    const contract = sandboxWorkflowCapabilityContractDocument('procurement-brief')
    if (profile === undefined) throw new Error('procurement workflow profile missing')

    expect(profile.contractVersion).toBe(2)
    expect(contract.inputSchema).toMatchObject({
      required: ['request', 'packageDimensions'],
      properties: {
        request: { type: 'string', minLength: 1 },
        packageDimensions: {
          type: 'string',
          pattern: expect.stringContaining('[xX×]'),
        },
      },
    })
    expect(contract.customerAnnotations).toEqual(expect.arrayContaining([
      expect.objectContaining({
        document: 'input',
        pointer: '/packageDimensions',
        label: 'Internal carton dimensions',
        role: 'constraint',
        inference: 'allowed',
      }),
    ]))
  })
})
