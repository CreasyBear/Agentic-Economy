/* Arc Pro upstream SHA-256: 45e258f3eb2a27dcf84d4cf1afc5b95cba17ac56f8888385c4524c706ecfd19c; retrieved 2026-10-01. */
// Adapted from the licensed Arc Pro product-listing block, retrieved 1 October 2026.
// The authored frame, media/quick-action composition, catalogue grid and motion
// remain; AE supplies controlled identity, prices, saved state and comparison.
import { Link } from '@tanstack/react-router'
import { ArrowLeft, ArrowRight, ArrowUpRight, Braces, Check, Heart } from 'lucide-react'
import { motion, useReducedMotion } from 'motion/react'
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'

import { MARKET_LINK_STATE } from '@/components/ae/market/market-return-context'
import { motionTokens } from '@/components/arc/lib/motion-tokens'
import { directoryFieldWords, type DirectoryToolCardModel } from '@/modules/market/directory-card.view-model'
import type { X402DirectoryEntry } from '@/modules/market/x402-directory'
import './ProductListing.css'

export type ProductListingCardProps = Readonly<{
  model: DirectoryToolCardModel
  entry?: X402DirectoryEntry
  onSave?: () => void
  saved?: boolean
  saveDisabled?: boolean
  saveUnknown?: boolean
  onCompare?: () => void
  comparing?: boolean
  compareDisabled?: boolean
}>

/** The parent owns filters, sorting and cursor paging. This block only composes results. */
export function ProductListing({ children, className = '' }: Readonly<{ children: ReactNode; className?: string }>) {
  return <div className={`arc-market arc-listing ${className}`}><div className="arc-listing-frame"><div className="arc-listing-results"><ul className="arc-listing-grid">{children}</ul></div></div></div>
}

function PublishedPreview({ model, entry }: Readonly<{ model: DirectoryToolCardModel; entry?: X402DirectoryEntry }>) {
  const inputs = entry?.input?.fields.filter(field => field.location !== 'headers' && field.location !== 'output').slice(0, 3) ?? []
  const outputs = entry?.output?.fields.filter(field => field.location === 'output').slice(0, 3) ?? []
  const summary = model.outputLabel ?? model.glance ?? model.description
  const hasSummary = summary !== undefined && summary.trim() !== '' && summary !== 'The provider has not supplied a description.'
  const metric = model.callsLabel !== undefined ? { value: model.callsLabel, label: 'Coinbase Bazaar calls · 30 days' }
    : model.payersLabel !== undefined ? { value: model.payersLabel, label: 'Coinbase Bazaar paying addresses · 30 days' }
    : undefined
  return <div className="arc-listing-preview">
    {inputs.length > 0 || outputs.length > 0 ? <>
      <div className="arc-listing-contract"><span className="arc-listing-preview-label">Input</span><div className="arc-listing-fields">{inputs.length === 0 ? <span className="arc-listing-unpublished">Not described</span> : inputs.map(field => <span key={`${field.location}:${field.path}`} title={field.description}>{directoryFieldWords(field.name) ?? field.name}{field.required ? <span aria-label="required"> *</span> : null}</span>)}</div></div>
      <ArrowRight className="arc-listing-flow" size={22} strokeWidth={1.5} aria-hidden="true" />
      <div className="arc-listing-contract"><span className="arc-listing-preview-label">Output</span><div className="arc-listing-fields">{outputs.length === 0 ? <span className="arc-listing-unpublished">{model.outputLabel ?? 'Not described'}</span> : outputs.map(field => <span key={field.path} title={field.description}>{directoryFieldWords(field.name) ?? field.name}</span>)}</div></div>
    </> : hasSummary ? <>
      <Braces className="arc-listing-contribution-icon" size={32} strokeWidth={1.25} aria-hidden="true" />
      <p className="arc-listing-preview-label">{model.outputLabel === undefined ? 'Contribution' : 'Returns'}</p>
      <p className="arc-listing-contribution">{summary}</p>
    </> : metric !== undefined ? <div className="arc-listing-observation" {...(model.activityTitle === undefined ? {} : { title: model.activityTitle })}>
      <span className="arc-listing-observation-mark" aria-hidden="true"><Braces size={24} strokeWidth={1.25} /></span>
      <p className="arc-listing-observation-value" data-long={metric.value.length > 8 || undefined}>{metric.value}</p>
      <p className="arc-listing-preview-label">{metric.label}</p>
    </div> : <div className="arc-listing-identity-preview">
      <span className="arc-listing-identity-mark" aria-hidden="true">{model.initials}</span>
      <p className="arc-listing-identity-title">{model.title}</p>
      <p className="arc-listing-preview-label">Input and output summary unavailable.</p>
    </div>}
  </div>
}

