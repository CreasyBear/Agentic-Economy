import { Link } from '@tanstack/react-router'
import { useId, useState } from 'react'

import { cn } from '@/lib/utils'

import type { AeSiteUtilityDocumentProps } from './utility-document.contracts'
import { utilityDocumentNavigation } from './utility-document.contracts'
import './UtilityDocumentComposition.css'

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
  const outlineId = useId()
  const [outlineOpen, setOutlineOpen] = useState(false)
  return (
    <div className={cn('arc-market arc-utility-document', className)}>
      <article className="arc-document-article">
        <header className="arc-document-header">
          <h1>{title}</h1>
          <p className="arc-document-metadata">
            Legal · Last updated {lastUpdated}{version === undefined ? '' : ` · Version ${version}`}
          </p>
          {description === undefined ? null : (
            <p className="arc-document-description">{description}</p>
          )}
        </header>

        <div className="arc-document-reading">
          <nav className="arc-document-outline" aria-label="On this page">
            <button
              type="button"
              className="arc-document-outline-toggle"
              aria-expanded={outlineOpen}
              aria-controls={outlineId}
              onClick={() => setOutlineOpen((open) => !open)}
            >
              On this page
            </button>
            <p className="arc-document-outline-title" aria-hidden="true">On this page</p>
            <div id={outlineId} className="arc-document-outline-panel" data-open={outlineOpen}>
              <ol>
                {sections.map(({ id, heading }, index) => (
                  <li key={id}>
                    <a href={`#${id}`} onClick={() => setOutlineOpen(false)}>
                      <span className="arc-document-outline-number">
                        {String(index + 1).padStart(2, '0')}
                      </span>
                      <span>{heading}</span>
                    </a>
                  </li>
                ))}
              </ol>
            </div>
          </nav>

          <div className="arc-document-content">
            {intro === undefined ? null : <div className="arc-document-intro">{intro}</div>}

            {sections.map(({ id, heading, body }, index) => (
              <section key={id} aria-labelledby={id} className="arc-document-section">
                <h2 id={id} tabIndex={-1}>
                  {index + 1}. {heading}
                </h2>
                {body.map((paragraph, paragraphIndex) => (
                  <p key={typeof paragraph === 'string' ? paragraph : paragraphIndex}>
                    {paragraph}
                  </p>
                ))}
              </section>
            ))}

            {footer === undefined ? null : (
              <div className="arc-document-footer">{footer}</div>
            )}
          </div>
        </div>
      </article>

      <nav className="arc-document-company" aria-label="Company and website">
        <p>Agentic Economy</p>
        <div>
          {utilityDocumentNavigation.map(({ to, label }) => (
            <Link
              key={to}
              to={to}
              activeProps={{
                'aria-current': 'page',
                className: 'arc-document-company-current',
              }}
              className="arc-document-company-link"
            >
              {label}
            </Link>
          ))}
        </div>
      </nav>
    </div>
  )
}
