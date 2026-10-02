import { useEffect, useId, useRef } from 'react'
import { ArrowLeftIcon, ChevronRightIcon } from 'lucide-react'
import { Link } from '@tanstack/react-router'
import { LayoutGroup, motion, useReducedMotion } from 'motion/react'
import { AeOperatorPage } from '@/components/ae/layout/AeOperatorPage'
import { motionTokens } from '@/components/arc/motion-tokens'
import { settingsNavigation, settingsSidebarNavigation, type SettingsShellProps } from './settings-shell.contracts'
import './SettingsComposition.css'

export function SettingsShell({ pathname, children }: SettingsShellProps) {
  const contentRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const content = contentRef.current
    if (!content) return
    const settingsPath = pathname.replace(/\/$/u, '')
    const expectedTitle = settingsPath === '/owner/settings/integrations'
      ? 'Provider connections'
      : settingsPath === '/owner/settings/receipts'
        ? 'Receipts & invoices'
        : settingsSidebarNavigation.flatMap(group => group.items)
          .find(item => settingsPath === item.href)?.label ?? 'Settings'
    let frame = 0
    const focusHeading = () => {
      const heading = [...content.querySelectorAll<HTMLElement>('h1, h2, [role="heading"]')]
        .find(element => element.textContent?.trim() === expectedTitle)
      if (!heading) return
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        frame = requestAnimationFrame(() => {
          if (!heading.isConnected || !content.contains(heading)) return
          heading.tabIndex = -1
          heading.focus({ preventScroll: true })
          observer.disconnect()
        })
      })
    }
    const observer = new MutationObserver(focusHeading)
    observer.observe(content, { childList: true, subtree: true })
    focusHeading()
    return () => { observer.disconnect(); cancelAnimationFrame(frame) }
  }, [pathname])
  const index = pathname === '/owner/settings' || pathname === '/owner/settings/'
  const navigationMotionId = useId()
  const reduceMotion = useReducedMotion() ?? false
  return <AeOperatorPage operatorRole="owner" title="Settings" description="" currentPath={pathname} contentOwnsHeading>
    <div ref={contentRef} className="arc-market arc-settings-root">
      <header className="ae-settings-header">
        <h1 className="ae-settings-title">Settings</h1>
        <p>Manage your account, workspace and preferences.</p>
      </header>
      <div className="ae-settings-layout">
        <LayoutGroup id={navigationMotionId}>
          <nav aria-label="Settings sections" className="ae-settings-sidebar">
            <Link to="/owner/settings" activeOptions={{ exact: true }} aria-current={index ? 'page' : undefined} className="ae-settings-nav-link">
              {index ? <motion.span layoutId="settings-navigation-highlight" className="ae-settings-nav-highlight" transition={reduceMotion ? { duration: 0 } : motionTokens.spring.morph} aria-hidden="true" /> : null}
              <span>Overview</span>
            </Link>
            {settingsSidebarNavigation.map(group => <section key={group.label} className="ae-settings-nav-group" aria-label={group.label}>
              <h2>{group.label}</h2>
              <ul>
                {group.items.map(item => {
                  const active = pathname === item.href || pathname === `${item.href}/`
                  return <li key={item.href}>
                    <Link to={item.href} activeOptions={{ exact: true }} aria-current={active ? 'page' : undefined} className="ae-settings-nav-link">
                      {active ? <motion.span layoutId="settings-navigation-highlight" className="ae-settings-nav-highlight" transition={reduceMotion ? { duration: 0 } : motionTokens.spring.morph} aria-hidden="true" /> : null}
                      <span>{item.label}</span>
                    </Link>
                  </li>
                })}
              </ul>
            </section>)}
          </nav>
        </LayoutGroup>
        <div className="ae-settings-pane">
          {index ? <SettingsIndex /> : <>
            <Link to="/owner/settings" activeOptions={{ exact: true }} className="ae-settings-back"><ArrowLeftIcon aria-hidden="true" />Back to settings</Link>
            {children}
          </>}
        </div>
      </div>
    </div>
  </AeOperatorPage>
}

function SettingsIndex() {
  return <div className="ae-settings-index">
    {settingsNavigation.map(group => <section key={group.label} aria-label={group.label} className="ae-settings-index-group">
      <h2>{group.label}</h2>
      <ul>
        {group.items.map(item => <li key={item.href}>
          <Link to={item.href} className="ae-settings-index-link">
            <span>{item.label}</span><ChevronRightIcon aria-hidden="true" />
          </Link>
        </li>)}
      </ul>
    </section>)}
  </div>
}
