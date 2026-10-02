import { useSyncExternalStore } from 'react'
import { Link } from '@tanstack/react-router'

import buttonStyles from '@/components/arc/button/button.module.css'
import './AppFrameComposition.css'

function subscribeToNetworkStatus(onStoreChange: () => void): () => void {
  window.addEventListener('online', onStoreChange)
  window.addEventListener('offline', onStoreChange)
  return () => {
    window.removeEventListener('online', onStoreChange)
    window.removeEventListener('offline', onStoreChange)
  }
}

function readNavigatorOnline(): boolean {
  return navigator.onLine
}

function readServerNavigatorOnline(): boolean {
  return true
}

export function useNetworkStatus(): { isOnline: boolean } {
  const isOnline = useSyncExternalStore(
    subscribeToNetworkStatus,
    readNavigatorOnline,
    readServerNavigatorOnline,
  )
  return { isOnline }
}


export function AeNetworkHealthBanner() {
  const { isOnline } = useNetworkStatus()
  if (isOnline) return null

  return (
    <div
      data-slot="offline-warning-banner"
      role="alert"
      className="arc-market arc-network-warning"
    >
      You are currently offline. Showing cached data.
    </div>
  )
}

export function AeNetworkHealthIndicator() {
  return (
    <Link
      to="/status"
      className={`arc-market ${buttonStyles.button} ${buttonStyles.ghost} ${buttonStyles.md}`}
      aria-label="System status"
    >
      Status
    </Link>
  )
}
