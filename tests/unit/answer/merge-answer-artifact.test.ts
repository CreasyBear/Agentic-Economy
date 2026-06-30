import { describe, expect, it } from 'vitest'

import { mergeAnswerArtifact } from '@/modules/answer/public'

describe('mergeAnswerArtifact', () => {
  it('replaces artifacts by kind and accumulates summary prose', () => {
    const merged = mergeAnswerArtifact(
      [
        { kind: 'one-line', text: 'First' },
        { kind: 'prose', block: 'summary', text: 'Part one.' },
      ],
      { kind: 'prose', block: 'summary', text: 'Part one. Part two.' },
    )

    expect(merged).toEqual([
      { kind: 'one-line', text: 'First' },
      { kind: 'prose', block: 'summary', text: 'Part one. Part two.' },
    ])
  })

  it('replaces non-prose artifacts with the same kind', () => {
    const merged = mergeAnswerArtifact(
      [{ kind: 'one-line', text: 'Old' }],
      { kind: 'one-line', text: 'New' },
    )

    expect(merged).toEqual([{ kind: 'one-line', text: 'New' }])
  })
})
