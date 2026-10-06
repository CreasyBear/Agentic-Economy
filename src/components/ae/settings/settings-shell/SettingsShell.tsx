import { useEffect, useRef } from 'react'
import { ChevronDownIcon } from 'lucide-react'
import { Link } from '@tanstack/react-router'
import { AeOperatorPage } from '@/components/ae/layout/AeOperatorPage'
import { SettingsPage as ArcSettingsPage } from '@/components/ae/shared/arc-pro/settings-page/settings-page'
import { Button } from '@/components/arc/button/button'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { settingsDestinationForPath, settingsNavigation, type SettingsShellProps } from './settings-shell.contracts'
import '@/components/ae/layout/app-shell/WorkspaceNavigationComposition.css'
import './SettingsComposition.css'

export function SettingsShell({ pathname, children }: SettingsShellProps) {
  const contentRef = useRef<HTMLDivElement>(null)
  const destination = settingsDestinationForPath(pathname)
  const title = destination?.title ?? destination?.label ?? 'Settings'
  useEffect(() => {
    const content = contentRef.current
    if (!content) return
    let frame = 0
    const focusHeading = () => {
      const heading = [...content.querySelectorAll<HTMLElement>('h1')]
        .find(element => element.textContent?.trim() === title)
      if (!heading) return
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        frame = requestAnimationFrame(() => {
          if (!heading.isConnected || !content.contains(heading)) return
          // A user can open the menu before these committed-route frames finish.
          if (content.querySelector('[aria-haspopup="menu"][aria-expanded="true"]')) {
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
    <div ref={contentRef} className="arc-market">
      <ArcSettingsPage
        title="Settings"
        description=""
        showHeader={false}
        navigationMenu={<div className="ae-settings-toolbar">
          <span>Settings</span>
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button type="button" variant="secondary" size="md" aria-label={`Settings section: ${destination?.label ?? 'Choose a section'}`} />}>
              {destination?.label ?? 'Choose a section'}<ChevronDownIcon aria-hidden="true" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="arc-market arc-workspace-menu" aria-label="Settings sections">
              {settingsNavigation.map((group, index) => <DropdownMenuGroup key={group.label} className="arc-workspace-menu-group">
                {index > 0 && <DropdownMenuSeparator className="arc-workspace-menu-separator" />}
                <DropdownMenuLabel className="arc-workspace-menu-label">{group.label}</DropdownMenuLabel>
                {group.items.map(item => <DropdownMenuItem key={item.href} className="arc-breadcrumb-menu-item" render={<Link to={item.href} activeOptions={{ exact: true }} aria-current={item.href === destination?.href ? 'page' : undefined} />}>
                  {item.label}
                </DropdownMenuItem>)}
              </DropdownMenuGroup>)}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>}
        navigation={[]}
        currentHref={pathname.replace(/\/$/u, '')}
        renderNavigationLink={(item, props) => <Link to={item.href} activeOptions={{ exact: true }} {...props} />}
      >
        {children}
      </ArcSettingsPage>
    </div>
  </AeOperatorPage>
}
