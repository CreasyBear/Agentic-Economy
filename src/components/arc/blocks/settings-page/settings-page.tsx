'use client'

import { useId } from 'react'
import type { ReactNode, Ref } from 'react'
import { LayoutGroup, motion, useReducedMotion } from 'motion/react'
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
}>

export function SettingsPage({ title, description, navigation, currentHref, renderNavigationLink, children }: SettingsPageProps) {
  const titleId = useId()
  const navGroup = useId()
  const reduce = useReducedMotion() ?? false
  return <section className={styles.root} aria-labelledby={titleId}>
    <header className={styles.pageHead}>
      <h1 id={titleId}>{title}</h1>
      <p>{description}</p>
    </header>
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
}>

export function SettingsPagePane({ title, description, action, children, headingRef }: PaneProps) {
  return <div className={styles.pane}>
    <header className={styles.paneHead}>
      <div><h2 ref={headingRef} tabIndex={headingRef === undefined ? undefined : -1}>{title}</h2><p>{description}</p></div>
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

export function SettingsPageRow({ label, description, children }: Readonly<{ label: string; description?: string; children: ReactNode }>) {
  return <div className={styles.row}>
    <div className={styles.rowText}><h4>{label}</h4>{description && <p>{description}</p>}</div>
    <div className={styles.rowAction}>{children}</div>
  </div>
}
