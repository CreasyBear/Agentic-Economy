import { useMemo } from 'react'
import { Link, useRouter } from '@tanstack/react-router'

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { buttonVariants } from '@/components/ui/button-variants'
import {
  AECON_DARK_MARK_SRC,
  AECON_MARKETING_URL,
  AECON_MARK_SRC,
  aeconMarkClassName,
} from '@/content/brand-assets'
import { FOOTER } from '@/content/brand-copy'

import { AE_SITE_FOOTER, type AeSiteFooterLinkItem } from './AeSiteFooter.contracts'

export function AeSiteFooter() {
  const { routesByPath } = useRouter()

  const columns = useMemo(() => {
    const groups = new Map<string, AeSiteFooterLinkItem[]>()
    for (const route of Object.values(routesByPath)) {
      const nav = route.options.staticData?.nav
      if (nav?.footer === undefined) continue
      const links = groups.get(nav.footer.column) ?? []
      links.push({
        to: route.to,
        label: nav.label,
        order: nav.footer.order,
        // Machine-readable routes are server handlers with no component.
        reloadDocument: route.options.component === undefined,
      })
      groups.set(nav.footer.column, links)
    }
    for (const links of groups.values()) links.sort((a, b) => a.order - b.order)

    return FOOTER.columns
      .filter((title) => title !== 'Market')
      .map((title) => ({
        id: `footer-${title.toLowerCase()}`,
        title,
        links: groups.get(title) ?? [],
      }))
  }, [routesByPath])

  return (
    <footer className="relative isolate mt-auto overflow-hidden border-t border-border bg-background text-foreground">
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden opacity-15 mix-blend-luminosity dark:opacity-25">
        <img
          src={AE_SITE_FOOTER.images.atmosphere.src}
          srcSet={AE_SITE_FOOTER.images.atmosphere.srcSet}
          sizes="100vw"
          alt=""
          loading="lazy"
          className="size-full object-cover object-bottom"
        />
        <div className="absolute inset-0 bg-linear-to-t from-background via-background/90 to-background/60" />
      </div>

      <div className="ae-rail pt-6 pb-8 md:pt-16 md:pb-16">
        <div className="relative mb-12 overflow-hidden rounded-3xl border border-white/15 shadow-2xl shadow-black/60 ring-1 ring-white/10 md:mb-16">
          <img
            src={AE_SITE_FOOTER.images.closer.src}
            srcSet={AE_SITE_FOOTER.images.closer.srcSet}
            sizes="(max-width: 1280px) 100vw, 1280px"
            alt=""
            loading="lazy"
            className="absolute inset-0 size-full object-cover object-center brightness-[0.82] contrast-[1.05]"
          />
          <div className="absolute inset-0 bg-linear-to-t from-black/85 via-black/40 to-black/20" />
          <div className="relative z-10 flex min-h-[320px] flex-col items-center justify-center p-8 text-center md:min-h-[380px] md:p-14">
            <span className="mb-3 inline-block rounded-full border border-white/20 bg-black/40 px-3.5 py-1 text-xs font-medium tracking-widest text-white/90 uppercase backdrop-blur-md">
              {AE_SITE_FOOTER.closer.eyebrow}
            </span>
            <h2 className="max-w-2xl text-balance text-3xl font-extralight tracking-tight text-white drop-shadow-md md:text-5xl lg:text-6xl">
              {AE_SITE_FOOTER.closer.heading}
            </h2>
            <p className="mt-4 max-w-xl text-balance text-base text-white/80 drop-shadow-xs md:text-lg">
              {AE_SITE_FOOTER.closer.description}
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Link
                to="/market"
                className={buttonVariants({
                  size: 'lg',
                  className: 'rounded-full bg-white px-6 font-semibold text-zinc-950 shadow-lg hover:bg-zinc-100 hover:text-black',
                })}
              >
                {AE_SITE_FOOTER.closer.primaryAction}
              </Link>
              <Link
                to="/status"
                className={buttonVariants({
                  variant: 'outline',
                  size: 'lg',
                  className: 'rounded-full border-white/30 bg-black/30 px-6 text-white backdrop-blur-md hover:bg-white/10 hover:text-white',
                })}
              >
                {AE_SITE_FOOTER.closer.secondaryAction}
              </Link>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-x-6 gap-y-8 sm:grid-cols-4 lg:grid-cols-6">
          <div className="col-span-full space-y-4 lg:col-span-2">
            <a
              href={AECON_MARKETING_URL}
              aria-label="About AECON"
              className="inline-flex min-h-touch items-center gap-2 rounded-sm text-sm font-semibold transition-opacity duration-fast hover:opacity-90 focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              <img
                src={AECON_MARK_SRC}
                alt=""
                aria-hidden="true"
                className={`${aeconMarkClassName.light} dark:hidden`}
              />
              <img
                src={AECON_DARK_MARK_SRC}
                alt=""
                aria-hidden="true"
                className={`${aeconMarkClassName.dark} hidden dark:block`}
              />
              AECON
            </a>
            <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">{FOOTER.tagline}</p>
          </div>

          <Accordion className="col-span-full md:hidden" type="multiple">
            {columns.map((column) => (
              <AccordionItem key={column.id} value={column.id}>
                <AccordionTrigger className="min-h-touch hover:no-underline">
                  {column.title} links
                </AccordionTrigger>
                <AccordionContent>
                  <ul className="flex flex-col gap-1">
                    {column.links.map((link) => (
                      <li key={link.to}>
                        <Link
                          to={link.to}
                          {...(link.reloadDocument ? { reloadDocument: true } : {})}
                          className="block min-h-touch py-2.5 text-muted-foreground transition-colors duration-fast hover:text-foreground"
                        >
                          {link.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>

          {columns.map((column) => (
            <section key={column.id} className="hidden md:block" aria-labelledby={column.id}>
              <h2 id={column.id} className="text-xs font-semibold tracking-wider text-foreground uppercase">
                {column.title}
              </h2>
              <ul className="mt-4 list-inside space-y-3">
                {column.links.map((link) => (
                  <li key={link.to}>
                    <Link
                      to={link.to}
                      {...(link.reloadDocument ? { reloadDocument: true } : {})}
                      className="text-sm text-muted-foreground transition-colors duration-fast hover:text-foreground"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        <div className="mt-8 flex flex-col items-start justify-between gap-4 border-t border-border pt-6 text-xs text-muted-foreground sm:flex-row sm:items-center md:mt-12 md:pt-8">
          <div>
            <p>{FOOTER.tagline}</p>
            <nav aria-label="Follow Agentic Economy" className="mt-1 flex flex-wrap gap-x-5 gap-y-2">
              {AE_SITE_FOOTER.socialLinks.map((profile) => (
                <a
                  key={profile.href}
                  href={profile.href}
                  className="min-h-touch text-muted-foreground underline underline-offset-4 transition-colors duration-fast hover:text-foreground"
                >
                  {profile.label}
                </a>
              ))}
            </nav>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-muted-foreground sm:justify-end">
            <p>{FOOTER.copyright(new Date().getFullYear())}</p>
            <a
              href={AE_SITE_FOOTER.abn.href}
              className="min-h-touch text-muted-foreground underline underline-offset-4 transition-colors duration-fast hover:text-foreground"
            >
              {AE_SITE_FOOTER.abn.label}
            </a>
          </div>
        </div>
      </div>
    </footer>
  )
}
