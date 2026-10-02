import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'
import { animate, motion, useDragControls, useMotionValue, useReducedMotion } from 'motion/react'
import type { PanInfo } from 'motion/react'
import { ArrowUpRight, Braces, ChevronDown, ChevronLeft, ChevronRight, GripHorizontal } from 'lucide-react'

import { motionTokens } from '../lib/motion-tokens'
import './ProductDetail.css'

/**
 * Adapted from https://uiarc.dev/components/blocks/product-detail on 2026-10-01.
 * Upstream TSX SHA-256: d359c56cb730ffe8626cdcb5df7f6da5f8f70391bba2db735c8c2c53533270c2
 * Content gallery, decision column and unfolding detail retain the authored block.
 */
export type DetailSlide = Readonly<{
  id: string
  label: string
  description: string
  content: ReactNode
}>

type DetailSection = Readonly<{ id: string; title: string; content: ReactNode }>

export type ProductDetailProps = Readonly<{
  id: string
  title: string
  summary?: string
  breadcrumb: ReactNode
  surfaceLabel: string
  priceLabel?: string
  facts: ReactNode
  disclosure?: ReactNode
  context?: ReactNode
  primary: Readonly<{ label: string; onSelect: () => void }>
  chatHref?: string
  slides: readonly DetailSlide[]
  sections: readonly DetailSection[]
}>

// Arc's momentum projection makes a flick settle on the adjacent published panel.
const project = (velocity: number, rate = 0.998) => (velocity / 1000) * rate / (1 - rate)

