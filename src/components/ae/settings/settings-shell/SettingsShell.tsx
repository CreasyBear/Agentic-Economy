import { useEffect, useRef } from 'react'
import { ArrowLeftIcon, ChevronRightIcon } from 'lucide-react'
import { Link } from '@tanstack/react-router'
import { AeOperatorPage } from '@/components/ae/layout/AeOperatorPage'
import { SettingsPage as ArcSettingsPage, SettingsPageGroup } from '@/components/arc/blocks/settings-page/settings-page'
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
  return <AeOperatorPage operatorRole="owner" title="Settings" description="" currentPath={pathname} contentOwnsHeading>
    <div ref={contentRef} className="arc-market">
      <ArcSettingsPage
        title="Settings"
        description="Manage your account, workspace and preferences."
        navigation={[]}
        currentHref={pathname.replace(/\/$/u, '')}
        renderNavigationLink={(item, props) => <Link to={item.href} activeOptions={{ exact: true }} {...props} />}
      >
        {index ? <SettingsIndex /> : <>
          <Link to="/owner/settings" activeOptions={{ exact: true }} className="ae-settings-back"><ArrowLeftIcon aria-hidden="true" />Back to settings</Link>
          {children}
        </>}
      </ArcSettingsPage>
    </div>
  </AeOperatorPage>
}

function SettingsIndex() {
  return <div className="ae-settings-index">
    {settingsNavigation.map(group => <SettingsPageGroup key={group.label} title={group.label} headingLevel={2}>
      <ul className="ae-settings-index-links">
        {group.items.map(item => <li key={item.href}>
          <Link to={item.href} className="ae-settings-index-link">
            <span>{item.label}</span><ChevronRightIcon aria-hidden="true" />
          </Link>
        </li>)}
      </ul>
    </SettingsPageGroup>)}
  </div>
}
