import { Link } from '@tanstack/react-router'

import { cn } from '@/lib/utils'

import type { AeSiteUtilityDocumentProps } from './utility-document.contracts'
import { utilityDocumentNavigation } from './utility-document.contracts'

export function AeSiteUtilityDocument({
  title,
  description,
  lastUpdated,
  version,
  sections,
  intro,
  footer,
  className,
}: AeSiteUtilityDocumentProps) {
  return (
    <div className={cn('mx-auto grid max-w-6xl gap-8 px-6 py-12 md:py-20 lg:grid-cols-[180px_minmax(0,1fr)] lg:gap-12', className)}>
      <nav aria-label="Company and website" className="h-fit">
        <p className="mb-3 px-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Agentic Economy
        </p>
        <div className="flex flex-wrap gap-1 rounded-xl border border-border p-1.5 lg:flex-col">
          {utilityDocumentNavigation.map(({ to, label }) => (
            <Link
              key={to}
              to={to}
              activeProps={{
                'aria-current': 'page',
                className: 'bg-muted font-medium text-foreground',
              }}
              className="min-h-touch rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              {label}
            </Link>
          ))}
        </div>
      </nav>

      <article className="flex min-w-0 w-full max-w-[900px] flex-col gap-8 pb-8">
        <header className="border-b border-border pb-8">
          <p className="mb-3 text-sm text-muted-foreground">
            Legal · Last updated {lastUpdated}{version === undefined ? '' : ` · Version ${version}`}
          </p>
          <h1 className="text-4xl font-extralight tracking-[-0.035em] text-foreground md:text-5xl">
            {title}
          </h1>
          {description === undefined ? null : (
            <p className="mt-4 max-w-2xl text-lg leading-relaxed text-muted-foreground">
              {description}
            </p>
          )}
        </header>

        <nav aria-label="On this page" className="border-b border-border pb-8">
          <p className="mb-4 text-sm font-medium text-foreground">On this page</p>
          <ol className="grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
            {sections.map(({ id, heading }, index) => (
              <li key={id}>
                <a
                  href={`#${id}`}
                  className="leading-relaxed text-primary underline underline-offset-4 visited:text-muted-foreground focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  <span className="mr-2 text-muted-foreground">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  {heading}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        {intro === undefined ? null : <div className="max-w-[70ch] text-base leading-7 text-foreground">{intro}</div>}

        <div className="grid max-w-[70ch] gap-10 text-base leading-7 text-foreground">
          {sections.map(({ id, heading, body }, index) => (
            <section key={id} aria-labelledby={id} className="grid scroll-mt-anchor gap-4">
              <h2 id={id} className="text-2xl font-medium tracking-tight text-foreground">
                {index + 1}. {heading}
              </h2>
              {body.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
            </section>
          ))}
        </div>

        {footer === undefined ? null : (
          <div className="max-w-[70ch] border-t border-border pt-5 text-sm leading-6 text-muted-foreground">
            {footer}
          </div>
        )}
      </article>
    </div>
  )
}
