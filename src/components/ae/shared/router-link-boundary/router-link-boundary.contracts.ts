import type { ReactNode } from 'react'

export type RouterLinkBoundaryProps = Readonly<{
  children: ReactNode
  /** Keep matching same-origin links as full document navigations. */
  shouldReloadDocument?: (url: URL) => boolean
}>
export type RouterLinkDestination = Readonly<{
  anchor: HTMLAnchorElement
  href: string
}>
