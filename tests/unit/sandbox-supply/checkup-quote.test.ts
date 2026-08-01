import { afterEach, describe, expect, it, vi } from 'vitest'

import { registryDetailAction } from '@/modules/registry/registry.actions'
import { quoteStandardCheckup, nextAvailableSlot } from '@/modules/sandbox-supply/checkup-quote'
import { resolveCheckupQuote } from '@/modules/sandbox-supply/public'
import { sandboxCheckupQuoteAction } from '@/modules/sandbox-supply/sandbox-supply.actions'
import { handleSandboxCheckupQuoteRequest } from '@/routes/api.sandbox.$slug.checkup-quote'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('checkup quote supply resolution', () => {
  it('quotes injected offering facts without a provider map', () => {
    const requestedAt = Date.parse('2026-07-29T10:10:00.000Z')
    const result = quoteStandardCheckup({
      slug: 'adelaide-dental-clinic',
      requestedAt,
      offering: {
        name: 'General dental care',
        price: {
          currency: 'AUD',
          amountMinor: 9_500,
          unit: 'visit',
          taxTreatment: 'inclusive',
        },
      },
    })

    expect(result).toEqual(expect.objectContaining({
      provenance: 'ae_sandbox_provider',
      slug: 'adelaide-dental-clinic',
      service: 'General dental care',
      price: {
        currency: 'AUD',
        amountMinor: 9_500,
        unit: 'visit',
        taxTreatment: 'inclusive',
      },
      quotedAt: new Date(requestedAt).toISOString(),
      validUntil: new Date(requestedAt + 24 * 60 * 60 * 1000).toISOString(),
    }))
  })

  it('resolves the single matching fixed-price offering with unit and tax treatment', () => {
    const requestedAt = Date.parse('2026-07-29T10:10:00.000Z')
    const result = resolveCheckupQuote({
      slug: 'adelaide-dental-clinic',
      requestedAt,
      offerings: [{
        name: 'General dental care',
        price: { kind: 'fixed', currency: 'AUD', amountMinor: 9_500, unit: 'visit', taxTreatment: 'inclusive' },
        accessPaths: [{
          kind: 'external_operation',
          url: 'https://agentic.example/api/sandbox/adelaide-dental-clinic/checkup-quote',
          method: 'POST',
        }],
      }],
    })
    expect(result).toMatchObject({
      kind: 'ok',
      code: 'quoted',
      quote: {
        price: { currency: 'AUD', amountMinor: 9_500, unit: 'visit', taxTreatment: 'inclusive' },
        quotedAt: new Date(requestedAt).toISOString(),
      },
    })
  })

  it('returns unknown_offering when no published offering matches the quote path', () => {
    const result = resolveCheckupQuote({
      slug: 'adelaide-dental-clinic',
      requestedAt: Date.parse('2026-07-29T10:10:00.000Z'),
      offerings: [{
        name: 'General dental care',
        price: { kind: 'fixed', currency: 'AUD', amountMinor: 9_500, taxTreatment: 'inclusive' },
        accessPaths: [{
          kind: 'external_operation',
          url: 'https://agentic.example/api/sandbox/adelaide-dental-clinic/other-operation',
        }],
      }],
    })
    expect(result).toEqual({ kind: 'error', code: 'unknown_offering', retryable: false })
  })

  it('returns ambiguous_offering when multiple published offerings match', () => {
    const result = resolveCheckupQuote({
      slug: 'adelaide-dental-clinic',
      requestedAt: Date.parse('2026-07-29T10:10:00.000Z'),
      offerings: [
        {
          name: 'General dental care',
          price: { kind: 'fixed', currency: 'AUD', amountMinor: 9_500, taxTreatment: 'inclusive' },
          accessPaths: [{
            kind: 'external_operation',
            url: 'https://agentic.example/api/sandbox/adelaide-dental-clinic/checkup-quote',
            method: 'POST',
          }],
        },
        {
          name: 'Extended dental care',
          price: { kind: 'fixed', currency: 'AUD', amountMinor: 12_000, taxTreatment: 'inclusive' },
          accessPaths: [{
            kind: 'external_operation',
            url: 'https://agentic.example/api/sandbox/adelaide-dental-clinic/checkup-quote',
            method: 'POST',
          }],
        },
      ],
    })
    expect(result).toEqual({ kind: 'error', code: 'ambiguous_offering', retryable: false })
  })

  it('translates one module quote into the HTTP response', async () => {
    vi.spyOn(registryDetailAction, 'run').mockResolvedValue({
      kind: 'found',
      business: {
        offerings: [{
          name: 'General dental care',
          price: { kind: 'fixed', currency: 'AUD', amountMinor: 9_500, unit: 'visit', taxTreatment: 'inclusive' },
          accessPaths: [{
            kind: 'external_operation',
            url: 'https://agentic.example/api/sandbox/adelaide-dental-clinic/checkup-quote',
            method: 'POST',
          }],
        }],
      },
    } as never)

    const response = await handleSandboxCheckupQuoteRequest('adelaide-dental-clinic')
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      price: { currency: 'AUD', amountMinor: 9_500, unit: 'visit', taxTreatment: 'inclusive' },
    })
  })

  it('translates a module refusal into an HTTP 404', async () => {
    vi.spyOn(registryDetailAction, 'run').mockResolvedValue({
      kind: 'not_found',
      code: 'business_not_found',
      reason: 'No published business matched this slug.',
    } as never)

    const response = await handleSandboxCheckupQuoteRequest('unknown-business')
    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({ kind: 'refused', reason: 'unknown_offering' })
  })
})

