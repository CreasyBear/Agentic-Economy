import { useSyncExternalStore } from 'react'

import { TACTILE } from '@/components/ae/feedback/AeEmptyState'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
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

function NetworkHealthIndicatorDot({ isOnline }: { isOnline: boolean }) {
  const status = isOnline ? 'online' : 'offline'
  const label = isOnline ? 'Connection online' : 'Connection offline'
  const tooltip = isOnline ? 'Connection online' : 'Connection offline'

  return (
    <div data-slot="network-health-indicator" data-status={status} className="flex items-center">
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                type="button"
                aria-label={label}
                className={cn(
                  'flex size-5 items-center justify-center rounded-full hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
                  TACTILE,
                )}
              />
            }
          >
            <span className="relative flex size-2 items-center justify-center" aria-hidden="true">
              <span
                className={cn(
                  'absolute inset-0 rounded-full',
                  isOnline ? 'bg-success/20' : 'bg-warning/25',
                )}
              />
              <span
                className={cn(
                  'relative size-2 rounded-full',
                  isOnline ? 'bg-success' : 'bg-warning',
                )}
              />
            </span>
          </TooltipTrigger>
          <TooltipContent>{tooltip}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  )
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

export function AeNetworkHealthIndicator({ withBanner = true }: { withBanner?: boolean }) {
  const { isOnline } = useNetworkStatus()

  return (
    <>
      <NetworkHealthIndicatorDot isOnline={isOnline} />
      {withBanner && !isOnline ? <AeNetworkHealthBanner /> : null}
    </>
  )
}
