import { FOOTER } from '@/content/brand-copy'
import { AECON_MARK_SRC, aeconMarkClassName } from '@/content/brand-assets'
import {
  isPublicFooterHrefLink,
  publicFooterColumns,
  publicFooterCopyright,
  type PublicFooterLink,
} from '@/lib/public/website-nav'
import { SiteMarker } from '@/components/ui/site-marker'

import { AeNotchedCardShape } from './AeNotchedCard'
import { AeMarkedDivider } from './AeSiteMarks'

export function AeSiteFooter() {
  const year = new Date().getFullYear()

  return (
    <footer className="mt-auto bg-foreground text-background">
      <div className="ae-rail relative flex min-h-[22rem] flex-col pt-hero pb-page md:min-h-[28rem] md:pt-band">
        <div className="relative z-1 mt-auto text-foreground">
          <AeNotchedCardShape />
          <div className="relative px-6 pt-10 pb-page md:px-page md:pt-hero md:pb-page">
            <div className="mb-page grid gap-intra font-mono text-sm">
              <div className="flex items-center gap-2">
                <img src={AECON_MARK_SRC} alt="" aria-hidden="true" className={aeconMarkClassName.dark} />
                <span>AECON</span>
              </div>
              <p className="max-w-sm text-sm text-foreground/80">{FOOTER.tagline}</p>
            </div>
            <nav
              aria-label="Footer"
              className="grid gap-section md:grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr]"
            >
              {publicFooterColumns.map((column, index) => (
                <div key={column.title} className="contents">
                  {index > 0 ? (
                    <div className="hidden md:block">
                      <AeMarkedDivider orientation="vertical" />
                    </div>
                  ) : null}
                  <div className="grid content-start gap-related">
                    {index > 0 ? (
                      <div className="md:hidden">
                        <AeMarkedDivider orientation="horizontal" />
                      </div>
                    ) : null}
                    <p className="font-sans text-sm font-medium">{column.title}</p>
                    <ul className="grid gap-2">
                      {column.links.map((link) => (
                        <li key={link.label}>
                          <FooterLink link={link} />
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              ))}
            </nav>
            <p className="mt-section font-mono text-xs text-foreground">
              {publicFooterCopyright(year)}
            </p>
          </div>
        </div>
      </div>
    </footer>
  )
}

function FooterLink({ link }: { link: PublicFooterLink }) {
  const href = isPublicFooterHrefLink(link)
    ? link.href
    : link.search === undefined
      ? link.to
      : `${link.to}?${new URLSearchParams(link.search).toString()}`

  return (
    <a
      href={href}
      className="group inline-flex min-h-touch items-center gap-0 text-sm text-foreground no-underline transition-[gap] duration-200 ease-out hover:gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
    >
      <SiteMarker tone="fg" grow visible={false} />
      {link.label}
    </a>
  )
}
