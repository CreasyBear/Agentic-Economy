import { useSyncExternalStore } from 'react'
import { Link } from '@tanstack/react-router'

import { buttonVariants } from '@/components/ui/button-variants'
import { cn } from '@/lib/utils'

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
      className="border-b border-warning/30 bg-warning/15 px-gutter py-intra text-sm text-warning-foreground"
    >
      You are currently offline. Showing cached data.
    </div>
  )
}

export function AeNetworkHealthIndicator() {
  return (
    <Link
      to="/status"
      className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }))}
      aria-label="System status"
    >
      Status
    </Link>
  )
}
