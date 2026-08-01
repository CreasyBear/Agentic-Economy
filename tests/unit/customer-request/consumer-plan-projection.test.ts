import { describe, expect, it } from 'vitest'

import {
  projectConsumerPlan,
  type ConsumerSupplyOption,
} from '@/modules/customer-request/application/public'
import type { PreviewCustomerRequest } from '@/modules/customer-request/application/interpret-compile/preview'

const publishedPrice = {
  kind: 'published' as const,
  published: { kind: 'fixed' as const, currency: 'AUD', amountMinor: 12000, unit: 'job' as const, taxTreatment: 'inclusive' as const },
  summary: 'From $120',
}

function preview(steps: PreviewCustomerRequest['steps'], expiresAt = 2_000): PreviewCustomerRequest {
  return {
    kind: 'preview',
    destination: { label: 'Dental check-up in Adelaide', request: 'Dental check-up in Adelaide' },
    steps,
    expiresAt,
    authority: 'inspect_only',
  }
}

function step(stepNumber: number, offeringRefs: readonly string[], dependsOn: readonly number[] = []) {
  return {
    step: stepNumber,
    title: stepNumber === 1 ? 'Find a check-up' : 'Review the follow-up',
    purpose: 'Compare this part of the ask.',
    dependsOn,
    offeringRefs,
  }
}

function supply(optionRef: string, overrides: Partial<ConsumerSupplyOption> = {}): ConsumerSupplyOption {
  return {
    optionRef,
    business: { slug: `${optionRef}-business`, name: `${optionRef} business`, location: 'Adelaide, SA' },
    offering: { name: 'Dental check-up', summary: 'A published dental check-up.' },
    price: publishedPrice,
    availability: { kind: 'published', summary: 'Weekdays by appointment' },
    nextAction: { kind: 'inspect', label: 'See business details', href: `/business/${optionRef}` },
    evidence: { source: 'business_published', observedAt: 1_000 },
    ...overrides,
  }
}

describe('consumer plan projection', () => {
  it('keeps three comparable options inside one compiled step', () => {
    const result = projectConsumerPlan(
      preview([step(1, ['option-1', 'option-2', 'option-3'])]),
      [supply('option-1'), supply('option-2'), supply('option-3')],
      1_000,
    )

    expect(result.kind).toBe('plan')
    if (result.kind !== 'plan') return
    expect(result.steps).toHaveLength(1)
    expect(result.steps[0]?.options).toHaveLength(3)
    expect(result.steps[0]?.state).toBe('frontier')
    expect(result.frontier.step).toBe(1)
    expect(result.steps[0]?.options[0]?.price).toEqual(publishedPrice)
    expect(result.steps[0]?.options[0]?.availability).toEqual({ kind: 'published', summary: 'Weekdays by appointment' })
  })

  it('preserves ordered dependencies for a composite route', () => {
    const result = projectConsumerPlan(
      preview([step(1, ['option-1']), step(2, ['option-2'], [1])]),
      [supply('option-1'), supply('option-2')],
      1_000,
    )

    expect(result.kind).toBe('plan')
    if (result.kind !== 'plan') return
    expect(result.steps.map(({ step: number }) => number)).toEqual([1, 2])
    expect(result.steps[0]?.state).toBe('frontier')
    expect(result.steps[1]?.state).toBe('queued')
    expect(result.steps[1]?.dependsOn).toEqual([1])
    expect(JSON.stringify(result)).not.toMatch(/routePlan|RoutePlan|compiler|binding|registrySnapshotDigest/)
  })

  it('keeps options when price and availability are not published', () => {
    const result = projectConsumerPlan(
      preview([step(1, ['option-1'])]),
      [supply('option-1', {
        price: { kind: 'not_published' },
        availability: { kind: 'needs_confirmation' },
      })],
      1_000,
    )

    expect(result.kind).toBe('plan')
    if (result.kind !== 'plan') return
    expect(result.steps[0]?.options[0]).toMatchObject({
      price: { kind: 'not_published' },
      availability: { kind: 'needs_confirmation' },
    })
    expect(JSON.stringify(result)).not.toContain('available now')
  })

  it('refuses stale previews and unmatched internal candidates', () => {
    expect(projectConsumerPlan(preview([step(1, ['option-1'])], 999), [supply('option-1')], 1_000))
      .toMatchObject({ kind: 'unavailable', reason: 'options_changed' })
    expect(projectConsumerPlan(preview([step(1, ['internal-only'])]), [supply('public-only')], 1_000))
      .toMatchObject({ kind: 'unavailable', reason: 'options_changed' })
  })
})
