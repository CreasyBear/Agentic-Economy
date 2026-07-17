import { describe, expect, it } from 'vitest'

import {
  ACTION_BUNDLE_CASES,
  evaluateActionBundles,
} from '../../eval/product-foundry/action-bundles'

describe('product foundry action bundles', () => {
  it('decomposes five contrasting outcomes into actor-owned tasks', () => {
    expect(ACTION_BUNDLE_CASES).toHaveLength(5)

    for (const bundle of ACTION_BUNDLE_CASES) {
      expect(bundle.tasks.length).toBeGreaterThanOrEqual(5)
      expect(bundle.tasks.every((task) => task.actor.length > 0)).toBe(true)
      expect(bundle.tasks.every((task) => task.input.length > 0)).toBe(true)
      expect(bundle.tasks.every((task) => task.output.length > 0)).toBe(true)
      expect(bundle.tasks.every((task) => task.boundary.length > 0)).toBe(true)
    }
  })

  it('finds repeated action families without treating them as kernel primitives', () => {
    const result = evaluateActionBundles(ACTION_BUNDLE_CASES)
    const discover = result.actions.find((action) => action.action === 'discover_businesses')
    const quote = result.actions.find((action) => action.action === 'request_quote')

    expect(discover?.workflowCount).toBeGreaterThanOrEqual(4)
    expect(discover?.disposition).toBe('candidate_reusable_action')
    expect(quote?.workflowCount).toBeGreaterThanOrEqual(3)
    expect(result.kernelPromotions).toEqual([])
  })

  it('identifies the smallest endpoint-family hypotheses from repeated work', () => {
    const result = evaluateActionBundles(ACTION_BUNDLE_CASES)

    expect(result.endpointHypotheses.map((endpoint) => endpoint.family)).toEqual(
      expect.arrayContaining([
        'catalog',
        'query',
        'quote',
        'commit',
        'coordinate',
        'inspect',
      ]),
    )
  })

  it('keeps current support separate from target and missing actions', () => {
    const result = evaluateActionBundles(ACTION_BUNDLE_CASES)

    expect(result.coverage.current).toBeGreaterThan(0)
    expect(result.coverage.target).toBeGreaterThan(0)
    expect(result.coverage.missing).toBeGreaterThan(0)
    expect(result.coverage.human_or_external).toBeGreaterThan(0)
  })

  it('uses direct booking as a negative control', () => {
    const direct = ACTION_BUNDLE_CASES.find((bundle) => bundle.id === 'direct-booking')
    expect(direct?.orchestrationDecision).toBe('direct_provider_path')
    expect(direct?.tasks.some((task) => task.action === 'coordinate_dependencies')).toBe(false)
  })
})
