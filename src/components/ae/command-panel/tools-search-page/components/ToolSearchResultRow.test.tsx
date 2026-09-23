// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { Command } from '@/components/ui/command'

import { ToolSearchResultRow } from './ToolSearchResultRow'

describe('ToolSearchResultRow', () => {
  it('renders catalog row copy and forwards selection', () => {
    const onSelect = vi.fn()
    const onClearPendingIntent = vi.fn()
    render(
      <Command shouldFilter={false}>
        <ToolSearchResultRow
          isActive
          row={{
            toolRef: 'operation:v1:' + 'c'.repeat(64),
            title: 'Weather forecast',
            providerLine: 'Open-Meteo · get.open-meteo.forecast',
            healthLabel: 'Operational',
            priceLabel: 'Price confirmed at inspection',
          }}
          onSelect={onSelect}
          onClearPendingIntent={onClearPendingIntent}
        />
      </Command>,
    )
    expect(screen.getByText('Weather forecast')).toBeTruthy()
    expect(screen.getByText('Open-Meteo · get.open-meteo.forecast')).toBeTruthy()
    fireEvent.click(screen.getByRole('option'))
    expect(onClearPendingIntent).toHaveBeenCalled()
    expect(onSelect).toHaveBeenCalled()
  })
})
