import { SiteFooter } from '@/components/arc/blocks/site-footer/site-footer'
import { RouterLinkBoundary } from '@/components/ae/shared/router-link-boundary/RouterLinkBoundary'
import { AE_SITE_FOOTER } from '@/components/ae/website/AeSiteFooter.contracts'
import { BRAND_NAME, SITE_FOOTER, SITE_NAV } from '@/content/brand-copy'

import { AeBrandMark } from './AeBrandMark'

/** Agent files are served outside the router, so they load as documents. */
const DOCUMENT_PATHS = new Set(['/llms.txt', '/SKILL.md', '/.well-known/ucp', '/glossary.md'])

const COLUMNS = [
  {
    title: SITE_FOOTER.productTitle,
    links: [
      { label: SITE_NAV.tools, href: '/market' },
      { label: SITE_NAV.docs, href: '/developers/api' },
      { label: SITE_NAV.providers, href: '/for-providers' },
    ],
  },
  {
    title: SITE_FOOTER.companyTitle,
    links: [
      { label: SITE_FOOTER.about, href: '/about' },
      { label: SITE_FOOTER.trust, href: '/trust' },
      { label: SITE_FOOTER.status, href: '/status' },
      { label: SITE_FOOTER.support, href: '/support' },
    ],
  },
  {
    title: SITE_FOOTER.agentsTitle,
    links: [
      { label: 'llms.txt', href: '/llms.txt' },
      { label: 'SKILL.md', href: '/SKILL.md' },
      { label: '.well-known/ucp', href: '/.well-known/ucp' },
      { label: 'glossary.md', href: '/glossary.md' },
    ],
  },
]

const LEGAL = [
  { label: SITE_FOOTER.privacy, href: '/privacy' },
  { label: SITE_FOOTER.terms, href: '/terms' },
  { label: SITE_FOOTER.removeListing, href: '/privacy/remove-business' },
  { label: AE_SITE_FOOTER.abn.label, href: AE_SITE_FOOTER.abn.href, external: true },
]

const SOCIALS = AE_SITE_FOOTER.socialLinks.map(link => ({ label: link.label, href: link.href, external: true }))

/**
 * The one public footer, rendered by `AePublicPage`: stock Arc site-footer (columns), no newsletter, no status claim.
 * `arc-site-footer` lets the signed-in shell hide it on app pages.
 */
export function AePublicSiteFooter() {
  return (
    <RouterLinkBoundary shouldReloadDocument={url => DOCUMENT_PATHS.has(url.pathname)}>
      <SiteFooter
        className="arc-market arc-site-footer"
        variant="columns"
        brand={{ name: BRAND_NAME, href: '/', mark: <AeBrandMark /> }}
        tagline={SITE_FOOTER.tagline}
        columns={COLUMNS}
        legal={LEGAL}
        socials={SOCIALS}
        newsletter={null}
        status={null}
      />
    </RouterLinkBoundary>
  )
}
