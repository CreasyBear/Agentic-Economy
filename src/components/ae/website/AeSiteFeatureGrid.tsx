import { ReceiptText, ShieldCheck, Wallet, Workflow } from 'lucide-react'

import './AboutFeaturesComposition.css'

export type AeSiteFeatureGridProps = Readonly<{
  label: string
  title: string
  items: readonly Readonly<{
    title: string
    description: string
  }>[]
}>

const featureIcons = [ShieldCheck, ReceiptText, Wallet, Workflow] as const

/** Responsive, text-led feature cards for the About page. */
export function AeSiteFeatureGrid({ label, title, items }: AeSiteFeatureGridProps) {
  return (
    <section className="arc-market arc-about-features" aria-labelledby="about-features">
      <div className="arc-about-features-inner">
        <header className="arc-about-feature-header">
          <h2 id="about-features" className="arc-about-feature-title">
            {title}
          </h2>
          <p className="arc-about-feature-label">{label}</p>
        </header>
        <ul className="arc-about-feature-grid">
          {items.map((item, index) => {
            const Icon = featureIcons[index % 4] ?? ShieldCheck
            const size = index === 0 ? 'wide' : index === 1 ? 'regular' : 'half'

            return (
              <li key={item.title} className="arc-about-feature" data-size={size}>
                <Icon
                  aria-hidden="true"
                  className="arc-about-feature-icon"
                  size={28}
                  strokeWidth={1.5}
                />
                <div className="arc-about-feature-copy">
                  <h3>{item.title}</h3>
                  <p>{item.description}</p>
                </div>
              </li>
            )
          })}
        </ul>
      </div>
    </section>
  )
}