export function ProductListingCard({ model, entry, onSave, saved = false, saveDisabled = false, saveUnknown = false, onCompare, comparing = false, compareDisabled = false }: ProductListingCardProps) {
  const reduced = useReducedMotion()
  return <motion.article className="arc-market arc-listing-card" data-access={model.access} data-selected={comparing || undefined} layout={reduced ? false : 'position'} transition={reduced ? { duration: 0 } : motionTokens.spring.smooth}>
    <div className="arc-listing-media">
      <div className="arc-listing-media-top">
        <div className="arc-listing-provider"><span className="arc-listing-mark">{model.initials}{model.iconUrl === undefined ? null : <img src={model.iconUrl} alt="" loading="lazy" referrerPolicy="no-referrer" onError={event => { event.currentTarget.hidden = true }} />}</span><span title={model.providerLine}>{model.providerLine}</span></div>
        {onSave === undefined ? null : <button type="button" className="arc-listing-icon-button" onClick={onSave} disabled={saveDisabled} aria-label={saveUnknown ? `Saved status unavailable for ${model.title}` : `${saved ? 'Unsave' : 'Save'} ${model.title}`} {...(saveUnknown ? { title: 'Saved status unavailable' } : { 'aria-pressed': saved })}><Heart size={18} strokeWidth={1.75} fill={saved && !saveUnknown ? 'currentColor' : 'none'} aria-hidden="true" /></button>}
      </div>
      <PublishedPreview model={model} {...(entry === undefined ? {} : { entry })} />
      {model.tags.length === 0 ? null : <div className="arc-listing-tags">{model.tags.map(tag => <span key={tag}>{tag}</span>)}</div>}
      <div className="arc-listing-quick">
        <Link to="/tools/$providerHost/$slug" params={{ providerHost: model.providerHost, slug: model.slug }} state={MARKET_LINK_STATE} className="arc-listing-inspect">Inspect Tool<ArrowUpRight size={16} strokeWidth={1.75} aria-hidden="true" /></Link>
        {onCompare === undefined ? null : <button type="button" className="arc-listing-compare" onClick={onCompare} disabled={compareDisabled} aria-label={`${comparing ? 'Remove' : 'Add'} ${model.title} ${comparing ? 'from' : 'to'} comparison`} aria-pressed={comparing}>{comparing ? <Check size={15} aria-hidden="true" /> : null}Compare</button>}
      </div>
    </div>
    <div className="arc-listing-info">
      <h3 className="arc-listing-name"><Link to="/tools/$providerHost/$slug" params={{ providerHost: model.providerHost, slug: model.slug }} state={MARKET_LINK_STATE}>{model.title}</Link></h3>
      <p className="arc-listing-access"><span aria-hidden="true" />{model.accessLabel}</p>
      {model.factsLine === undefined ? null : <p className="arc-listing-facts" {...(model.activityTitle === undefined ? {} : { title: model.activityTitle })}>{model.factsLine}</p>}
      <div className="arc-listing-meta"><p className="arc-listing-price">{model.priceLabel || 'Price unavailable'}</p>{model.priceContext === '' ? null : <p className="arc-listing-price-context">{model.priceContext}</p>}</div>
    </div>
  </motion.article>
}

type ShelfProps = Readonly<{
  title: string
  description: string
  children: ReactNode
  action: ReactNode
  label: string
  previousLabel: string
  nextLabel: string
  empty?: ReactNode
}>

/** Native scrolling keeps touch, keyboard and links working without carousel clones. */
export function ProductListingShelf({ title, description, children, action, label, previousLabel, nextLabel, empty }: ShelfProps) {
  const id = useId()
  const track = useRef<HTMLUListElement>(null)
  const reduced = useReducedMotion()
  const [edges, setEdges] = useState({ previous: false, next: false })
  useEffect(() => {
    const element = track.current
    if (element === null) return
    const measure = () => setEdges({ previous: element.scrollLeft > 1, next: element.scrollLeft + element.clientWidth < element.scrollWidth - 1 })
    measure()
    element.addEventListener('scroll', measure, { passive: true })
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => { observer.disconnect(); element.removeEventListener('scroll', measure) }
  }, [children])
  const move = (direction: number) => {
    const element = track.current
    if (element !== null) element.scrollBy({ left: direction * element.clientWidth, behavior: reduced ? 'auto' : 'smooth' })
  }
  return <section className="arc-market arc-listing-shelf" role="region" aria-label={label}>
    <header className="arc-listing-top"><div className="arc-listing-heading"><h2 id={id}>{title}</h2><p>{description}</p></div><div className="arc-listing-tools">{action}{empty === undefined ? <div className="arc-listing-paging"><button type="button" className="arc-listing-icon-button" aria-label={previousLabel} aria-controls={`${id}-track`} disabled={!edges.previous} onClick={() => move(-1)}><ArrowLeft size={18} strokeWidth={1.75} aria-hidden="true" /></button><button type="button" className="arc-listing-icon-button" aria-label={nextLabel} aria-controls={`${id}-track`} disabled={!edges.next} onClick={() => move(1)}><ArrowRight size={18} strokeWidth={1.75} aria-hidden="true" /></button></div> : null}</div></header>
    {empty ?? <ul ref={track} id={`${id}-track`} className="arc-listing-track" tabIndex={0} aria-labelledby={id} onKeyDown={event => {
      if (event.target !== event.currentTarget) return
      if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') { event.preventDefault(); move(event.key === 'ArrowRight' ? 1 : -1) }
      else if (event.key === 'Home' || event.key === 'End') { event.preventDefault(); track.current?.scrollTo({ left: event.key === 'Home' ? 0 : track.current.scrollWidth, behavior: reduced ? 'auto' : 'smooth' }) }
    }}>{children}</ul>}
  </section>
}
