import { Link } from '@tanstack/react-router'

import buttonStyles from '@/components/arc/button/button.module.css'
import { SiteFooter } from '@/components/arc/blocks/site-footer/site-footer'
import { RouterLinkBoundary } from '@/components/ae/shared/router-link-boundary/RouterLinkBoundary'
import {
  AECON_DARK_MARK_SRC,
  AECON_MARKETING_URL,
  AECON_MARK_SRC,
  aeconMarkClassName,
} from '@/content/brand-assets'
import { FOOTER } from '@/content/brand-copy'

import { AE_SITE_FOOTER, FOOTER_NAVIGATION } from './AeSiteFooter.contracts'
import './FooterComposition.css'

export type AeSiteFooterProps = Readonly<{
  hideCloser?: boolean
}>

export function AeSiteFooter({ hideCloser = false }: AeSiteFooterProps = {}) {
  const documentLinks = FOOTER_NAVIGATION.flatMap(column =>
    column.links.filter(link => link.reloadDocument).map(link => link.to),
  )

  return (
    <div className="arc-market arc-site-footer">
      {hideCloser ? null : (
        <section className="arc-site-footer-closer" aria-labelledby="footer-closer-title">
          <div className="arc-site-footer-closer-copy">
            <h2 id="footer-closer-title">{AE_SITE_FOOTER.closer.heading}</h2>
            <p>{AE_SITE_FOOTER.closer.description}</p>
            <div className="arc-site-footer-closer-actions">
              <Link
                to="/market"
                className={`${buttonStyles.button} ${buttonStyles.primary} ${buttonStyles.md}`}
              >
                {AE_SITE_FOOTER.closer.primaryAction}
              </Link>
              <Link
                to="/status"
                className={`${buttonStyles.button} ${buttonStyles.secondary} ${buttonStyles.md}`}
              >
                {AE_SITE_FOOTER.closer.secondaryAction}
              </Link>
            </div>
          </div>
          <div className="arc-site-footer-closer-stage">
            <img
              src={AE_SITE_FOOTER.images.closer.src}
              srcSet={AE_SITE_FOOTER.images.closer.srcSet}
              sizes="(max-width: 860px) 100vw, 50vw"
              loading="lazy"
              alt=""
              className="arc-site-footer-closer-image"
            />
          </div>
        </section>
      )}
      <RouterLinkBoundary shouldReloadDocument={url => documentLinks.some(path => path === url.pathname)}>
        <SiteFooter
          className="arc-site-footer-content"
          variant="columns"
          brand={{
            name: 'AECON',
            href: AECON_MARKETING_URL,
            mark: (
              <span className="arc-site-footer-brand-graphic" role="img" aria-label="About">
                <img src={AECON_MARK_SRC} alt="" aria-hidden="true" className={`arc-site-footer-brand-mark-light ${aeconMarkClassName.light}`} />
                <img src={AECON_DARK_MARK_SRC} alt="" aria-hidden="true" className={`arc-site-footer-brand-mark-dark ${aeconMarkClassName.dark}`} />
              </span>
            ),
          }}
          tagline={FOOTER.tagline}
          year={new Date().getUTCFullYear()}
          columns={FOOTER_NAVIGATION.map(column => ({
            title: column.title,
            links: column.links.map(link => ({ label: link.label, href: link.to })),
          }))}
          socials={AE_SITE_FOOTER.socialLinks.map(profile => ({ label: profile.label, href: profile.href }))}
          legal={[{ label: AE_SITE_FOOTER.abn.label, href: AE_SITE_FOOTER.abn.href }]}
          newsletter={null}
          status={null}
        />
      </RouterLinkBoundary>
    </div>
  )
}
