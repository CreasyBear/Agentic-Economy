/**
 * @vitest-environment jsdom
 */
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { AePageHeader } from '@/components/ae/layout/AePageHeader'

describe('AePageHeader', () => {
  it('uses the site eyebrow marker for public page intros', () => {
    render(
      <AePageHeader
        eyebrow="Catalog"
        title="The tool catalog"
        description="Compare exact Operations on price and readiness."
      />,
    )

    expect(screen.getByText('Catalog')).toBeTruthy()
    expect(screen.getByRole('heading', { level: 1, name: 'The tool catalog' })).toBeTruthy()
    expect(screen.getByText('Compare exact Operations on price and readiness.')).toBeTruthy()
  })
})
