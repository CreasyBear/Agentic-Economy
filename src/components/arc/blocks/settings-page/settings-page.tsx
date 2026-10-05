'use client'

import { useEffect, useId, useLayoutEffect, useRef } from 'react'
import type { ReactNode, Ref, RefObject } from 'react'
import { LayoutGroup, animate, motion, useMotionValue, useReducedMotion } from 'motion/react'
import { motionTokens } from '../../motion-tokens'
import styles from './settings-page.module.css'

/** Arc UI Pro settings-page, installed from the authenticated Arc registry.
 * Upstream TSX SHA-256: 49b9cc765c8b25fea76c9bb111bae51ff21e5e0a0a9c62035c3ffb0b901edda7
 * Adaptation: routed link/content slots replace the demo account, forms and timers.
 * Requires: real route links and committed route content supplied by the caller.
 * Ensures: one page heading, grouped destinations and an exact active destination.
 * Invariant: this block never saves settings or intercepts route changes.
 * On violation: form/route errors remain in the caller's live content.
 */
export type SettingsNavigationItem = Readonly<{ label: string; href: string }>
type NavigationGroup = Readonly<{ label?: string; items: readonly SettingsNavigationItem[] }>
type NavigationLinkProps = Readonly<{ className: string; children: ReactNode; 'aria-current': 'page' | undefined }>

type SettingsPageProps = Readonly<{
  title: string
  description: string
  navigation: readonly NavigationGroup[]
  currentHref: string
  renderNavigationLink: (item: SettingsNavigationItem, props: NavigationLinkProps) => ReactNode
  children: ReactNode
  /** Routed panes own their heading; the frame can retain only its geometry. */
  showHeader?: boolean
  navigationMenu?: ReactNode
}>

export function SettingsPage({ title, description, navigation, currentHref, renderNavigationLink, children, showHeader = true, navigationMenu }: SettingsPageProps) {
  const titleId = useId()
  const navGroup = useId()
  const reduce = useReducedMotion() ?? false
  return <section className={styles.root} aria-labelledby={showHeader ? titleId : undefined} aria-label={showHeader ? undefined : title}>
    {showHeader && <header className={styles.pageHead}>
      <h1 id={titleId}>{title}</h1>
      <p>{description}</p>
    </header>}
    {navigationMenu}
    <div className={styles.settings} data-navigation={navigation.length === 0 ? 'none' : undefined}>
      {navigation.length > 0 ? <aside className={styles.sidebar}>
        <LayoutGroup id={navGroup}>
          <nav aria-label="Settings sections" className={styles.navigation}>
            {navigation.map(group => <section key={group.label ?? 'overview'} className={styles.navGroup} aria-label={group.label}>
              {group.label && <h2>{group.label}</h2>}
              <motion.ul className={styles.navList} layoutScroll>
                {group.items.map(item => {
                  const active = currentHref === item.href
                  return <li key={item.href}>{renderNavigationLink(item, {
                    className: styles.navItem ?? '',
                    'aria-current': active ? 'page' : undefined,
                    children: <>
                      {active && <motion.span layoutId="settings-section" className={styles.highlight} transition={reduce ? { duration: 0 } : motionTokens.spring.morph} aria-hidden="true" />}
                      <span className={styles.navLabel}>{item.label}</span>
                    </>,
                  })}</li>
                })}
              </motion.ul>
            </section>)}
          </nav>
        </LayoutGroup>
      </aside> : null}
      <div className={styles.main}><div className={styles.scroller}>{children}</div></div>
    </div>
  </section>
}

type PaneProps = Readonly<{
  title: string
  description: string
  action?: ReactNode
  children: ReactNode
  headingRef?: Ref<HTMLHeadingElement>
  headingLevel?: 1 | 2
}>

export function SettingsPagePane({ title, description, action, children, headingRef, headingLevel = 2 }: PaneProps) {
  const Heading = headingLevel === 1 ? 'h1' : 'h2'
  return <div className={styles.pane}>
    <header className={styles.paneHead}>
      <div><Heading ref={headingRef} tabIndex={headingRef === undefined ? undefined : -1}>{title}</Heading><p>{description}</p></div>
      {action && <div className={styles.actions}>{action}</div>}
    </header>
    {children}
  </div>
}

export function SettingsPageGroup({ title, description, children, headingLevel = 3 }: Readonly<{ title: string; description?: string; children: ReactNode; headingLevel?: 2 | 3 }>) {
  const id = useId()
  const Heading = headingLevel === 2 ? 'h2' : 'h3'
  return <section className={styles.group} aria-labelledby={id}>
    <header data-settings-group-header><Heading id={id}>{title}</Heading>{description && <p>{description}</p>}</header>
    <div className={styles.rows} data-settings-group-rows>{children}</div>
  </section>
}

