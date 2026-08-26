export type PublicFooterHrefLink = {
  label: string
  href: string
}

export type PublicFooterRouteLink = {
  label: string
  to: string
  search?: Record<string, string>
}

export type PublicFooterLink = PublicFooterHrefLink | PublicFooterRouteLink

export type PublicFooterColumn = {
  title: string
  links: readonly PublicFooterLink[]
}

export function isPublicFooterHrefLink(link: PublicFooterLink): link is PublicFooterHrefLink {
  return 'href' in link
}

/**
 * One list drives the public footer. Destinations here must exist as routes
 * or static files; do not add logo walls, fake customers, or unpublished pages.
 */
export const publicFooterColumns: readonly PublicFooterColumn[] = [
  {
    title: 'Product',
    links: [
      { label: 'Ask', to: '/t/new' },
      { label: 'Discover', to: '/market', search: { window: '30d' } },
      { label: 'Connections', to: '/for-agents' },
      { label: 'Activity', to: '/activity' },
    ],
  },
  {
    title: 'Suppliers',
    links: [
      { label: 'List a capability', to: '/for-providers' },
      { label: 'Browse listed tools', to: '/market', search: { window: '30d' } },
    ],
  },
  {
    title: 'Company',
    links: [
      { label: 'About', to: '/about' },
    ],
  },
  {
    title: 'Legal',
    links: [
      { label: 'Privacy', to: '/privacy' },
      { label: 'Terms', to: '/terms' },
      { label: 'Remove a listing', to: '/privacy/remove-business' },
    ],
  },
  {
    title: 'Machines',
    links: [
      { label: 'llms.txt', href: '/llms.txt' },
      { label: 'SKILL.md', href: '/SKILL.md' },
    ],
  },
]
