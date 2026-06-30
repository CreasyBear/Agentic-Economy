import { useId, type ReactNode } from 'react'
import { SearchIcon, SlidersHorizontalIcon, type LucideIcon } from 'lucide-react'

import { cn } from '@/lib/utils'

type AeLandingIcon = LucideIcon
type AeLandingChildrenProps = {
  children: ReactNode
}

type AeLandingCopy = {
  title: string
  description: string
}

export type AeAnswerRecordFieldRole =
  | 'known'
  | 'source'
  | 'unknown'
  | 'unavailable'
  | 'next-step'
  | 'correction-path'

export type AeLandingFact = {
  label: string
  value: string
  role?: AeAnswerRecordFieldRole
}

export type AeAnswerRecordField = AeLandingFact

export type AeLandingProofItem = AeLandingCopy & {
  step: string
}

export type AeLandingSignalEmphasis = 'command' | 'raised' | 'stamp' | 'wide'

export type AeLandingFeature = AeLandingCopy & {
  Icon: AeLandingIcon
  emphasis?: AeLandingSignalEmphasis
}

export type AeLandingSignal = AeLandingFeature

export type AeLandingPathStep = AeLandingCopy & {
  Icon: AeLandingIcon
}

export type AeLandingMarketResult = AeLandingCopy & {
  area?: string
  status?: string
}

export type AeLandingServiceExample = AeLandingCopy & {
  meta?: string
  status?: string
}

export type AeLandingService = AeLandingServiceExample

export type AeLandingSectionTone =
  | 'stakes'
  | 'answer'
  | 'record'
  | 'path'
  | 'services'
  | 'boundary'
  | 'faq'
  | 'closing'

export type AeLandingSectionGrid = Exclude<AeLandingSectionTone, 'answer'>

export type AePublicLandingPageProps = AeLandingChildrenProps

export type AeLandingHeroProps = {
  kicker: string
  title: string
  lede: string
  subcopy?: string
  actions: ReactNode
  proof?: ReactNode
  visual?: ReactNode
  record?: ReactNode
  backgroundImage?: AeLandingBandBackgroundImage
}

export type AeLandingHeroVisualProps = {
  imageSrc: string
  imageAlt: string
  imageCaption?: string
  ariaLabel?: string
  marketLabel?: string
  marketSearchLabel?: string
  marketQuery?: string
  marketFilters?: readonly string[]
  marketResults?: readonly AeLandingMarketResult[]
  showMarketPanel?: boolean
  children: ReactNode
}

export type AeLandingBandBackgroundImage = {
  src: string
  alt?: string
  position?: 'left' | 'right'
}

export type AeLandingBandProps = AeLandingChildrenProps & {
  tone: AeLandingSectionTone
  grid?: AeLandingSectionGrid
  className?: string
  containerClassName?: string
  ariaLabel?: string
  backgroundImage?: AeLandingBandBackgroundImage
}

export type AeSectionCopyProps = AeLandingCopy & {
  action?: ReactNode
  className?: string
}

export type AeLandingCtaRowProps = AeLandingChildrenProps

export type AeButtonIconProps = AeLandingChildrenProps

export type AeProofStripProps = {
  items: readonly AeLandingProofItem[]
  ariaLabel?: string
}

export type AeAnswerRecordCardProps = {
  eyebrow: string
  question: string
  statusLabel: string
  businessName: string
  fields: readonly AeLandingFact[]
  footerIcon: ReactNode
  footer: string
  ariaLabel?: string
}

export type AeStakeListProps = {
  items: readonly AeLandingFact[]
  ariaLabel?: string
}

export type AeSignalGridProps = {
  items: readonly AeLandingFeature[]
  ariaLabel?: string
}

export type AeRecordPreviewProps = {
  mark: string
  name: string
  label: string
  seal: string
  headline: string
  fields: readonly AeLandingFact[]
  ariaLabel?: string
}

export type AePathVisualNode = {
  label: string
  slot: 'a' | 'b' | 'c'
}

export type AePathwayProps = {
  steps: readonly AeLandingPathStep[]
  title?: string
  stepsAriaLabel?: string
  visualNodes?: readonly AePathVisualNode[]
}

export type AeServiceRowsProps = {
  services: readonly AeLandingServiceExample[]
  ariaLabel?: string
}

export type AePublicRecordHeroProps = {
  kicker: string
  title: string
  description: string
  actions?: ReactNode
  record: ReactNode
}

