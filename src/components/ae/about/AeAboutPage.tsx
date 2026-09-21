import { Link } from '@tanstack/react-router'

import {
  AeSiteAboutHero,
  AeSiteCtaBand,
  AeSiteEditorial,
  AeSiteFeatureGrid,
} from '@/components/ae/website'
import { buttonVariants } from '@/components/ui/button-variants'
import { ABOUT } from '@/content/brand-copy'

export function AeAboutPage() {
  return (
    <>
      <AeSiteAboutHero
        label={ABOUT.eyebrow}
        title={ABOUT.heading}
        description={ABOUT.subhead}
        image={ABOUT.heroImage}
      >
        <Link to="/market" className={buttonVariants({ size: 'lg' })}>
          {ABOUT.heroPrimaryCta}
        </Link>
        <Link to="/for-providers" className={buttonVariants({ size: 'lg', variant: 'outline' })}>
          {ABOUT.heroSecondaryCta}
        </Link>
      </AeSiteAboutHero>

      <AeSiteEditorial
        label={ABOUT.editorialLabel}
        title={ABOUT.editorialTitle}
        description={ABOUT.editorialDescription}
      >
        <div className="flex flex-col gap-6">
          {ABOUT.editorialParagraphs.map((paragraph) => (
            <p key={paragraph} className="leading-relaxed text-muted-foreground">
              {paragraph}
            </p>
          ))}
          <div className="flex flex-wrap gap-x-6 gap-y-3">
            {ABOUT.editorialLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="inline-flex min-h-touch items-center font-medium text-primary underline-offset-4 hover:underline"
              >
                {link.label}
              </a>
            ))}
          </div>
        </div>
      </AeSiteEditorial>

      <AeSiteFeatureGrid
        label={ABOUT.featuresLabel}
        title={ABOUT.featuresHeading}
        items={ABOUT.features}
      />

      <AeSiteCtaBand
        title={ABOUT.ctaHeading}
        description={ABOUT.ctaDescription}
        primary={{ label: ABOUT.ctaPrimary, to: '/market' }}
        secondary={{ label: ABOUT.ctaSecondary, to: '/for-providers' }}
      />
    </>
  )
}
