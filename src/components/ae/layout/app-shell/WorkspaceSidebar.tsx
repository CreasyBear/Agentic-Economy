'use client'

import { useActiveNavigationSafetyGuard } from '../AeNavigationSafetyContext'

// REUI App Shell 2 (Base Nova): upstream sidebar composition; Aecon navigation and authority owners.
import { OrganizationSwitcher, useAuth } from '@clerk/tanstack-react-start'
import { Link, useLocation } from '@tanstack/react-router'
import { useConvexAuth, useQuery } from 'convex/react'
import { BookOpenIcon, Building2Icon } from 'lucide-react'
import { useEffect } from 'react'
import { api } from '../../../../../convex/_generated/api'
import { AeRenderErrorBoundary } from '@/components/ae/feedback/AeObservabilityErrorBoundary'
import { AECON_MARK_SRC, aeconMarkClassName } from '@/content/brand-assets'
import { APP_NAVIGATION, resolveAppDestination } from '@/lib/navigation/app-navigation'
import { Button } from '@/components/ui/button'
import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader, SidebarTrigger, SidebarGroup, SidebarGroupLabel, SidebarGroupContent, SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarSeparator, useSidebar } from '@/components/ui/sidebar'
import { ADMIN_NAVIGATION, DEVELOPER_NAVIGATION, APP_NAVIGATION_ICONS, activeRoleNavigationHref } from './app-shell.contracts'

type Access = Readonly<{ owner: boolean; admin: boolean; developer: boolean }>
const noAccess: Access = { owner: false, admin: false, developer: false }

