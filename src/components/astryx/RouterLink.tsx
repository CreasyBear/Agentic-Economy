import type { ComponentProps } from 'react'
import { useRouter } from '@tanstack/react-router'

/**
 * Adapter satisfying Astryx's `LinkProvider` contract.
 *
 * Renders a real `<a href>` so SSR, right-click, modifier/middle-click
 * "open in new tab", and Playwright href checks keep working. Internal
 * same-origin plain left-clicks are promoted to TanStack SPA navigation via
 * `router.history.push(href)`, which preserves the full path/query/hash so
 * query-bearing hrefs (registry search/pagination) land without a full page
 * reload. External, hash, mailto, tel, and protocol-relative hrefs stay plain
 * anchors.
 */
export function RouterLink({ href, onClick, target, ...rest }: ComponentProps<'a'>) {
  const router = useRouter()
  const isInternal = typeof href === 'string' && href.startsWith('/') && !href.startsWith('//')

  return (
    <a
      href={href}
      target={target}
      {...rest}
      onClick={(event) => {
        onClick?.(event)

        if (
          !isInternal ||
          event.defaultPrevented ||
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey ||
          (target && target !== '_self')
        ) {
          return
        }

        event.preventDefault()
        router.history.push(href)
      }}
    />
  )
}
