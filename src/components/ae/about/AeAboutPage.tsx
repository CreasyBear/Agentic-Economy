import {
  AeSiteAboutHero,
  AeSiteCtaBand,
  AeSiteEditorial,
  AeSiteFeatureGrid,
} from '@/components/ae/website'
import { AE_SITE_FOOTER } from '@/components/ae/website/AeSiteFooter.contracts'
import { SUPPORT_EMAIL } from '@/components/ae/support/help/help.contracts'
import { ABOUT } from '@/content/brand-copy'

const SUPPORT_EMAIL_LABEL = SUPPORT_EMAIL.replace(/^mailto:/, '')

export function AeAboutPage({ availability }: { availability: string }) {
  return (
    <>
      <AeSiteAboutHero
        label={ABOUT.eyebrow}
        title={ABOUT.heading}
        description={ABOUT.subhead}
        image={ABOUT.heroImage}
      />

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
        description={(
          <>
            {availability}
            <span className="mt-4 block text-sm">
              {ABOUT.operatorLine.prefix}
              {ABOUT.operatorLine.separator}
              <a
                href={AE_SITE_FOOTER.abn.href}
                rel="noreferrer"
                target="_blank"
                aria-label={`${AE_SITE_FOOTER.abn.label} (opens in a new tab)`}
                className="font-medium text-foreground underline underline-offset-4"
              >
                {AE_SITE_FOOTER.abn.label}
              </a>
              {ABOUT.operatorLine.separator}
              <a
                href={SUPPORT_EMAIL}
                className="font-medium text-foreground underline underline-offset-4"
              >
                {SUPPORT_EMAIL_LABEL}
              </a>
            </span>
          </>
        )}
        primary={{ label: ABOUT.ctaPrimary, to: '/market' }}
      />
    </>
  )
}
