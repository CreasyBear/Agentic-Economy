import { describe, expect, it } from 'vitest'

import { classifyFollowUpIntent, buildThreadTitle } from '@/modules/answer-thread/public'

describe('follow-up intent router', () => {
  it('uses refine_search for the first turn', () => {
    expect(classifyFollowUpIntent('after hours plumber Preston', 0)).toBe('refine_search')
  })

  it('detects unsupported booking requests', () => {
    expect(classifyFollowUpIntent('book the first one for me', 1)).toBe('unsupported')
  })

  it('detects boundary questions', () => {
    expect(classifyFollowUpIntent('can I book here?', 1)).toBe('explain_boundary')
  })

  it('detects boundary chip text even when prior turns failed to load', () => {
    expect(classifyFollowUpIntent('What can Agentic Economy do here?', 0)).toBe('explain_boundary')
  })

  it('detects compare follow-ups', () => {
    expect(classifyFollowUpIntent('compare the first two', 1)).toBe('compare_known')
  })

  it('detects filter follow-ups', () => {
    expect(classifyFollowUpIntent('which take inquiries?', 1)).toBe('filter_known')
  })
  it('routes natural location refinement to a fresh search over prior intent', () => {
    expect(classifyFollowUpIntent('Only show options near Adelaide', 1)).toBe('refine_search')
  })


  it('detects inquiry handoff follow-ups after a provider answer exists', () => {
    expect(classifyFollowUpIntent('message the first one', 1)).toBe('unsupported')
    expect(classifyFollowUpIntent('prepare a qualified inquiry', 1)).toBe('unsupported')
    expect(classifyFollowUpIntent('send a qualified inquiry', 1)).toBe('unsupported')
  })

  it('keeps first-turn contact-shaped requests as searches', () => {
    expect(classifyFollowUpIntent('contact a plumber in Preston', 0)).toBe('refine_search')
  })

  it('truncates thread titles to 80 characters', () => {
    const title = buildThreadTitle(`${'a'.repeat(100)}`)
    expect(title.length).toBeLessThanOrEqual(80)
    expect(title.endsWith('…')).toBe(true)
  })
})