export type AePublicServiceReadback = AeLandingCopy & {
  facts: readonly AeLandingFact[]
  status?: ReactNode
}

export type AePublicServiceReadbacksProps = {
  services: readonly AePublicServiceReadback[]
  title?: string
  ariaLabel?: string
}

export type AePublicStatusPanelProps = AeLandingChildrenProps & {
  title: string
  description?: string
  ariaLabel?: string
}

export type AeBoundaryPanelProps = {
  rows: readonly AeLandingFact[]
  title?: string
  ariaLabel?: string
}

export type AeFaqItem = AeLandingCopy

export type AeFaqListProps = {
  items: readonly AeFaqItem[]
  ariaLabel?: string
}

export type AeClosingObjectProps = AeLandingChildrenProps & {
  icon: ReactNode
  label: string
}

const defaultSectionGridByTone: Partial<Record<AeLandingSectionTone, AeLandingSectionGrid>> = {
  stakes: 'stakes',
  record: 'record',
  path: 'path',
  services: 'services',
  boundary: 'boundary',
  faq: 'faq',
  closing: 'closing',
}

const defaultPathVisualNodes: readonly AePathVisualNode[] = [
  { label: 'Ask', slot: 'a' },
  { label: 'Facts', slot: 'b' },
  { label: 'Next', slot: 'c' },
]

const defaultHeroMarketFilters = ['Service type', 'Coverage area', 'Needs reply'] as const

const defaultHeroMarketResults: readonly AeLandingMarketResult[] = [
  {
    title: 'Emergency plumber',
    description: 'Burst pipes, blocked drains, hot water faults',
    area: 'Local area',
    status: 'Check details',
  },
  {
    title: 'Locksmith',
    description: 'Callout area, access notes, identity checks',
    area: 'Nearby suburbs',
    status: 'Contact path',
  },
  {
    title: 'Electrician',
    description: 'Fault type, licence context, service area',
    area: 'Local',
    status: 'Published facts',
  },
]

const fieldRoleAliases: Partial<Record<string, AeAnswerRecordFieldRole>> = {
  'business-proof': 'source',
  'check-first': 'unknown',
  'contact-path': 'next-step',
  coverage: 'known',
  'correction-path': 'correction-path',
  'fact-note': 'source',
  'hours-or-unknown': 'unknown',
  'looking-for': 'known',
  location: 'known',
  'needs-confirming': 'unknown',
  'not-available-here': 'unavailable',
  'not-here': 'unavailable',
  'not-live': 'unavailable',
  'not-offered-here': 'unavailable',
  'provided-by': 'source',
  'published-area': 'known',
  service: 'known',
  source: 'source',
}

