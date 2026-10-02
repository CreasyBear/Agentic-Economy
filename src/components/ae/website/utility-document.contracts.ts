import type { ReactNode } from 'react'

export type AeSiteUtilityDocumentSection = Readonly<{
  id: string
  heading: string
  body: ReadonlyArray<ReactNode>
}>

export type AeSiteUtilityDocumentProps = Readonly<{
  title: string
  description?: string
  lastUpdated: string
  version?: string
  sections: ReadonlyArray<AeSiteUtilityDocumentSection>
  intro?: ReactNode
  footer?: ReactNode
  className?: string
}>

export const utilityDocumentNavigation = [
  { to: '/about', label: 'About' },
  { to: '/support', label: 'Support' },
  { to: '/status', label: 'Status' },
  { to: '/trust', label: 'Trust centre' },
  { to: '/privacy', label: 'Privacy' },
  { to: '/terms', label: 'Terms' },
] as const
