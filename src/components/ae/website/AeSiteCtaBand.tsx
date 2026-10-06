import type { ReactNode } from 'react'

import { Link } from '@tanstack/react-router'

import { cn } from '@/lib/utils'
import { actionLinkClassName } from '@/components/ae/shared/action-link/actionLinkClassName'

import './AboutFeaturesComposition.css'

export type AeSiteCtaBandProps = Readonly<{
  title: string
  description: ReactNode
  primary: Readonly<{ label: string; to: '/market' | '/for-agents' }>
  secondary?: Readonly<{ label: string; to: '/for-providers' }>
}>

/** Closing About page action with the responsibility copy kept alongside it. */
export function AeSiteCtaBand({ title, description, primary, secondary }: AeSiteCtaBandProps) {
  return (
    <section className="arc-market arc-about-cta" aria-labelledby="about-cta">
      <div className="arc-about-cta-inner">
        <div className="arc-about-cta-panel">
          <h2 id="about-cta" className="arc-about-cta-title">
            {title}
          </h2>
          <div className="arc-about-cta-description">{description}</div>
          <div className="arc-about-cta-actions">
            <Link
              to={primary.to}
              className={cn(actionLinkClassName('primary', 'md'))}
            >
              {primary.label}
            </Link>
            {secondary === undefined ? null : (
              <Link
                to={secondary.to}
                className={cn(actionLinkClassName('secondary', 'md'))}
              >
                {secondary.label}
              </Link>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