function fieldKey(label: string): string {
  return label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

function fieldRole(field: AeLandingFact): string {
  return field.role ?? fieldRoleAliases[fieldKey(field.label)] ?? fieldKey(field.label)
}

const trustByRole: Partial<Record<string, string>> = {
  known: 'confirmed',
  source: 'confirmed',
  unknown: 'needs-confirmation',
  unavailable: 'not-offered',
  'next-step': 'next-step',
  'correction-path': 'correction-path',
}

/**
 * Neutral, customer-facing trust value for the DOM. Epistemic roles
 * (known/unknown/unavailable/source) map to plain trust language so the
 * agent-layer vocabulary never reaches markup (DESIGN.md §7, §13).
 */
function fieldTrust(field: AeLandingFact): string {
  const role = fieldRole(field)
  return trustByRole[role] ?? role
}

export function AePublicLandingPage({ children }: AePublicLandingPageProps) {
  return <div className="ae-public-page">{children}</div>
}

export function AeLandingHero({
  kicker,
  title,
  lede,
  subcopy,
  actions,
  proof,
  visual,
  record,
  backgroundImage,
}: AeLandingHeroProps) {
  const titleId = useId()
  const heroVisual = record ?? visual

  return (
    <section className="ae-public-hero" aria-labelledby={titleId}>
      {backgroundImage ? (
        <img
          className={cn(
            'ae-public-section-bg',
            'ae-public-hero-bg',
            backgroundImage.position === 'left' && 'ae-public-section-bg--left',
          )}
          src={backgroundImage.src}
          alt={backgroundImage.alt ?? ''}
          loading="eager"
          decoding="async"
          aria-hidden={!backgroundImage.alt}
        />
      ) : null}
      <div className="ae-public-container ae-public-hero-grid">
        <div className="ae-public-hero-copy ae-public-reveal">
          <p className="ae-public-kicker">{kicker}</p>
          <h1 id={titleId}>{title}</h1>
          <p className="ae-public-hero-lede">{lede}</p>
          {subcopy ? <p className="ae-public-hero-subcopy">{subcopy}</p> : null}
          {actions}
          {proof}
        </div>
        {heroVisual}
      </div>
    </section>
  )
}

export function AeLandingHeroVisual({
  imageSrc,
  imageAlt,
  imageCaption,
  ariaLabel = 'Example customer service search and business details',
  marketLabel = 'Browse local services',
  marketSearchLabel = 'Example service search',
  marketQuery = 'burst pipe near me tonight',
  marketFilters = defaultHeroMarketFilters,
  marketResults = defaultHeroMarketResults,
  showMarketPanel = true,
  children,
}: AeLandingHeroVisualProps) {
  return (
    <aside className="ae-public-hero-visual ae-public-reveal" aria-label={ariaLabel}>
      {showMarketPanel ? (
        <div className="ae-public-market-panel" role="group" aria-label={marketLabel}>
          <div className="ae-public-market-head">
            <span>{marketLabel}</span>
            <SlidersHorizontalIcon aria-hidden="true" className="size-4" />
          </div>
          <div className="ae-public-market-query" role="search" aria-label={marketSearchLabel}>
            <SearchIcon aria-hidden="true" className="size-5" />
            <span>{marketQuery}</span>
          </div>
          <div className="ae-public-market-filters" role="list" aria-label="Example service filters">
            {marketFilters.map((filter) => (
              <span key={filter} role="listitem">
                {filter}
              </span>
            ))}
          </div>
          <div className="ae-public-market-results" role="list" aria-label="Example matching local services">
            {marketResults.map((result) => (
              <article
                key={`${result.title}-${result.area ?? 'local'}`}
                className="ae-public-market-result"
                role="listitem"
              >
                <div>
                  <strong>{result.title}</strong>
                  <p>{result.description}</p>
                </div>
                {result.area ? <span>{result.area}</span> : null}
                {result.status ? <em>{result.status}</em> : null}
              </article>
            ))}
          </div>
        </div>
      ) : null}
      <figure className="ae-public-hero-graphic">
        <img src={imageSrc} alt={imageAlt} width="800" height="1000" loading="eager" decoding="async" />
        {imageCaption ? <figcaption>{imageCaption}</figcaption> : null}
      </figure>
      {children}
    </aside>
  )
}

export function AeLandingBand({
  tone,
  grid = defaultSectionGridByTone[tone],
  className,
  containerClassName,
  ariaLabel,
  backgroundImage,
  children,
}: AeLandingBandProps) {
  return (
    <section
      className={cn('ae-public-section', `ae-public-${tone}-section`, className)}
      aria-label={ariaLabel}
    >
      {backgroundImage ? (
        <img
          className={cn(
            'ae-public-section-bg',
            backgroundImage.position === 'left' && 'ae-public-section-bg--left',
          )}
          src={backgroundImage.src}
          alt={backgroundImage.alt ?? ''}
          loading="lazy"
          decoding="async"
          aria-hidden={!backgroundImage.alt}
        />
      ) : null}
      <div className={cn('ae-public-container', grid && `ae-public-${grid}-grid`, containerClassName)}>
        {children}
      </div>
    </section>
  )
}

export function AeSectionCopy({ title, description, action, className }: AeSectionCopyProps) {
  const titleId = useId()

  return (
    <div className={cn('ae-public-section-copy ae-public-reveal', className)} aria-labelledby={titleId}>
      <h2 id={titleId}>{title}</h2>
      <p>{description}</p>
      {action}
    </div>
  )
}

export function AeLandingCtaRow({ children }: AeLandingCtaRowProps) {
  return <div className="ae-public-cta-row">{children}</div>
}

export function AeButtonIcon({ children }: AeButtonIconProps) {
  return (
    <span className="ae-public-button-icon" aria-hidden="true">
      {children}
    </span>
  )
}

export function AeProofStrip({ items, ariaLabel = 'Local service discovery steps' }: AeProofStripProps) {
  return (
    <div className="ae-public-proof-strip" role="list" aria-label={ariaLabel}>
      {items.map((item) => (
        <article key={item.step} role="listitem">
          <span>{item.step}</span>
          <strong>{item.title}</strong>
          <p>{item.description}</p>
        </article>
      ))}
    </div>
  )
}

export function AeAnswerRecordCard({
  eyebrow,
  question,
  statusLabel,
  businessName,
  fields,
  footerIcon,
  footer,
  ariaLabel = 'Example customer-facing service answer',
}: AeAnswerRecordCardProps) {
  return (
    <aside className="ae-public-answer-card ae-public-reveal" aria-label={ariaLabel}>
      <div className="ae-public-answer-card-top">
        <span>{eyebrow}</span>
      </div>
      <p className="ae-public-question">{question}</p>
      <div className="ae-public-answer-status">
        <span>{statusLabel}</span>
        <strong>{businessName}</strong>
      </div>
      <dl className="ae-public-answer-grid">
        {fields.map((field) => (
          <div key={field.label} data-trust={fieldTrust(field)}>
            <dt>
              <span>{field.label}</span>
            </dt>
            <dd className="m-0">
              <p>{field.value}</p>
            </dd>
          </div>
        ))}
      </dl>
      <div className="ae-public-answer-card-footer">
        {footerIcon}
        <span>{footer}</span>
      </div>
    </aside>
  )
}

export function AeStakeList({
  items,
  ariaLabel = 'Why local service facts need a clear listing',
}: AeStakeListProps) {
  return (
    <div className="ae-public-stakes-list" role="list" aria-label={ariaLabel}>
      {items.map((item, index) => (
        <article
          key={item.label}
          className="ae-public-stake-row"
          data-offset={index === 0 ? undefined : String(index)}
          role="listitem"
        >
          <span>{item.label}</span>
          <p>{item.value}</p>
        </article>
      ))}
    </div>
  )
}

export function AeSignalGrid({
  items,
  ariaLabel = 'What the service listing clarifies',
}: AeSignalGridProps) {
  return (
    <div className="ae-public-answer-parts" role="list" aria-label={ariaLabel}>
      {items.map(({ title, description, Icon, emphasis }) => (
        <article key={title} className="ae-public-answer-part" data-emphasis={emphasis} role="listitem">
          <Icon aria-hidden="true" className="size-5" />
          <h3>{title}</h3>
          <p>{description}</p>
        </article>
      ))}
    </div>
  )
}

export function AeRecordPreview({
  mark,
  name,
  label,
  seal,
  headline,
  fields,
  ariaLabel = 'Example public service page preview',
}: AeRecordPreviewProps) {
  return (
    <aside className="ae-public-record-preview ae-public-reveal" aria-label={ariaLabel}>
      <div className="ae-public-record-preview-top">
        <div className="ae-public-record-mark" aria-hidden="true">
          {mark}
        </div>
        <div className="ae-public-record-title">
          <strong>{name}</strong>
          <span>{label}</span>
        </div>
        <span className="ae-public-record-seal">{seal}</span>
      </div>
      <div className="ae-public-record-headline">{headline}</div>
      <dl className="ae-public-record-facts">
        {fields.map((field) => (
          <div key={field.label} data-trust={fieldTrust(field)}>
            <dt>{field.label}</dt>
            <dd>{field.value}</dd>
          </div>
        ))}
      </dl>
    </aside>
  )
}

export function AePathway({
  steps,
  title = 'From customer question to clear next step.',
  stepsAriaLabel = 'How a customer question becomes a clear next step',
  visualNodes = defaultPathVisualNodes,
}: AePathwayProps) {
  const titleId = useId()

  return (
    <>
      <div className="ae-public-path-visual ae-public-reveal" aria-hidden="true">
        {visualNodes.map((node) => (
          <div
            key={`${node.slot}-${node.label}`}
            className={cn('ae-public-node', `ae-public-node-${node.slot}`)}
          >
            {node.label}
          </div>
        ))}
      </div>
      <div className="ae-public-path-copy ae-public-reveal" aria-labelledby={titleId}>
        <h2 id={titleId}>{title}</h2>
        <div className="ae-public-path-list" role="list" aria-label={stepsAriaLabel}>
          {steps.map(({ title: stepTitle, description, Icon }) => (
            <article key={stepTitle} role="listitem">
              <Icon aria-hidden="true" className="size-5" />
              <div>
                <h3>{stepTitle}</h3>
                <p>{description}</p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </>
  )
}

export function AeServiceRows({
  services,
  ariaLabel = 'Example local service categories',
}: AeServiceRowsProps) {
  return (
    <div className="ae-public-service-list" role="list" aria-label={ariaLabel}>
      {services.map((service, index) => (
        <article key={service.title} className="ae-public-service-row" role="listitem">
          <span className="ae-public-service-row-index" aria-hidden="true">
            {String(index + 1).padStart(2, '0')}
          </span>
          <div className="ae-public-service-row-main">
            <h3>{service.title}</h3>
            <p>{service.description}</p>
          </div>
          <div className="ae-public-service-row-meta">
            {service.meta ? <span>{service.meta}</span> : null}
            <strong>{service.status ?? 'Details listed'}</strong>
          </div>
        </article>
      ))}
    </div>
  )
}

export function AeBoundaryPanel({
  rows,
  title = 'What is clear today',
  ariaLabel = 'Published details and open questions',
}: AeBoundaryPanelProps) {
  return (
    <aside className="ae-public-boundary-panel ae-public-reveal" aria-label={ariaLabel}>
      <div className="ae-public-boundary-search">
        <span>{title}</span>
      </div>
      {rows.map((row) => (
        <div key={row.label} className="ae-public-boundary-row" data-trust={fieldTrust(row)}>
          <span>{row.label}</span>
          <p>{row.value}</p>
        </div>
      ))}
    </aside>
  )
}

export function AeFaqList({
  items,
  ariaLabel = 'Common questions about local service listings',
}: AeFaqListProps) {
  return (
    <div className="ae-public-faq-list" aria-label={ariaLabel}>
      {items.map((item, index) => (
        <details key={item.title} className="ae-public-faq-item" open={index === 0}>
          <summary>{item.title}</summary>
          <p>{item.description}</p>
        </details>
      ))}
    </div>
  )
}

export function AePublicRecordHero({
  kicker,
  title,
  description,
  actions,
  record,
}: AePublicRecordHeroProps) {
  const titleId = useId()

  return (
    <section className="ae-public-detail-hero" aria-labelledby={titleId}>
      <div className="ae-public-container ae-public-detail-hero-grid">
        <div className="ae-public-detail-copy ae-public-reveal">
          <p className="ae-public-kicker">{kicker}</p>
          <h1 id={titleId}>{title}</h1>
          <p>{description}</p>
          {actions}
        </div>
        {record}
      </div>
    </section>
  )
}

export function AePublicServiceReadbacks({
  services,
  title = 'Public service facts',
  ariaLabel = 'Public service details',
}: AePublicServiceReadbacksProps) {
  const titleId = useId()

  return (
    <section className="ae-public-service-readbacks" aria-labelledby={titleId}>
      <div className="ae-public-service-readbacks-head">
        <h2 id={titleId}>{title}</h2>
      </div>
      <div className="ae-public-service-readback-list" role="list" aria-label={ariaLabel}>
        {services.map((service, index) => (
          <article key={service.title} className="ae-public-service-readback" role="listitem">
            <span className="ae-public-service-readback-index" aria-hidden="true">
              {String(index + 1).padStart(2, '0')}
            </span>
            <div className="ae-public-service-readback-head">
              <h3>{service.title}</h3>
              <p>{service.description}</p>
            </div>
            <dl className="ae-public-service-readback-facts">
              {service.facts.map((fact) => (
                <div key={fact.label} data-trust={fieldTrust(fact)}>
                  <dt>{fact.label}</dt>
                  <dd>{fact.value}</dd>
                </div>
              ))}
            </dl>
            {service.status ? <div className="ae-public-service-readback-status">{service.status}</div> : null}
          </article>
        ))}
      </div>
    </section>
  )
}

export function AePublicStatusPanel({
  title,
  description,
  ariaLabel,
  children,
}: AePublicStatusPanelProps) {
  const titleId = useId()

  return (
    <aside className="ae-public-status-panel ae-public-reveal" aria-labelledby={titleId} aria-label={ariaLabel}>
      <div className="ae-public-status-panel-head">
        <h2 id={titleId}>{title}</h2>
        {description ? <p>{description}</p> : null}
      </div>
      <div className="ae-public-status-stack">{children}</div>
    </aside>
  )
}

export function AeClosingObject({
  icon,
  label,
  children,
}: AeClosingObjectProps) {
  const labelId = useId()
  const summaryId = useId()

  return (
    <aside
      className="ae-public-closing-object ae-public-reveal"
      aria-labelledby={labelId}
      aria-describedby={summaryId}
    >
      <span aria-hidden="true">{icon}</span>
      <span id={labelId}>{label}</span>
      <strong id={summaryId}>{children}</strong>
    </aside>
  )
}
