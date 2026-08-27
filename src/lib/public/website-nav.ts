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
 * Desktop Primary / compact Public navigation. Labels are test-locked.
 * Destinations must stay real routes; do not add CRM mega-menus.
 */
export const publicPrimaryNavItems: readonly PublicFooterRouteLink[] = [
  { label: 'Ask', to: '/t/new' },
  { label: 'Discover', to: '/market', search: { window: '30d' } },
  { label: 'Connections', to: '/for-agents' },
  { label: 'Activity', to: '/activity' },
]

export function isPublicPrimaryNavActive(pathname: string, item: PublicFooterRouteLink): boolean {
  if (item.to === '/t/new') {
    return pathname === '/t/new' || pathname.startsWith('/t/')
  }
  if (item.to === '/market') {
    return pathname === '/market' || pathname.startsWith('/market/')
  }
  return pathname === item.to || pathname.startsWith(`${item.to}/`)
}

/**
 * One list drives the public footer. Destinations here must exist as routes
 * or static files; do not add logo walls, fake customers, or unpublished pages.
 * Four groups, same as Twenty's footer: destinations, the other door, legal,
 * machines. The first group is the market, not a CRM "Product" column.
 */
export const publicFooterColumns: readonly PublicFooterColumn[] = [
  {
    title: 'Market',
    links: [
      ...publicPrimaryNavItems,
      { label: 'About', to: '/about' },
    ],
  },
  {
    title: 'Suppliers',
    links: [
      { label: 'List a tool', to: '/for-providers' },
      { label: 'Browse listed tools', to: '/market', search: { window: '30d' } },
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
      { label: '.well-known/ucp', href: '/.well-known/ucp' },
    ],
  },
]

export function publicFooterCopyright(year: number): string {
  return `© ${year} Agentic Economy`
}
