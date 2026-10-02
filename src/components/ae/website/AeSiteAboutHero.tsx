import type { ReactNode } from 'react'

import './AboutStoryComposition.css'

export type AeSiteAboutHeroProps = Readonly<{
  label: string
  title: string
  description: string
  image: string
  children?: ReactNode
}>

/** Arc HeroContent split with the published About copy and existing photograph. */
export function AeSiteAboutHero({
  label,
  title,
  description,
  image,
  children,
}: AeSiteAboutHeroProps) {
  return (
    <section
      className="arc-market arc-about-story arc-about-hero"
      aria-labelledby="about-hero"
    >
      <div className="arc-about-story-inner arc-about-hero-inner">
        <div className="arc-about-hero-copy">
          <h1 className="arc-about-hero-title" id="about-hero">
            {title}
          </h1>
          <p className="arc-about-story-label">{label}</p>
          <p className="arc-about-story-description arc-about-hero-description">
            {description}
          </p>
          {children === undefined ? null : (
            <div className="arc-about-hero-actions">{children}</div>
          )}
        </div>
        <div className="arc-about-hero-media">
          <img
            src={image}
            sizes="(max-width: 1023px) calc(100vw - 48px), (max-width: 1279px) calc(50vw - 48px), 576px"
            fetchPriority="high"
            alt=""
            width={1200}
            height={960}
            className="arc-about-hero-image"
          />
        </div>
      </div>
    </section>
  )
}
