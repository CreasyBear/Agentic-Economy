'use client'

import { useSyncExternalStore } from 'react'

import {
  DrawerContent as ArcDrawerContent,
} from '@/components/arc/drawer/drawer'
import type { AeDrawerContentProps } from './drawer.contracts'

export { Drawer, DrawerClose, DrawerTrigger } from '@/components/arc/drawer/drawer'

const PHONE_BOTTOM_QUERY = '(max-width: 639px)'

function subscribeToPhoneViewport(onChange: () => void) {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {}
  const query = window.matchMedia(PHONE_BOTTOM_QUERY)
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}

function getPhoneViewport() {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia(PHONE_BOTTOM_QUERY).matches
}

export function AeDrawerContent({
  closeLabel = 'Close',
  side,
  className,
  onEscapeKeyDown,
  ...props
}: AeDrawerContentProps) {
  const phoneViewport = useSyncExternalStore(subscribeToPhoneViewport, getPhoneViewport, () => false)
  const phoneBottom = props['data-phone-bottom'] !== undefined && phoneViewport

  return (
    <ArcDrawerContent
      {...props}
      closeLabel={closeLabel}
      onEscapeKeyDown={event => {
        onEscapeKeyDown?.(event)
        const target = event.target
        if (!event.defaultPrevented
          && target instanceof Element
          && target.getAttribute('role') === 'combobox'
          && target.getAttribute('aria-expanded') === 'true') {
          event.preventDefault()
        }
      }}
      side={phoneBottom ? 'bottom' : side}
      className={['arc-market', className].filter(Boolean).join(' ')}
    />
  )
}

export { AeDrawerContent as DrawerContent }
