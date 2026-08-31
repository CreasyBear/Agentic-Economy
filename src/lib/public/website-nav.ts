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
  id: string
  title: string
  links: readonly PublicFooterLink[]
}

export function isPublicFooterHrefLink(link: PublicFooterLink): link is PublicFooterHrefLink {
  return 'href' in link
}

/**
 * Desktop Primary / compact Public navigation. Labels are test-locked.
 * Destinations must stay real routes; do not add CRM mega-menus.
 */
export const publicPrimaryNavItems: readonly PublicFooterRouteLink[] = [
  { label: 'Discover', to: '/market', search: { window: '30d' } },
  { label: 'For agents', to: '/for-agents' },
  { label: 'For suppliers', to: '/for-providers' },
  { label: 'Activity', to: '/activity' },
]

export function isPublicPrimaryNavActive(pathname: string, item: PublicFooterRouteLink): boolean {
  if (item.to === '/market') {
    return pathname === '/market' || pathname.startsWith('/market/')
  }
  return pathname === item.to || pathname.startsWith(`${item.to}/`)
}

/**
 * One list drives the public footer. Destinations here must exist as routes
 * or static files; do not add logo walls, fake customers, or unpublished pages.
 * Four groups, following Twenty's labelled footer pattern: market, help, legal,
 * and machine-readable artifacts. The first group is the market, not a CRM
 * "Product" column.
 */
export const publicFooterColumns: readonly PublicFooterColumn[] = [
  {
    id: 'footer-market',
    title: 'Market',
    links: [
      ...publicPrimaryNavItems,
      { label: 'About', to: '/about' },
    ],
  },
  {
    id: 'footer-help',
    title: 'Help',
    links: [
      { label: 'Get help', to: '/support' },
      { label: 'System status', to: '/status' },
    ],
  },
  {
    id: 'footer-legal',
    title: 'Legal',
    links: [
      { label: 'Privacy', to: '/privacy' },
      { label: 'Terms', to: '/terms' },
      { label: 'Remove a listing', to: '/privacy/remove-business' },
    ],
  },
  {
    id: 'footer-machines',
    title: 'Machines',
    links: [
      { label: 'llms.txt', href: '/llms.txt' },
      { label: 'SKILL.md', href: '/SKILL.md' },
      { label: '.well-known/ucp', href: '/.well-known/ucp' },
    ],
  },
]

export function publicFooterCopyright(year: number): string {
  return `© ${year} Agentic Economy`
}