function Gallery({ slides, name }: Readonly<{ slides: readonly DetailSlide[]; name: string }>) {
  const reduced = useReducedMotion() ?? false
  const ringId = useId()
  const [index, setIndex] = useState(0)
  const viewport = useRef<HTMLDivElement>(null)
  const width = useRef(0)
  const indexRef = useRef(0)
  const pointerStart = useRef<Readonly<{ x: number; y: number }> | null>(null)
  const dragged = useRef(false)
  const animation = useRef<ReturnType<typeof animate> | null>(null)
  const x = useMotionValue(0)
  const dragControls = useDragControls()
  const count = slides.length

  useLayoutEffect(() => {
    const element = viewport.current
    if (!element) return
    const clamped = Math.max(0, Math.min(indexRef.current, count - 1))
    if (clamped !== indexRef.current) {
      indexRef.current = clamped
      setIndex(clamped)
    }
    const measure = () => {
      animation.current?.stop()
      width.current = element.clientWidth
      x.set(-indexRef.current * width.current)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [count, x])

  useEffect(() => () => animation.current?.stop(), [])

  const go = useCallback((next: number, velocity = 0) => {
    const target = Math.max(0, Math.min(count - 1, next))
    indexRef.current = target
    setIndex(target)
    animation.current?.stop()
    animation.current = animate(x, -target * width.current, reduced ? { duration: 0 } : { ...motionTokens.spring.smooth, velocity })
  }, [count, reduced, x])

  const onDragEnd = (_: unknown, info: PanInfo) => {
    const resting = x.get() + project(info.velocity.x)
    const nearest = Math.round(-resting / (width.current || 1))
    go(Math.max(indexRef.current - 1, Math.min(indexRef.current + 1, nearest)), info.velocity.x)
  }

  const onKey = (event: KeyboardEvent<HTMLDivElement>) => {
    // Published JSON remains selectable; child controls own their own keys.
    if (event.target !== event.currentTarget) return
    if (event.key === 'ArrowRight') { event.preventDefault(); go(indexRef.current + 1) }
    else if (event.key === 'ArrowLeft') { event.preventDefault(); go(indexRef.current - 1) }
    else if (event.key === 'Home') { event.preventDefault(); go(0) }
    else if (event.key === 'End') { event.preventDefault(); go(count - 1) }
  }

  if (count === 0) return <p>No published examples are available.</p>

  return <section className="arc-pdp-gallery" aria-labelledby={`${ringId}-heading`}>
    <div className="arc-pdp-galleryHeading">
      <h2 id={`${ringId}-heading`}>Example</h2>
      <span className="arc-pdp-muted">Published material</span>
    </div>
    <div ref={viewport} className="arc-pdp-viewport" role="region" aria-roledescription="carousel" aria-label={`${name} published examples`} tabIndex={count > 1 ? 0 : undefined} onKeyDown={onKey}>
      <motion.div className="arc-pdp-track" style={{ x }} drag={count > 1 ? 'x' : false} dragListener={false} dragControls={dragControls} dragConstraints={viewport} dragElastic={0.16} dragMomentum={false} onDragStart={() => { dragged.current = true }} onDragEnd={onDragEnd}>
        {slides.map((slide, position) => <div key={slide.id} className="arc-pdp-slide" role="group" aria-roledescription="slide" aria-label={`${slide.label}, ${position + 1} of ${count}`} aria-hidden={position !== index} inert={position !== index}>
          <div className="arc-pdp-slideImage">
            <div className="arc-pdp-previewTitle"><Braces size={22} strokeWidth={1.5} aria-hidden="true" /><h3>{slide.label}</h3></div>
            <p className="arc-pdp-previewDescription">{slide.description}</p>
            <div className="arc-pdp-previewContent">{slide.content}</div>
          </div>
        </div>)}
      </motion.div>
    </div>
    {count > 1 ? <>
      <div className="arc-pdp-galleryControls">
        <button type="button" className="arc-pdp-arrow" onClick={() => go(index - 1)} disabled={index === 0} aria-label="Previous example"><ChevronLeft size={18} aria-hidden="true" /></button>
        <button type="button" className="arc-pdp-dragHandle" onPointerDown={event => {
          pointerStart.current = { x: event.clientX, y: event.clientY }
          dragged.current = false
          dragControls.start(event)
        }} onPointerMove={event => {
          const start = pointerStart.current
          if (start !== null && Math.hypot(event.clientX - start.x, event.clientY - start.y) > 3) dragged.current = true
        }} onPointerUp={() => { pointerStart.current = null }} onPointerCancel={() => { pointerStart.current = null; dragged.current = true }} onClick={event => {
          if (event.detail > 0 && dragged.current) { dragged.current = false; return }
          go(indexRef.current === count - 1 ? 0 : indexRef.current + 1)
        }} aria-label="Next example or drag to browse"><GripHorizontal size={18} aria-hidden="true" /><span>Explore examples</span></button>
        <span className="arc-pdp-counter" role="status" aria-live="polite"><span aria-hidden="true">{index + 1}/{count}</span><span className="arc-pdp-srOnly">Example {index + 1} of {count}</span></span>
        <button type="button" className="arc-pdp-arrow" onClick={() => go(index + 1)} disabled={index === count - 1} aria-label="Next example"><ChevronRight size={18} aria-hidden="true" /></button>
      </div>
      <div className="arc-pdp-thumbs" role="group" aria-label="Choose a published example">
        {slides.map((slide, position) => <button key={slide.id} type="button" className="arc-pdp-thumb" aria-label={`Show ${slide.label}`} aria-current={position === index || undefined} onClick={() => go(position)}>
          <span className="arc-pdp-thumbImage"><Braces size={17} aria-hidden="true" /><span>{slide.label}</span></span>
          {position === index ? <motion.span layoutId={ringId} className="arc-pdp-thumbRing" transition={reduced ? { duration: 0 } : motionTokens.spring.snappy} /> : null}
        </button>)}
      </div>
    </> : null}
  </section>
}

export function ProductDetail({ id, title, summary, breadcrumb, surfaceLabel, priceLabel, facts, disclosure, context, primary, chatHref, slides, sections }: ProductDetailProps) {
  const uid = useId()
  const reduced = useReducedMotion() ?? false
  const [openSections, setOpenSections] = useState<string[]>([])
  const toggleSection = (sectionId: string) => setOpenSections(current => current.includes(sectionId) ? current.filter(item => item !== sectionId) : [...current, sectionId])

  return <article className="arc-market arc-pdp-root" aria-label={`${title} Tool details`}>
    <header className="arc-pdp-top">
      <nav aria-label="Breadcrumb" className="arc-pdp-crumbs">{breadcrumb}</nav>
      <span className="arc-pdp-surfaceLabel">{surfaceLabel}</span>
    </header>
    <div className="arc-pdp-layout">
      <section className="arc-pdp-info" aria-label="Tool decision facts">
        <div className="arc-pdp-titleBlock">
          <div className="arc-pdp-titleRow"><h1>{title}</h1></div>
          {summary === undefined ? null : <p className="arc-pdp-summary">{summary}</p>}
          {priceLabel === undefined ? null : <div className="arc-pdp-priceRow"><span className="arc-pdp-price">{priceLabel}</span></div>}
        </div>
        <div className="arc-pdp-facts">{facts}</div>
        {context === undefined ? null : <div className="arc-pdp-context">{context}</div>}
        {disclosure === undefined ? null : <div className="arc-pdp-disclosure">{disclosure}</div>}
        <section id="start" className="arc-pdp-start" aria-labelledby={`${uid}-start`}>
          <h2 id={`${uid}-start`}>Start</h2>
          <button type="button" className="arc-pdp-addButton" onClick={primary.onSelect}><span className="arc-pdp-buttonInner">{primary.label}<ArrowUpRight size={18} aria-hidden="true" /></span></button>
          {chatHref === undefined ? null : <a href={chatHref} className="arc-pdp-chat">Try in chat (may charge after approval)<ArrowUpRight size={15} aria-hidden="true" /></a>}
        </section>
        <div className="arc-pdp-accordion">
          {sections.map(section => {
            const open = openSections.includes(section.id)
            return <section key={section.id} className="arc-pdp-section">
              <h2><button id={`${uid}-${section.id}-trigger`} type="button" className="arc-pdp-sectionButton" aria-expanded={open} aria-controls={`${uid}-${section.id}`} onClick={() => toggleSection(section.id)}>{section.title}<ChevronDown size={16} aria-hidden="true" className="arc-pdp-sectionChevron" data-open={open || undefined} /></button></h2>
              <motion.div id={`${uid}-${section.id}`} role="region" aria-labelledby={`${uid}-${section.id}-trigger`} aria-hidden={!open} inert={!open} className="arc-pdp-sectionBody" initial={false} animate={{ height: open ? 'auto' : 0, opacity: open ? 1 : 0 }} transition={reduced ? { duration: 0 } : { height: motionTokens.spring.smooth, opacity: { duration: motionTokens.duration.fast } }}>
                  <div className="arc-pdp-sectionText">{section.content}</div>
              </motion.div>
            </section>
          })}
        </div>
      </section>
      <div className="arc-pdp-media"><Gallery key={id} slides={slides} name={title} /></div>
    </div>
  </article>
}
