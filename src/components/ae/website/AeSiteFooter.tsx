import { useMemo } from 'react'
import { Link, useRouter } from '@tanstack/react-router'

import { AECON_MARKETING_URL, AECON_MARK_SRC, aeconMarkClassName } from '@/content/brand-assets'
import { FOOTER } from '@/content/brand-copy'

type FooterLinkItem = {
  to: string
  label: string
  order: number
  reloadDocument: boolean
}

type FooterColumn = {
  id: string
  title: string
  links: FooterLinkItem[]
}

export function AeSiteFooter() {
  const { routesByPath } = useRouter()

  const columns = useMemo<FooterColumn[]>(() => {
    const groups = new Map<string, FooterLinkItem[]>()
    for (const route of Object.values(routesByPath)) {
      const nav = route.options.staticData?.nav
      if (nav?.footer === undefined) continue
      const links = groups.get(nav.footer.column) ?? []
      links.push({
        to: route.to,
        label: nav.label,
        order: nav.footer.order,
        // Machine-readable routes (llms.txt, SKILL.md, .well-known/ucp) are
        // server handlers with no component: a client-side transition would
        // render nothing, so those links force a full document navigation.
        reloadDocument: route.options.component === undefined,
      })
      groups.set(nav.footer.column, links)
    }
    for (const links of groups.values()) links.sort((a, b) => a.order - b.order)

    return FOOTER.columns
      .filter((title) => title !== 'Market')
      .map((title) => ({ id: `footer-${title.toLowerCase()}`, title, links: groups.get(title) ?? [] }))
  }, [routesByPath])

  return (
    <footer className="mt-auto border-t border-border bg-background text-foreground">
      <div className="ae-rail flex flex-col gap-4 py-6 lg:flex-row lg:items-start lg:justify-between">
        <div className="shrink-0">
          <a href={AECON_MARKETING_URL} aria-label="About AECON" className="inline-flex min-h-touch items-center gap-2 rounded-sm text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <img src={AECON_MARK_SRC} alt="" aria-hidden="true" className={aeconMarkClassName.light} />
            AECON
          </a>
          <p className="mt-1 text-xs text-muted-foreground">{FOOTER.copyright(new Date().getFullYear())}</p>
        </div>
        <nav aria-label="Footer" className="flex flex-wrap gap-x-8 gap-y-2">
          {columns.map((column) => (
            <section key={column.id} aria-labelledby={column.id}>
              <h2 id={column.id} className="text-xs font-medium text-muted-foreground">{column.title}</h2>
              <ul className="flex flex-wrap gap-x-4">
                {column.links.map((link) => (
                  <li key={link.to}><FooterLink link={link} /></li>
                ))}
              </ul>
            </section>
          ))}
        </nav>
      </div>
    </footer>
  )
}

function FooterLink({ link }: { link: FooterLinkItem }) {
  return (
    <Link
      to={link.to}
      {...(link.reloadDocument ? { reloadDocument: true } : {})}
      className="inline-flex min-h-touch items-center rounded-sm text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {link.label}
    </Link>
  )
}
