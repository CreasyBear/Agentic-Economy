import { Await, useRouter, type ErrorComponentProps } from '@tanstack/react-router'
import type { ReactNode } from 'react'

import { CtaSection } from '@/components/arc/blocks/cta-section/cta-section'
import { FaqSection } from '@/components/arc/blocks/faq-section/faq-section'
import { FeatureBento, type BentoFeature, type BentoSize } from '@/components/arc/blocks/feature-bento/feature-bento'
import { HeroSection } from '@/components/arc/blocks/hero-section/hero-section'
import { StatsBand, type Stat } from '@/components/arc/blocks/stats-band/stats-band'
import { AePublicPage } from '@/components/ae/layout/AePublicPage'
import { ToolConnect } from '@/components/ae/market/public-tool-detail/ToolConnect'
import { RouterLinkBoundary } from '@/components/ae/shared/router-link-boundary/RouterLinkBoundary'
import { PUBLIC_SURFACE } from '@/content/brand-copy'
import { toDirectoryToolCardModel } from '@/modules/market/directory-card.view-model'

import { AeLandingSearch } from './AeLandingSearch'
import { AePopularTools, AeToolRows, LandingRowsSkeleton, LandingRowsUnavailable } from './AeToolRows'
import { LANDING_COPY, LANDING_FAQ } from './landing-content'
import type { LandingData, LandingStats, LandingTask } from './landing.functions'
import styles from './AeLanding.module.css'

/** The bento's own rhythm for six cells; three cells sit as one even row. */
const SIX_CELL_SIZES: readonly BentoSize[] = ['wide', 'tall', 'regular', 'regular', 'half', 'half']

function taskFeatures(tasks: readonly LandingTask[]): BentoFeature[] {
  // A multiple of three, so the grid never leaves an empty slot.
  const shown = tasks.slice(0, tasks.length >= 6 ? 6 : 3)
  return shown.map((task, index) => {
    const tool = toDirectoryToolCardModel(task.entry)
    return {
      id: task.id,
      title: task.title,
      // The cell title already names the job; the line underneath says who answers it and what it costs.
      description: LANDING_COPY.taskDescription(tool.providerLine, tool.priceLabel),
      // The bento only types its built-in art; `visuals` replaces it by id below.
      visual: 'command',
      size: shown.length === 6 ? SIX_CELL_SIZES[index] ?? 'regular' : 'regular',
      href: `/tools/${encodeURIComponent(tool.providerHost)}/${encodeURIComponent(tool.slug)}`,
    }
  })
}

/**
 * The provider's own example, a captioned figure so screen readers get it too: its sample input and response
 * when published, otherwise the request the tool answers. The caption says which; the provider is named once, below.
 */
function SampleVisual({ task }: Readonly<{ task: LandingTask }>) {
  const caption = task.sample === undefined ? LANDING_COPY.requestLabel : task.input === undefined ? LANDING_COPY.sampleLabel : LANDING_COPY.sampleIoLabel
  return (
    <figure className={styles.sample}>
      <figcaption className={styles.sampleHead}>{caption}</figcaption>
      <div className={styles.sampleBody}>
        {task.sample === undefined
          ? <p className={styles.request}>{task.request}</p>
          : <>{task.input === undefined ? null : <p className={styles.request}>{task.input}</p>}<pre className={styles.code}>{task.sample}</pre></>}
      </div>
    </figure>
  )
}

function landingStats(stats: LandingStats): Stat[] {
  return [
    { value: stats.totalTools, label: LANDING_COPY.statTools, detail: LANDING_COPY.statToolsDetail },
    ...(stats.medianAud === undefined ? [] : [{
      value: stats.medianAud,
      prefix: 'A$',
      decimals: stats.medianDecimals ?? 2,
      label: LANDING_COPY.statMedian,
      detail: LANDING_COPY.statMedianDetail,
      // Real price bands, cheapest first; bars up to the median's band are inked.
      ...(stats.priceBins === undefined || stats.medianMarker === undefined ? {} : {
        visual: { kind: 'distribution' as const, bins: [...stats.priceBins], max: stats.priceBins.length, marker: stats.medianMarker },
      }),
    }]),
  ]
}