export function SettingsPageRow({ label, description, children, headingLevel = 4 }: Readonly<{ label: string; description?: string; children: ReactNode; headingLevel?: 3 | 4 }>) {
  const Heading = headingLevel === 3 ? 'h3' : 'h4'
  return <div className={styles.row}>
    <div className={styles.rowText}><Heading>{label}</Heading>{description && <p>{description}</p>}</div>
    <div className={styles.rowAction}>{children}</div>
  </div>
}

type SettingsSaveBarProps = Readonly<{
  state: 'edit' | 'saving' | 'saved' | null
  count: number
  children: ReactNode
  savedLabel?: string
  focusReturnRef?: RefObject<HTMLElement | null>
  placement?: 'inline' | 'sticky'
}>

/** The licensed SaveBar region; real form buttons and confirmation stay caller-owned.
 * Authenticated source snapshot SHA-256: e13bce8e62029f8f6ce01291bbe7d7d2bd7f50c682059e062abfe5cad0973858.
 * Requires a current normalized change count and an authoritative save phase.
 * Ensures native submission, form-scoped save shortcut and focus after controls leave.
 * Invariant this block never saves, discards, retries or confirms a draft itself.
 * On violation the caller's validation/refusal remains visible; disabled saves stay inert.
 * Adaptation: natural SSR size, plain count, supplied native actions and document scroll
 * replace demo counters, shake, fixed scroller and simulated saving timers.
 */
export function SettingsSaveBar({ state, count, children, savedLabel = 'Changes saved', focusReturnRef, placement = 'inline' }: SettingsSaveBarProps) {
  const reduce = useReducedMotion() ?? false
  const bar = useRef<HTMLDivElement>(null)
  const content = useRef<HTMLDivElement>(null)
  const hadFocus = useRef(false)
  const width = useMotionValue<number | 'auto'>('auto')
  const height = useMotionValue<number | 'auto'>('auto')

  useLayoutEffect(() => {
    const node = content.current
    if (!node) return
    const measure = () => {
      if (node.offsetWidth === 0 || node.offsetHeight === 0) return
      const next = { width: node.offsetWidth + 2, height: node.offsetHeight + 2 }
      if (reduce) { width.jump(next.width); height.jump(next.height); return }
      animate(width, next.width, motionTokens.spring.morph)
      animate(height, next.height, motionTokens.spring.morph)
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    return () => observer.disconnect()
  }, [height, reduce, state, width])

  useEffect(() => {
    const form = bar.current?.closest('form')
    if (!form || state === null || state === 'saved') return
    const saveShortcut = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey || event.key.toLowerCase() !== 's') return
      event.preventDefault()
      const submit = form.querySelector<HTMLButtonElement>('button[type="submit"]')
      if (state === 'edit' && submit && !submit.disabled) form.requestSubmit(submit)
    }
    form.addEventListener('keydown', saveShortcut)
    return () => form.removeEventListener('keydown', saveShortcut)
  }, [state])

  useEffect(() => {
    if (state !== null && state !== 'saved') return
    if (hadFocus.current && (document.activeElement === document.body || bar.current?.contains(document.activeElement))) {
      focusReturnRef?.current?.focus({ preventScroll: true })
    }
    hadFocus.current = false
  }, [focusReturnRef, state])

  if (state === null) return null
  return <div className={styles.dock} data-placement={placement}>
    <motion.div ref={bar} className={styles.bar} role="group" aria-label={state === 'saved' ? 'Save status' : 'Unsaved changes'} style={{ width, height }}
      onFocusCapture={() => { hadFocus.current = true }}
      onBlurCapture={event => {
        if (event.relatedTarget !== null && !event.currentTarget.contains(event.relatedTarget)) hadFocus.current = false
      }}
      initial={reduce ? false : { opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
      transition={reduce ? { duration: 0 } : { y: motionTokens.spring.smooth, opacity: { duration: motionTokens.duration.fast } }}>
      <div ref={content} className={styles.barContent}>
        {state === 'saved' ? <div className={styles.barSaved} role="status">
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><motion.path d="M5 12.5 9.5 17 19 7.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            initial={{ pathLength: reduce ? 1 : 0 }} animate={{ pathLength: 1 }} transition={{ duration: reduce ? 0 : motionTokens.duration.standard, ease: [...motionTokens.ease.enter] }} /></svg>
          <span>{savedLabel}</span>
        </div> : <div className={styles.barEdit}>
          <span className={styles.barCount} aria-live="polite" aria-atomic="true">{count}<span className={styles.unsaved}>&nbsp;unsaved</span>&nbsp;{count === 1 ? 'change' : 'changes'}</span>
          {children}
        </div>}
      </div>
    </motion.div>
  </div>
}
