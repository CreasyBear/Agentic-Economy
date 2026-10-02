import { Link } from '@tanstack/react-router'

import buttonStyles from '@/components/arc/button/button.module.css'
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
  return (
    <footer className="arc-market arc-site-footer">
      <div className="ae-rail arc-site-footer-inner">
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

        <div className="arc-site-footer-top">
          <div className="arc-site-footer-brand-column">
            <a
              href={AECON_MARKETING_URL}
              aria-label="About AECON"
              className="arc-site-footer-brand-link"
            >
              <img
                src={AECON_MARK_SRC}
                alt=""
                aria-hidden="true"
                className={`arc-site-footer-brand-mark-light ${aeconMarkClassName.light}`}
              />
              <img
                src={AECON_DARK_MARK_SRC}
                alt=""
                aria-hidden="true"
                className={`arc-site-footer-brand-mark-dark ${aeconMarkClassName.dark}`}
              />
              AECON
            </a>
            <p className="arc-site-footer-tagline">{FOOTER.tagline}</p>
          </div>

          <nav aria-label="Footer" className="arc-site-footer-columns">
            {FOOTER_NAVIGATION.map((column) => (
              <section key={column.id} className="arc-site-footer-column" aria-labelledby={column.id}>
                <h2 id={column.id}>{column.title}</h2>
                <ul>
                  {column.links.map((link) => (
                    <li key={link.to}>
                      <Link
                        to={link.to}
                        reloadDocument={link.reloadDocument}
                        className="arc-site-footer-link"
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </nav>
        </div>

        <div className="arc-site-footer-bottom">
          <nav aria-label="Follow Agentic Economy" className="arc-site-footer-social-links">
            {AE_SITE_FOOTER.socialLinks.map((profile) => (
              <a key={profile.href} href={profile.href} className="arc-site-footer-link">
                {profile.label}
              </a>
            ))}
          </nav>
          <div className="arc-site-footer-legal">
            <p>{FOOTER.copyright(new Date().getFullYear())}</p>
            <a href={AE_SITE_FOOTER.abn.href} className="arc-site-footer-link">
              {AE_SITE_FOOTER.abn.label}
            </a>
          </div>
        </div>
      </div>
    </footer>
  )
}
