import { useEffect, useRef } from 'react'
import { Link } from '@tanstack/react-router'
import { AeOperatorPage } from '@/components/ae/layout/AeOperatorPage'
import { SettingsScrollView } from '@/components/ae/shared/reui-pro/settings/SettingsLayout'
import { settingsDestinationForPath, settingsNavigation, type SettingsShellProps } from './settings-shell.contracts'
import '@/components/ae/layout/app-shell/WorkspaceNavigationComposition.css'
import './SettingsComposition.css'

export function SettingsShell({ pathname, children }: SettingsShellProps) {
  const contentRef = useRef<HTMLDivElement>(null)
  const destination = settingsDestinationForPath(pathname)
  const title = destination?.title ?? destination?.label ?? 'Settings'
  const activeGroup = settingsNavigation.find(group => group.items.some(item => item.href === destination?.href)) ?? settingsNavigation[0]
  useEffect(() => {
    const content = contentRef.current
    if (!content) return
    content.querySelector<HTMLElement>('nav[aria-label="Settings groups"] [data-active="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    const routeFocus = document.activeElement
    let frame = 0
    const focusHeading = () => {
      const heading = [...content.querySelectorAll<HTMLElement>('h1')]
        .find(element => element.textContent?.trim() === title)
      if (!heading) return
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        frame = requestAnimationFrame(() => {
          if (!heading.isConnected || !content.contains(heading)) return
          // Do not steal focus from a navigation link or editor the user reached.
          if (content.contains(document.activeElement) && document.activeElement !== routeFocus && document.activeElement !== heading) {
            observer.disconnect()
            return
          }
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
  }, [pathname, title])
  return <AeOperatorPage operatorRole="owner" title={title} description="" currentPath={pathname} contentOwnsHeading>
    <div ref={contentRef} className="arc-market mx-auto w-full max-w-4xl flex flex-col gap-8" data-reui-block="profile-2">
      <div className="min-w-0 flex flex-col gap-3">
        <nav aria-label="Settings groups" className="min-w-0 border-b">
          <SettingsScrollView><ul className="flex w-max min-w-full gap-6">
            {settingsNavigation.map(group => <li key={group.label}>
              <Link to={group === activeGroup ? destination?.href ?? group.items[0]?.href ?? '/owner/settings' : group.items[0]?.href ?? '/owner/settings'}
                aria-current={group === activeGroup ? 'page' : undefined} data-active={group === activeGroup ? 'true' : undefined} activeOptions={{ exact: true }}
                className="inline-flex min-h-11 items-center whitespace-nowrap border-b-2 border-transparent py-3 text-sm font-medium text-muted-foreground hover:text-foreground data-[active=true]:border-primary data-[active=true]:text-foreground focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring">
                {group.shortLabel}
              </Link>
            </li>)}
          </ul></SettingsScrollView>
        </nav>
        <nav aria-label="Settings sections"><ul className="flex flex-wrap gap-1">
          {activeGroup?.items.map(item => <li key={item.href}><Link to={item.href} activeOptions={{ exact: true }}
            aria-current={item.href === destination?.href ? 'page' : undefined}
            className="inline-flex min-h-11 items-center rounded-sm px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground aria-[current=page]:bg-muted aria-[current=page]:font-medium aria-[current=page]:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
            {item.label}
          </Link></li>)}
        </ul></nav>
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  </AeOperatorPage>
}