function SidebarContents({ access }: { access: Access }) {
  const guard = useActiveNavigationSafetyGuard()
  const { pathname, hash } = useLocation()
  const active = resolveAppDestination(pathname, hash)
  const { state, setOpen, isMobile, setOpenMobile } = useSidebar()
  useEffect(() => { setOpenMobile(false) }, [pathname, hash, setOpenMobile])
  const adminPath = /^\/admin\/(calls|quotes)\//.test(pathname) ? '/admin/activity'
    : pathname.startsWith('/admin/workspaces/') ? '/admin/accounts' : pathname
  const activeAdmin = activeRoleNavigationHref(adminPath, ADMIN_NAVIGATION)
  const groups = [
    { label: 'Workspace', items: APP_NAVIGATION.filter(item => ['market', 'chat', 'agents', 'calls', 'credit'].includes(item.id)) },
    { label: 'Provider', items: access.owner ? APP_NAVIGATION.filter(item => ['tools', 'earnings'].includes(item.id)) : [] },
    { label: 'Account', items: APP_NAVIGATION.filter(item => ['settings', 'support', 'status'].includes(item.id)) },
  ]
  return <Sidebar collapsible="icon" variant="floating" className="[&_[data-slot=sidebar-inner]]:border [&_[data-slot=sidebar-inner]]:border-border/80 [&_[data-slot=sidebar-inner]]:shadow-xs">
    <SidebarHeader className="flex flex-row items-center justify-between group-data-[collapsible=icon]:flex-col">
      <Link to="/market" aria-label="Agentic Economy market" className="inline-flex min-h-10 items-center gap-2 px-1">
        <img src={AECON_MARK_SRC} alt="" className={`${aeconMarkClassName.light} h-6 w-6 object-contain`} />
        <span className="text-sm font-semibold tracking-wide group-data-[collapsible=icon]:hidden">AECON</span>
      </Link>
      <SidebarTrigger aria-label="Toggle workspace navigation" />
    </SidebarHeader>
    <SidebarContent>
      <nav aria-label="Workspace navigation">
        {groups.map(group => group.items.length === 0 ? null : <SidebarGroup key={group.label}>
          <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
          <SidebarGroupContent><SidebarMenu>
            {group.items.map(item => {
              const Icon = APP_NAVIGATION_ICONS[item.id]
              return <SidebarMenuItem key={item.id}><SidebarMenuButton tooltip={item.label} isActive={item.id === active}
                render={<Link to={item.to} activeOptions={{ exact: true, includeHash: true }} {...(item.hash ? { hash: item.hash.slice(1) } : {})} aria-current={item.id === active ? 'page' : undefined} />}>
                <Icon aria-hidden="true" /><span>{item.label}</span>
              </SidebarMenuButton></SidebarMenuItem>
            })}
          </SidebarMenu></SidebarGroupContent>
        </SidebarGroup>)}
        {access.admin ? <SidebarGroup><SidebarGroupLabel>Admin</SidebarGroupLabel><SidebarGroupContent><SidebarMenu>
          {ADMIN_NAVIGATION.map(item => <SidebarMenuItem key={item.href}><SidebarMenuButton tooltip={item.label} isActive={item.href === activeAdmin}
            render={<Link to={item.href} activeOptions={{ exact: true }} aria-current={item.href === activeAdmin ? 'page' : undefined} />}><item.icon aria-hidden="true" /><span>{item.label}</span></SidebarMenuButton></SidebarMenuItem>)}
        </SidebarMenu></SidebarGroupContent></SidebarGroup> : null}
        {access.developer && pathname.startsWith('/developers/') ? <SidebarGroup><SidebarGroupLabel>Developer</SidebarGroupLabel><SidebarGroupContent><SidebarMenu>
          {DEVELOPER_NAVIGATION.map(item => <SidebarMenuItem key={item.href}><SidebarMenuButton tooltip={item.label} isActive={pathname === item.href}
            render={<Link to={item.href} activeOptions={{ exact: true }} aria-current={pathname === item.href ? 'page' : undefined} />}><item.icon aria-hidden="true" /><span>{item.label}</span></SidebarMenuButton></SidebarMenuItem>)}
        </SidebarMenu></SidebarGroupContent></SidebarGroup> : null}
      </nav>
      <SidebarGroup className="mt-auto"><SidebarMenu><SidebarMenuItem><SidebarMenuButton tooltip="Developer docs" render={<Link to="/developers/api" />}><BookOpenIcon aria-hidden="true" /><span>Developer docs</span></SidebarMenuButton></SidebarMenuItem></SidebarMenu></SidebarGroup>
    </SidebarContent>
    <SidebarFooter>
      <SidebarSeparator />
      <div className="flex min-h-12 min-w-0 items-center px-1 group-data-[collapsible=icon]:overflow-hidden" aria-label="Active Account">
        {guard !== undefined ? <div className="grid min-w-0 gap-2 py-2">
          <p role="status" className="text-xs text-muted-foreground group-data-[collapsible=icon]:sr-only">Finish or recheck the current change before switching Account. To leave it, choose a navigation destination and review its leave confirmation.</p>
          <Button type="button" variant="ghost" size="sm" onClick={guard.focus} title="Review the current change before switching Account">
            <Building2Icon aria-hidden="true" /><span className="group-data-[collapsible=icon]:sr-only">Review active change</span>
          </Button>
        </div> : state === 'collapsed' && !isMobile ? <Button type="button" variant="ghost" size="icon-sm" aria-label="Expand navigation to switch Account" onClick={() => setOpen(true)}><Building2Icon aria-hidden="true" /></Button> : <OrganizationSwitcher hidePersonal={false} />}
      </div>
    </SidebarFooter>
  </Sidebar>
}

function AuthorizedSidebar() {
  const auth = useAuth()
  const { isAuthenticated } = useConvexAuth()
  const context = useQuery(api.operatorContext.readCurrent, isAuthenticated ? {} : 'skip')
  const matchesScope = auth.isLoaded && isAuthenticated && context?.kind === 'authorized'
    && context.userId === auth.userId
    && context.authScope?.organizationId === (auth.orgId ?? null)
    && context.authScope?.sessionId === (auth.sessionId ?? null)
  const access = matchesScope && context.kind === 'authorized'
    ? { owner: context.accountRef !== undefined && context.allowedSurfaces.includes('owner'), admin: context.allowedSurfaces.includes('admin'), developer: context.allowedSurfaces.includes('developer') }
    : noAccess
  return <SidebarContents access={access} />
}

export function WorkspaceSidebar() {
  const fallback = <SidebarContents access={noAccess} />
  if (!import.meta.env.VITE_CONVEX_URL?.trim()) return fallback
  return <AeRenderErrorBoundary fallback={fallback}><AuthorizedSidebar /></AeRenderErrorBoundary>
}
