import { AECON_MARKETING_URL, AECON_MARK_SRC, aeconMarkClassName } from '@/content/brand-assets'
import {
  isPublicFooterHrefLink,
  publicFooterColumns,
  publicFooterCopyright,
  type PublicFooterLink,
} from '@/lib/public/website-nav'

const applicationFooterColumns = publicFooterColumns.filter((column) => column.id !== 'footer-market')

export function AeSiteFooter() {
  return (
    <footer className="mt-auto border-t border-border bg-background text-foreground">
      <div className="ae-rail flex flex-col gap-4 py-6 lg:flex-row lg:items-start lg:justify-between">
        <div className="shrink-0">
          <a href={AECON_MARKETING_URL} aria-label="About AECON" className="inline-flex min-h-touch items-center gap-2 rounded-sm text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <img src={AECON_MARK_SRC} alt="" aria-hidden="true" className={aeconMarkClassName.light} />
            AECON
          </a>
          <p className="mt-1 text-xs text-muted-foreground">{publicFooterCopyright(new Date().getFullYear())}</p>
        </div>
        <nav aria-label="Footer" className="flex flex-wrap gap-x-8 gap-y-2">
          {applicationFooterColumns.map((column) => (
            <section key={column.id} aria-labelledby={column.id}>
              <h2 id={column.id} className="text-xs font-medium text-muted-foreground">{column.title}</h2>
              <ul className="flex flex-wrap gap-x-4">
                {column.links.map((link) => (
                  <li key={link.label}><FooterLink link={link} /></li>
                ))}
              </ul>
            </section>
          ))}
        </nav>
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
    <a href={href} className="inline-flex min-h-touch items-center rounded-sm text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      {link.label}
    </a>
  )
}
