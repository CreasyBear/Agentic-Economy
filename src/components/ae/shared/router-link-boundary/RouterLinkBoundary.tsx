import { useRouter } from '@tanstack/react-router'
import { useCallback, type FocusEvent, type MouseEvent, type PointerEvent } from 'react'

import type { RouterLinkBoundaryProps, RouterLinkDestination } from './router-link-boundary.contracts'


const CONTENTS_STYLE = { display: 'contents' } as const

function resolveLink(
  root: HTMLDivElement,
  target: EventTarget | null,
  shouldReloadDocument?: RouterLinkBoundaryProps['shouldReloadDocument'],
): RouterLinkDestination | null {
  if (!(target instanceof Element)) return null
  const anchor = target.closest<HTMLAnchorElement>('a[href]')
  if (!anchor || !root.contains(anchor) || anchor.hasAttribute('download') || anchor.relList.contains('external')) return null

  const targetName = anchor.target.toLowerCase()
  if (targetName && targetName !== '_self') return null

  const url = new URL(anchor.href, window.location.href)
  if (url.origin !== window.location.origin || shouldReloadDocument?.(url)) return null

  return { anchor, href: `${url.pathname}${url.search}${url.hash}` }
}


export function RouterLinkBoundary({ children, shouldReloadDocument }: RouterLinkBoundaryProps) {
  const router = useRouter()
  const resolve = useCallback(
    (root: HTMLDivElement, target: EventTarget | null) => resolveLink(root, target, shouldReloadDocument),
    [shouldReloadDocument],
  )
  function preload(href: string) {
    void router.preloadRoute({ to: new URL(href, window.location.origin).pathname }).catch((cause: unknown) => {
      console.warn('Unable to preload a route from an Arc link.', cause)
    })
  }

  function handleIntent(event: FocusEvent<HTMLDivElement> | PointerEvent<HTMLDivElement>) {
    const link = resolve(event.currentTarget, event.target)
    if (link) preload(link.href)
  }
  function handleClick(event: MouseEvent<HTMLDivElement>) {
    if (
      event.defaultPrevented || event.button !== 0 || event.metaKey || event.altKey || event.ctrlKey || event.shiftKey
    ) return

    const link = resolve(event.currentTarget, event.target)
    if (!link) return

    event.preventDefault()
    void router.navigate({ href: link.href })
  }

  return (
    <div style={CONTENTS_STYLE} onClick={handleClick} onFocus={handleIntent} onPointerOver={handleIntent}>
      {children}
    </div>
  )
}
