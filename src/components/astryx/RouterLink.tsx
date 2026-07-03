import type { ComponentProps } from 'react'

/**
 * Adapter satisfying Astryx's `LinkProvider` contract.
 *
 * Astryx already emits normal anchors for href-driven navigation; keeping this
 * adapter anchor-native avoids splitting search strings through TanStack
 * Router's typed `to`/`search` API and keeps generated links reliable in SSR
 * and Playwright navigation checks.
 */
export function RouterLink({ href, ...rest }: ComponentProps<'a'>) {
  return <a href={href} {...rest} />
}