/** Everything below the hero that needs the directory. */
function LandingSections({ data }: Readonly<{ data: LandingData }>) {
  const { popular, rows, tasks, stats } = data
  return (
    <>
      <AePopularTools entries={popular} />
      <AeToolRows rows={rows} />
      {tasks.length < 3 ? null : (
        <FeatureBento
          title={LANDING_COPY.tasksTitle}
          description={LANDING_COPY.tasksDescription}
          features={taskFeatures(tasks)}
          visuals={Object.fromEntries(tasks.map(task => [task.id, <SampleVisual key={task.id} task={task} />]))}
        />
      )}
      {stats === undefined ? null : (
        <StatsBand layout="divided" locale="en-AU" title={LANDING_COPY.statsTitle} stats={landingStats(stats)} />
      )}
    </>
  )
}

/** Connect your client needs only the site's URL, so it paints with the hero instead of popping in with the rows. */
function LandingConnect({ canonicalBaseUrl }: Readonly<{ canonicalBaseUrl: string }>) {
  return (
    <section className={styles.connect} aria-labelledby="landing-connect">
      <header className={styles.connectHead}>
        <h2 id="landing-connect" className={styles.connectTitle}>{LANDING_COPY.connectTitle}</h2>
        <p className={styles.connectText}>{LANDING_COPY.connectDescription}</p>
      </header>
      <ToolConnect baseUrl={canonicalBaseUrl} />
    </section>
  )
}

/**
 * The page frame: hero first, so the headline and search paint before the directory answers.
 * The tail is a closing band: the provider pitch, plain answers, then the buyer's next step.
 * `AePublicPage` owns the main landmark and the one site footer, as on every public page.
 */
function LandingFrame({ data, canonicalBaseUrl, children }: Readonly<{ data?: Promise<LandingData>; canonicalBaseUrl?: string | undefined; children: ReactNode }>) {
  return (
    <AePublicPage>
      <RouterLinkBoundary>
        <div className={`arc-market ${styles.page}`}>
          <HeroSection
            className={styles.hero ?? ''}
            variant="centered"
            animateIn={false}
            title={PUBLIC_SURFACE.headline}
            description={PUBLIC_SURFACE.subhead}
            media={<AeLandingSearch data={data} />}
          />
          {children}
          {canonicalBaseUrl === undefined ? null : <LandingConnect canonicalBaseUrl={canonicalBaseUrl} />}
          <CtaSection
            variant="centered"
            title={LANDING_COPY.providerTitle}
            description={LANDING_COPY.providerDescription}
            primaryAction={{ label: LANDING_COPY.providerAction, href: '/for-providers' }}
            secondaryAction={{ label: LANDING_COPY.providerSecondary, href: '/developers/api' }}
            note=""
            faces={[]}
          />
          <FaqSection variant="accordion" description={LANDING_COPY.faqDescription} items={[...LANDING_FAQ]} contact={LANDING_COPY.faqContact} />
          <CtaSection
            variant="centered"
            title={LANDING_COPY.buyerTitle}
            description={LANDING_COPY.buyerDescription}
            primaryAction={{ label: LANDING_COPY.buyerAction, href: '/market' }}
            secondaryAction={{ label: LANDING_COPY.buyerSecondary, href: '/sign-in' }}
            note=""
            faces={[]}
          />
        </div>
      </RouterLinkBoundary>
    </AePublicPage>
  )
}

/**
 * `/`: Airbnb search and rows, OpenRouter breadth, Stripe-plain facts. Stock Arc blocks, real directory data.
 * The directory read streams in behind the hero; until it lands, the rows show as skeletons.
 */
export function AeLanding({ data, canonicalBaseUrl }: Readonly<{ data: Promise<LandingData>; canonicalBaseUrl?: string | undefined }>) {
  return (
    <LandingFrame data={data} canonicalBaseUrl={canonicalBaseUrl}>
      <Await promise={data} fallback={<LandingRowsSkeleton />}>
        {resolved => <LandingSections data={resolved} />}
      </Await>
    </LandingFrame>
  )
}

/** Route pending state: the same hero over row skeletons, never the generic list skeleton. */
export function LandingPending() {
  return <LandingFrame><LandingRowsSkeleton /></LandingFrame>
}

/** Route error state: the hero still searches; the rows say why they are missing, offer a retry, and where to go. */
export function LandingError({ reset }: ErrorComponentProps) {
  const router = useRouter()
  return (
    <LandingFrame>
      <LandingRowsUnavailable onRetry={() => { reset(); void router.invalidate() }} />
    </LandingFrame>
  )
}
