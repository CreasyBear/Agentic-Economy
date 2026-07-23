import { describe, expect, it } from 'vitest'

import { planAnswerTurn } from '@/modules/answer-thread/internal/answer-response-planner'
import { collectLatestColdStartClarification } from '@/modules/answer-thread/internal/answer-turn-finalization'
import { buildColdStartRetrievalSnapshot } from '@/modules/answer-thread/internal/turns/retrieval-first'

const goldenQuery =
  'I run a small startup in Perth and need a simple website. I would prefer someone local or an affordable freelancer. Who should I consider, and roughly what should I expect to pay?'

describe('answer response planner', () => {
  it('asks for the missing service before searching locator-only broad queries', () => {
    for (const query of ['show me everything near me', "what's available around here"]) {
      const plan = planAnswerTurn({
        query,
        priorTurnsCount: 0,
        searchContext: undefined,
      })

      expect(plan).toMatchObject({
        mode: 'clarify',
        reason: 'missing_service',
        providerBudget: { searchLimit: 0, visibleLimit: 0 },
        toolPolicy: { kind: 'none' },
      })
    }
  })

  it('reflects only registered website constraints and asks one decisive closed question', () => {
    const plan = planAnswerTurn({
      query: goldenQuery,
      priorTurnsCount: 0,
      searchContext: undefined,
    })

    expect(plan).toMatchObject({
      mode: 'clarify',
      reason: 'website_function',
      toolPolicy: { kind: 'none' },
      snapshot: {
        decisionSupport: {
          kind: 'cold_start_decision_support',
          stage: 'clarification',
          confirmedConstraintIds: [
            'website:v1:simple',
            'website:v1:small_startup',
            'website:v1:perth_local_preference',
            'website:v1:affordability_preference',
            'website:v1:indicative_price_requested',
          ],
          clarification: {
            id: 'website:v1:function',
            choices: [
              { id: 'brochure_enquiries', label: 'Information and enquiries' },
              { id: 'transactional', label: 'Customers need to buy, book or log in' },
              { id: 'im_not_sure', label: 'I’m not sure' },
            ],
          },
        },
      },
    })
    expect(JSON.stringify(plan)).not.toMatch(/offering|revision|shortlist|priority/i)
  })

  it.each([
    ['information and enquiries', 'brochure_enquiries'],
    ['customers need to buy, book or log in', 'transactional'],
    ["I'm not sure", 'im_not_sure'],
  ] as const)('accepts only the closed website function choice %s', (choice, choiceId) => {
    const first = planAnswerTurn({
      query: goldenQuery,
      priorTurnsCount: 0,
      searchContext: undefined,
    })
    if (first.mode !== 'clarify' || first.snapshot.decisionSupport?.stage !== 'clarification') {
      throw new Error('expected website clarification')
    }
    const plan = planAnswerTurn({
      query: choice,
      priorTurnsCount: 1,
      searchContext: undefined,
      priorDecisionSupport: first.snapshot.decisionSupport,
    })

    expect(plan).toMatchObject({
      mode: 'answer',
      coldStart: {
        confirmedChoiceId: choiceId,
        confirmedConstraintIds: expect.arrayContaining([
          'website:v1:perth_local_preference',
          'website:v1:affordability_preference',
        ]),
      },
    })
  })

  it('recovers the prior clarification from durable evidence before accepting a choice-only turn', () => {
    const first = planAnswerTurn({
      query: goldenQuery,
      priorTurnsCount: 0,
      searchContext: undefined,
    })
    if (first.mode !== 'clarify' || first.snapshot.decisionSupport?.stage !== 'clarification') {
      throw new Error('expected website clarification')
    }
    const priorDecisionSupport = collectLatestColdStartClarification([{
      query: goldenQuery,
      seq: 1,
      status: 'complete',
      evidenceJson: JSON.stringify({
        providers: [],
        allowedSlugs: [],
        agentJsonUrl: '',
        decisionSupport: first.snapshot.decisionSupport,
      }),
    }])

    expect(planAnswerTurn({
      query: 'Information and enquiries',
      priorTurnsCount: 1,
      searchContext: undefined,
      priorDecisionSupport,
    })).toMatchObject({
      mode: 'answer',
      coldStart: {
        confirmedChoiceId: 'brochure_enquiries',
        registeredSearchQuery: 'website Perth',
      },
    })
  })

  it('does not silently relax stated preferences when retrieval returns no exact match', () => {
    const snapshot = buildColdStartRetrievalSnapshot({
      query: `${goldenQuery} Information and enquiries.`,
      confirmedChoiceId: 'brochure_enquiries',
      confirmedConstraintIds: [
        'website:v1:simple',
        'website:v1:small_startup',
        'website:v1:perth_local_preference',
        'website:v1:affordability_preference',
        'website:v1:indicative_price_requested',
      ],
      sourceDecision: {
        outcome: 'constraints_too_narrow',
        searchedRegisteredSupplyCount: 2,
        relaxableConstraintId: 'website:v1:perth_local_preference',
        prices: [],
      },
    })

    expect(snapshot.decisionSupport).toMatchObject({
      outcome: 'constraints_too_narrow',
      confirmedConstraintIds: expect.arrayContaining([
        'website:v1:perth_local_preference',
        'website:v1:affordability_preference',
      ]),
      safeContinuations: [{
        kind: 'relax_named_preference',
        constraintId: 'website:v1:perth_local_preference',
        label: 'I’m flexible',
      }],
    })
    expect(snapshot.decisionSupport?.stage).toBe('result')
    if (snapshot.decisionSupport?.stage !== 'result') {
      throw new Error('expected result decision support')
    }
    expect(snapshot.decisionSupport.posture).toContain('local preference')
  })
})
