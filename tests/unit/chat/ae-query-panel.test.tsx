/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { AeQueryPanel } from '@/components/ae/chat/AeQueryPanel'

describe('AeQueryPanel', () => {
  afterEach(() => {
    cleanup()
  })

  it('can render session-aware follow-up guidance in the compact composer', () => {
    render(
      <AeQueryPanel
        onSubmit={() => undefined}
        showExamples={false}
        placeholder="Narrow, compare, or ask for an inquiry path"
        loopHint="Continue by narrowing, comparing, or starting a qualified inquiry when a listing publishes that path."
      />,
    )

    expect(screen.getByPlaceholderText('Narrow, compare, or ask for an inquiry path')).toBeTruthy()
    expect(
      screen.getByText(
        'Continue by narrowing, comparing, or starting a qualified inquiry when a listing publishes that path.',
      ),
    ).toBeTruthy()
    expect(screen.queryByText('Cited answers from published business details.')).toBeNull()
  })
})
