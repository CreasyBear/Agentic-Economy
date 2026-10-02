import type { ReactNode } from 'react'

import { Link } from '@tanstack/react-router'

import arcButtonStyles from '@/components/arc/button/button.module.css'
import { cn } from '@/lib/utils'

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
              className={cn(arcButtonStyles.button, arcButtonStyles.primary, arcButtonStyles.md)}
            >
              {primary.label}
            </Link>
            {secondary === undefined ? null : (
              <Link
                to={secondary.to}
                className={cn(arcButtonStyles.button, arcButtonStyles.secondary, arcButtonStyles.md)}
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
