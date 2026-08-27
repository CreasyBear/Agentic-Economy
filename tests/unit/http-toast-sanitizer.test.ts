import { describe, expect, it } from 'vitest'

import {
  FALLBACK_TOAST_COPY,
  TOAST_COPY_MAX_LENGTH,
  sanitizeToastCopy,
} from '@/lib/http/toast-sanitizer'
import { buildProblem } from '@/lib/errors'

/** Real AE wire body exactly as `problem()` serializes it over HTTP. */
const THROTTLED_BODY = buildProblem({
  kind: 'RESOURCE_EXHAUSTED',
  code: 'rate_limited',
  title: 'Request throttled',
  detail: 'Retry after 30 seconds.',
  retryable: true,
})

describe('sanitizeToastCopy — plain strings', () => {
  it('passes human copy through untouched', () => {
    expect(sanitizeToastCopy('Server rejected the request')).toBe('Server rejected the request')
  })

  it('collapses whitespace runs and trims', () => {
    expect(sanitizeToastCopy('  spaced\n\t out  ')).toBe('spaced out')
  })

  it('strips markup tags but keeps their text', () => {
    expect(sanitizeToastCopy('<b>Bold</b> claim <script>x()</script>end')).toBe('Bold claim x() end')
  })

  it('strips control and zero-width format characters', () => {
    const controlText = [
      'a',
      String.fromCharCode(0x00),
      'b',
      String.fromCharCode(0x07),
      'c',
      String.fromCharCode(0x200b),
      'hidden',
    ].join('')
    expect(sanitizeToastCopy(controlText)).toBe('abchidden')
  })

  it('caps length by code points without splitting astral characters', () => {
    const emoji = '😀'
    expect(sanitizeToastCopy(emoji.repeat(TOAST_COPY_MAX_LENGTH + 40))).toBe(
      emoji.repeat(TOAST_COPY_MAX_LENGTH) + '…',
    )
    expect(Array.from(sanitizeToastCopy('x'.repeat(500))).length).toBe(TOAST_COPY_MAX_LENGTH + 1)
  })

  it('maps an empty cleaned string to the fallback copy', () => {
    expect(sanitizeToastCopy('<br/>')).toBe(FALLBACK_TOAST_COPY)
  })
})

describe('sanitizeToastCopy — problem-details bodies', () => {
  it('renders title plus detail only from a real problem object', () => {
    expect(sanitizeToastCopy(THROTTLED_BODY)).toBe('Request throttled. Retry after 30 seconds.')
  })

  it('renders the identical copy when the document arrives serialized inside an Error message', () => {
    // The RPC layer surfaces raw non-serialized responses as new Error(bodyText).
    expect(sanitizeToastCopy(new Error(JSON.stringify(THROTTLED_BODY)))).toBe('Request throttled. Retry after 30 seconds.')
  })

  it('uses a lone title, then a lone detail', () => {
    expect(sanitizeToastCopy({ ...THROTTLED_BODY, detail: undefined })).toBe('Request throttled')
    expect(sanitizeToastCopy({ status: 429, kind: 'RESOURCE_EXHAUSTED', detail: 'Slow down.' })).toBe('Slow down.')
  })

  it('falls back to canonical titles from status when neither member exists', () => {
    expect(sanitizeToastCopy({ type: 'about:blank', status: 503 })).toBe('Unavailable')
    expect(sanitizeToastCopy({ type: 'about:blank', status: 404 })).toBe('Not found')
  })

  it('treats envelope internals as absent rather than dumping them', () => {
    const rendered = sanitizeToastCopy({ ...THROTTLED_BODY, instance: '/api/v1/operations/call' })
    expect(rendered).not.toContain('about:blank')
    expect(rendered).not.toContain('rate_limited')
    expect(rendered).not.toContain('RESOURCE_EXHAUSTED')
    expect(rendered).not.toContain('/api')
  })
})

describe('sanitizeToastCopy — failures with internal shapes', () => {
  it('surfaces an Error message without its frame', () => {
    const error = new Error('cache miss while resolving authority')
    expect(sanitizeToastCopy(error)).toBe('cache miss while resolving authority')
  })

  it('never leaks stack frames or constructor internals', () => {
    const error = new Error('outer')
    expect(sanitizeToastCopy(error)).not.toMatch(/at |Error:|object Object/iu)
  })

  it('projects Response-ish objects through their canonical status title', () => {
    expect(sanitizeToastCopy({ status: 403, statusText: 'Forbidden' })).toBe('Permission denied')
    expect(sanitizeToastCopy({ status: 599 })).toBe('Unknown error')
  })
})

describe('sanitizeToastCopy — garbage inputs', () => {
  const garbageCases: ReadonlyArray<readonly [string, unknown]> = [
    ['empty object', {}],
    ['array', [1, 2, 3]],
    ['null', null],
    ['undefined', undefined],
    ['number', 42],
    ['boolean', true],
    ['symbol', Symbol('secret-kind')],
    ['function', () => 'leak'],
    ['date', new Date()],
    ['map', new Map([['k', 'v']])],
    ['non-numeric status', { status: 'boom' }],
    ['error with empty message', Object.assign(new Error(), { message: '' })],
  ]

  it.each(garbageCases)('maps %s to the fallback copy', (_name, input) => {
    expect(sanitizeToastCopy(input)).toBe(FALLBACK_TOAST_COPY)
  })

  it('returns the fallback for circular structures instead of hanging or throwing', () => {
    const circular: Record<string, unknown> = { name: 'circular' }
    circular['self'] = circular
    expect(sanitizeToastCopy(circular)).toBe(FALLBACK_TOAST_COPY)
  })
})

describe('sanitizeToastCopy — unwrap depth contract', () => {
  it('unwraps nested messages up to the bounded depth', () => {
    expect(sanitizeToastCopy({ message: { message: 'deep reachable' } })).toBe('deep reachable')
  })

  it('stops unwrapping beyond the depth budget', () => {
    expect(sanitizeToastCopy({ message: { message: { message: { message: 'too deep' } } } })).toBe(FALLBACK_TOAST_COPY)
  })
})
