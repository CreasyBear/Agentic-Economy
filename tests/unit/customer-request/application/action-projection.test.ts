import { describe, expect, it } from 'vitest'

import {
  toActionResult,
  withRestoredRequest,
  writableView,
} from '@/modules/customer-request/application/public'
import {
  projectNeedsAttention,
  type CustomerRequestView,
} from '@/modules/customer-request/customer-projection'

const baseView = projectNeedsAttention({
  requestRef: 'req:1',
  revision: 2,
  summary: 'Needs attention',
})

describe('customer-request action-projection', () => {
  it('writableView returns a plain mutable request shape', () => {
    const view = writableView(baseView)
    expect(view.kind).toBe('request')
    expect(view.requestRef).toBe('req:1')
    expect(view.revision).toBe(2)
    expect(view.state).toBe('needs_attention')
    expect(view.options).toEqual([])
    expect(Array.isArray(view.missingFields)).toBe(true)
    expect(Array.isArray(view.criteria)).toBe(true)
    view.summary = 'mutated'
    expect(view.summary).toBe('mutated')
  })

  it('writableView expands legacy string activity cancellation', () => {
    const withActivity: CustomerRequestView = {
      ...baseView,
      activity: {
        actor: 'ae',
        certainty: 'pending',
        updatedAt: 1_000,
        retry: 'not_needed',
        cancellation: 'available_before_next_step',
        safeNextAction: 'wait_for_evidence',
      },
    }
    const view = writableView(withActivity)
    expect(view.activity?.cancellation).toEqual({
      state: 'available',
      until: 'before_next_step_release',
      releaseMayStartAt: 1_000,
    })
  })

  it('writableView expands complete cancellation string', () => {
    const withActivity: CustomerRequestView = {
      ...baseView,
      activity: {
        actor: 'none',
        certainty: 'confirmed',
        updatedAt: 2_000,
        retry: 'not_needed',
        cancellation: 'complete',
        safeNextAction: 'none',
      },
    }
    const view = writableView(withActivity)
    expect(view.activity?.cancellation).toEqual({
      state: 'not_available',
      reason: 'request_finished',
      changedAt: 2_000,
    })
  })

  it('writableView clones option nests', () => {
    const withOption: CustomerRequestView = {
      ...baseView,
      options: [{
        optionRef: 'opt:1',
        business: { name: 'Ride Co' },
        expectedCost: { currency: 'USD', amountMinor: 100 },
        maximumCost: { currency: 'USD', amountMinor: 200 },
        expectedLatencyMs: 50,
        priceComponents: [{ label: 'base', amountMinor: 100 }],
        comparableOutputs: [{ label: 'seats', value: 1 }],
        materialTerms: ['term-a'],
        cancellation: { kind: 'supported', summary: 'Free cancel' },
        expiresAt: 9_000,
        provenance: { kind: 'provider_assertion', validUntil: 9_000 },
        commercialInfluence: { status: 'none', summary: 'No influence' },
      }],
    }
    const view = writableView(withOption)
    expect(view.options).toHaveLength(1)
    expect(view.options[0]?.business).toEqual({ name: 'Ride Co' })
    view.options[0]!.business.name = 'mutated'
    expect(withOption.options[0]?.business.name).toBe('Ride Co')
  })

  it('toActionResult passes through conflict and refused', () => {
    expect(toActionResult({ kind: 'conflict', requestRef: 'req:1', reason: 'revision_changed' }))
      .toEqual({ kind: 'conflict', requestRef: 'req:1', reason: 'revision_changed' })
    expect(toActionResult({ kind: 'refused', reason: 'request_not_found' }))
      .toEqual({ kind: 'refused', reason: 'request_not_found' })
  })

  it('toActionResult writable-projects request views', () => {
    const result = toActionResult(baseView)
    expect(result.kind).toBe('request')
    if (result.kind === 'request') {
      expect(result.requestRef).toBe('req:1')
      result.summary = 'mutated'
      expect(result.summary).toBe('mutated')
    }
  })

  it('withRestoredRequest adds recovery on request results', () => {
    const restored = withRestoredRequest(baseView, 5_000)
    expect(restored.kind).toBe('request')
    if (restored.kind === 'request') {
      expect(restored.recovery).toEqual({
        state: 'restored',
        reason: 'request_restored',
        restoredAt: 5_000,
        workRestarted: false,
      })
    }
  })

  it('withRestoredRequest leaves non-request results unchanged', () => {
    const refused = { kind: 'refused' as const, reason: 'authentication_required' as const }
    expect(withRestoredRequest(refused, 1)).toEqual(refused)
  })
})
