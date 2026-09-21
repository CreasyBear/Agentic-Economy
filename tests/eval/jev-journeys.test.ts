import { describe, expect, it } from 'vitest'
import { classifyFailure, decodeDecision, deterministicChoice, outcome, questionFor, validateCases } from '../../tools/dev/eval-jev-journeys'
import type { JourneyCase } from '../../tools/dev/jev-journey-cases'
import { preparationMatches, validatePreparation } from '../../tools/dev/eval-jev-agent-loop'

const fixture: JourneyCase = {
  id: 'image', lane: 'prepare', split: 'dev', request: 'Save as JPEG.', context: { field: { name: 'format' } },
  options: { png: 'PNG', jpeg: 'JPEG', no_match: 'Unsupported', uncertain: 'Ambiguous', omit: 'Not requested' },
  expected: ['jpeg'], rationale: 'Secret evaluation label; never disclose.', sources: ['https://example.com/tool'],
}

describe('journey experiment contracts', () => {
  it('validates agent preparation without confusing schema validity with suitability', () => {
    const candidates = [{ id: 'geo', description: 'Forward geocoder', inputSchema: {
      type: 'object', properties: { address: { type: 'string' } }, required: ['address'], additionalProperties: false,
    } }]
    const expected = { kind: 'prepared' as const, candidate: 'geo', input: { address: 'Perth' } }
    expect(validatePreparation(expected, candidates).valid).toBe(true)
    expect(validatePreparation({ ...expected, input: {} }, candidates)).toEqual({ valid: false, reason: 'input_schema_invalid' })
    expect(validatePreparation({ ...expected, candidate: 'invented' }, candidates)).toEqual({ valid: false, reason: 'unknown_candidate' })
    const wrong = { ...expected, input: { address: 'Paris' } }
    expect(validatePreparation(wrong, candidates).valid).toBe(true)
    expect(preparationMatches(wrong, expected)).toBe(false)
    expect(preparationMatches(undefined, expected)).toBe(false)
    expect(preparationMatches({ kind: 'no_match' }, expected)).toBe(false)
    expect(validatePreparation({ kind: 'no_match', candidate: 'geo' }, candidates).valid).toBe(false)
  })
  it('never includes labels, rationale, split or source URL in inference state', () => {
    const request = questionFor(fixture)
    expect(request.state).toEqual({ request: fixture.request, evidence: fixture.context })
    const serialized = JSON.stringify(request)
    for (const forbidden of ['Secret evaluation', 'expected', 'https://example.com/tool', 'split']) expect(serialized).not.toContain(forbidden)
  })
  it('can reverse options without changing their meaning or identity', () => {
    const normal = questionFor(fixture).questions.decision!
    const reversed = questionFor(fixture, true).questions.decision!
    if (normal.type !== 'choice' || reversed.type !== 'choice') throw new Error('choice_required')
    expect(reversed.instructions).toEqual(normal.instructions)
    expect(Object.keys(reversed.criteria)).toEqual(Object.keys(normal.criteria).reverse())
  })
  it('rejects incomplete, duplicate and out-of-option labels before inference', () => {
    expect(() => validateCases([{ ...fixture, expected: ['invented'] }])).toThrow('invalid_case')
    expect(() => validateCases([fixture, fixture])).toThrow('duplicate_case_id')
    expect(() => validateCases([{ ...fixture, options: { jpeg: 'JPEG' } }])).toThrow('invalid_case')
    expect(() => validateCases([{ ...fixture, expected: [] }])).toThrow()
  })
  it.each([undefined, {}, { type: 'choice', confidence: 0.9 },
    { type: 'choice', choice: 'invented', confidence: 0.9 },
    { type: 'choice', choice: 'jpeg', confidence: Number.NaN },
    { type: 'choice', choice: 'jpeg', confidence: 1.1 },
    { type: 'choice', choice: '__proto__', confidence: 0.9 },
  ])('treats malformed replies as unavailable, not a fabricated answer: %j', raw => {
    expect(decodeDecision(raw, fixture.options)).toEqual({ kind: 'unavailable', reason: 'invalid_response' })
  })
  it('distinguishes valid no-match, uncertainty and provider failure', () => {
    for (const choice of ['no_match', 'uncertain']) {
      expect(decodeDecision({ type: 'choice', choice, confidence: 0.8 }, fixture.options)).toEqual({ kind: 'judged', choice })
    }
    expect(outcome(fixture, { kind: 'unavailable', reason: 'timeout' })).toEqual({ correct: false, unavailable: true, falsePositive: false, missedOpportunity: false })
  })
  it('separates transport, deadline and successful-HTTP invalid body failures', () => {
    expect(classifyFailure(new TypeError('network'))).toEqual({ kind: 'unavailable', reason: 'service' })
    expect(classifyFailure(new Error('upstream'), 503)).toEqual({ kind: 'unavailable', reason: 'service' })
    expect(classifyFailure(new DOMException('deadline', 'TimeoutError'))).toEqual({ kind: 'unavailable', reason: 'timeout' })
    expect(classifyFailure(new SyntaxError('invalid JSON'), 200)).toEqual({ kind: 'unavailable', reason: 'invalid_response' })
    expect(classifyFailure(new TypeError('missing choices'), 200)).toEqual({ kind: 'unavailable', reason: 'invalid_response' })
  })
  it('counts harmful selections and missed valid opportunities separately', () => {
    expect(outcome({ ...fixture, expected: ['no_match'] }, { kind: 'judged', choice: 'png' }).falsePositive).toBe(true)
    expect(outcome(fixture, { kind: 'judged', choice: 'no_match' }).missedOpportunity).toBe(true)
    expect(outcome(fixture, { kind: 'judged', choice: 'jpeg' }).correct).toBe(true)
    expect(outcome({ ...fixture, expected: ['no_match'] }, { kind: 'judged', choice: 'omit' }).missedOpportunity).toBe(false)
  })
  it('uses deterministic exact enum matching where sufficient', () => {
    expect(deterministicChoice(fixture)).toEqual({ kind: 'judged', choice: 'jpeg' })
    expect(deterministicChoice({ ...fixture, request: 'Take a screenshot.' })).toEqual({ kind: 'judged', choice: 'omit' })
    expect(deterministicChoice({ ...fixture, request: 'PNG and JPEG exclusively.' })).toEqual({ kind: 'judged', choice: 'uncertain' })
  })
})
