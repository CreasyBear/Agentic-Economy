import {
  isPublicFooterHrefLink,
  publicFooterColumns,
  type PublicFooterLink,
} from '@/lib/public/website-nav'

import { AeNotchedCardShape } from './AeNotchedCard'
import { AeMarkedDivider } from './AeSiteMarks'

export function AeSiteFooter() {
  return (
    <footer className="mt-auto bg-foreground text-background">
      <div className="ae-rail relative flex min-h-[22rem] flex-col pt-hero pb-page md:min-h-[28rem] md:pt-band">
        <div className="relative z-1 mt-auto text-foreground">
          <AeNotchedCardShape />
          <div className="relative px-6 pt-10 pb-page md:px-page md:pt-hero md:pb-page">
            <div className="mb-page flex items-center gap-2 font-mono text-sm">
              <img src="/brand/logo/ae-favicon.svg" alt="" aria-hidden="true" className="size-8" />
              <span>agentic economy</span>
            </div>
            <nav
              aria-label="Footer"
              className="grid gap-section md:grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr_auto_1fr]"
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
      className="group inline-flex min-h-11 items-center gap-0 text-sm text-foreground no-underline transition-[gap] duration-200 ease-out hover:gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
    >
      <span
        aria-hidden="true"
        className="h-[7px] w-0 rounded-[1px] bg-foreground opacity-0 transition-[width,opacity] duration-200 ease-out group-hover:w-3.5 group-hover:opacity-100 motion-reduce:transition-none md:inline-flex"
      />
      {link.label}
    </a>
  )
}
