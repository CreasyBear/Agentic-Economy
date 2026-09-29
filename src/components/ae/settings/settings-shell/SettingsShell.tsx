import { useEffect, useRef } from 'react'
import { ArrowLeftIcon, ChevronRightIcon } from 'lucide-react'
import { Link } from '@tanstack/react-router'
import { AeOperatorPage } from '@/components/ae/layout/AeOperatorPage'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import { settingsNavigation, settingsSidebarNavigation, type SettingsShellProps } from './settings-shell.contracts'

export function SettingsShell({ pathname, children }: SettingsShellProps) {
  const contentRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const content = contentRef.current
    if (!content) return
    const expectedTitle = pathname === '/owner/settings/integrations'
      ? 'Provider connections'
      : settingsSidebarNavigation.flatMap(group => group.items)
        .find(item => pathname === item.href)?.label ?? 'Settings'
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
    <div ref={contentRef} className="grid min-w-0 gap-6">
      <div className="hidden gap-2 md:grid">
        <h1 className="text-3xl font-bold tracking-tight outline-none focus:outline-2 focus:outline-offset-2 focus:outline-ring">Settings</h1>
        <p className="text-sm text-muted-foreground">Manage your account, workspace and preferences.</p>
      </div>
      <Separator className="hidden md:block" />
      <div className="grid min-w-0 gap-8 md:grid-cols-[15rem_minmax(0,1fr)]">
        <nav aria-label="Settings sections" className="hidden self-start md:grid md:gap-6">
          <Link to="/owner/settings" activeOptions={{ exact: true }} aria-current={index ? 'page' : undefined}
            className={cn('flex min-h-10 items-center rounded-md px-3 text-sm text-foreground focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-ring', index ? 'bg-muted font-medium' : 'hover:underline')}
          >Overview</Link>
          {settingsSidebarNavigation.map(group => <div key={group.label} className="grid gap-1">
            <h2 className="px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{group.label}</h2>
            {group.items.map(item => {
              const active = pathname === item.href || pathname === `${item.href}/`
              return <Link key={item.href} to={item.href} activeOptions={{ exact: true }} aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex min-h-10 items-center rounded-md px-3 text-sm text-foreground focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-ring',
                  active ? 'bg-muted font-medium' : 'hover:underline',
                )}
              >{item.label}</Link>
            })}
          </div>)}
        </nav>
        <div className="min-w-0 max-w-full md:max-w-4xl">
          {index ? <SettingsIndex /> : <>
            <Link to="/owner/settings" activeOptions={{ exact: true }} className="mb-6 inline-flex min-h-10 items-center gap-2 text-sm text-muted-foreground hover:text-foreground focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-ring md:hidden"><ArrowLeftIcon aria-hidden="true" className="size-4" />Back to settings</Link>
            {children}
          </>}
        </div>
      </div>
    </div>
  </AeOperatorPage>
}

function SettingsIndex() {
  return <div className="grid min-w-0 gap-8">
    <header className="md:hidden"><h2 className="text-2xl font-semibold tracking-tight text-foreground outline-none focus:outline-2 focus:outline-offset-2 focus:outline-ring">Settings</h2><p className="mt-1 text-sm text-muted-foreground">Choose what you want to manage.</p></header>
    <p className="hidden text-sm text-muted-foreground md:block">Select a section from the navigation to change its settings.</p>
    {settingsNavigation.map(group => <section key={group.label} aria-label={group.label} className="grid min-w-0 gap-2 md:hidden">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{group.label}</h3>
      <div className="overflow-hidden rounded-card border border-border bg-card">
        {group.items.map(item => <Link key={item.href} to={item.href} className="flex min-h-12 items-center justify-between gap-3 border-b border-border px-4 py-3 text-sm font-medium text-foreground last:border-b-0 hover:bg-muted focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-ring">
          {item.label}<ChevronRightIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
        </Link>)}
      </div>
    </section>)}
  </div>
}
