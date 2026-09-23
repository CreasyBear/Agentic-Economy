/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import '../../setup/jsdom-platform'

import { AeNetworkHealthIndicator } from '@/components/ae/layout/AeNetworkHealthIndicator'

function setNavigatorOnline(online: boolean): void {
  Object.defineProperty(navigator, 'onLine', {
    configurable: true,
    value: online,
    writable: true,
  })
}

function dispatchConnectivity(type: 'online' | 'offline'): void {
  window.dispatchEvent(new Event(type))
}

afterEach(() => {
  cleanup()
  setNavigatorOnline(true)
})

describe('AeNetworkHealthIndicator (S-16)', () => {
  it('renders online status by default with no offline warning banner', () => {
    setNavigatorOnline(true)
    render(<AeNetworkHealthIndicator />)

    const indicator = document.querySelector('[data-slot="network-health-indicator"]')
    expect(indicator).not.toBeNull()
    expect(indicator?.getAttribute('data-status')).toBe('online')
    expect(document.querySelector('[data-slot="offline-warning-banner"]')).toBeNull()
    expect(screen.getByLabelText('Connection online')).toBeTruthy()
  })

  it('shows the offline warning banner after an offline event', async () => {
    setNavigatorOnline(true)
    render(<AeNetworkHealthIndicator />)

    setNavigatorOnline(false)
    dispatchConnectivity('offline')

    await waitFor(() => {
      expect(document.querySelector('[data-slot="network-health-indicator"]')?.getAttribute('data-status')).toBe(
        'offline',
      )
    })

    const banner = document.querySelector('[data-slot="offline-warning-banner"]')
    expect(banner).not.toBeNull()
    expect(banner?.getAttribute('role')).toBe('alert')
    expect(banner?.textContent).toContain('You are currently offline. Showing cached data.')
  })

  it('removes the offline warning banner after an online event', async () => {
    setNavigatorOnline(false)
    render(<AeNetworkHealthIndicator />)

    setNavigatorOnline(true)
    dispatchConnectivity('online')

    await waitFor(() => {
      expect(document.querySelector('[data-slot="offline-warning-banner"]')).toBeNull()
    })
    expect(document.querySelector('[data-slot="network-health-indicator"]')?.getAttribute('data-status')).toBe(
      'online',
    )
  })
})