describe('sandbox.checkup_quote action', () => {
  it('quotes the single fixed-price offering and satisfies its own output schema', async () => {
    vi.spyOn(registryDetailAction, 'run').mockResolvedValue({
      kind: 'found',
      business: {
        offerings: [{
          name: 'General dental care',
          price: { kind: 'fixed', currency: 'AUD', amountMinor: 9_500, unit: 'visit', taxTreatment: 'inclusive' },
          accessPaths: [{
            kind: 'external_operation',
            url: 'https://agentic.example/api/sandbox/adelaide-dental-clinic/checkup-quote',
            method: 'POST',
          }],
        }],
      },
    } as never)

    const result = await sandboxCheckupQuoteAction.run({
      data: { slug: 'adelaide-dental-clinic' },
      context: { caller: 'mcp' },
    })
    expect(result).toMatchObject({
      kind: 'quoted',
      quote: {
        provenance: 'ae_sandbox_provider',
        slug: 'adelaide-dental-clinic',
        service: 'General dental care',
        price: { currency: 'AUD', amountMinor: 9_500, unit: 'visit', taxTreatment: 'inclusive' },
      },
    })
    expect(sandboxCheckupQuoteAction.outputSchema.safeParse(result).success).toBe(true)
  })

  it('refuses with unknown_offering when no business is published for the slug', async () => {
    vi.spyOn(registryDetailAction, 'run').mockResolvedValue({
      kind: 'not_found',
      code: 'business_not_found',
      reason: 'No published business matched this slug.',
    } as never)

    const result = await sandboxCheckupQuoteAction.run({
      data: { slug: 'unknown-business' },
      context: { caller: 'mcp' },
    })
    expect(result).toEqual({
      kind: 'refused',
      code: 'unknown_offering',
      reason: 'No published fixed-price checkup offering exists for this slug.',
    })
  })

  it('refuses with ambiguous_offering when several fixed-price offerings match', async () => {
    const offering = {
      name: 'General dental care',
      price: { kind: 'fixed', currency: 'AUD', amountMinor: 9_500 },
      accessPaths: [{
        kind: 'external_operation',
        url: 'https://agentic.example/api/sandbox/adelaide-dental-clinic/checkup-quote',
        method: 'POST',
      }],
    }
    vi.spyOn(registryDetailAction, 'run').mockResolvedValue({
      kind: 'found',
      business: { offerings: [offering, { ...offering, name: 'Extended dental care' }] },
    } as never)

    const result = await sandboxCheckupQuoteAction.run({
      data: { slug: 'adelaide-dental-clinic' },
      context: { caller: 'mcp' },
    })
    expect(result).toMatchObject({ kind: 'refused', code: 'ambiguous_offering' })
  })

  it('rejects empty or missing slugs at the schema boundary', () => {
    expect(sandboxCheckupQuoteAction.schema.safeParse({ slug: '' }).success).toBe(false)
    expect(sandboxCheckupQuoteAction.schema.safeParse({}).success).toBe(false)
  })
})

describe('nextAvailableSlot', () => {
  it('rounds up to the next grid slot', () => {
    const from = new Date(2026, 6, 29, 10, 10)
    const result = nextAvailableSlot(from)
    expect(result.getHours()).toBe(10)
    expect(result.getMinutes()).toBe(30)
  })

  it('rolls after closing to opening on the next day', () => {
    const from = new Date(2026, 6, 29, 17, 0)
    const result = nextAvailableSlot(from)
    expect(result.getDate()).toBe(30)
    expect(result.getHours()).toBe(9)
    expect(result.getMinutes()).toBe(0)
  })
})
