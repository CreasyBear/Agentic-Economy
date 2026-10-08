'use client'

// Maintained Base UI menu composition; destination and authority owners are unchanged.
import { OrganizationSwitcher, useAuth } from '@clerk/tanstack-react-start'
import { Link, useLocation } from '@tanstack/react-router'
import { useConvexAuth, useQuery } from 'convex/react'
import { BookOpenIcon, Building2Icon, CodeIcon, MenuIcon, ShieldIcon, StoreIcon, type LucideIcon } from 'lucide-react'
import { api } from '../../../../../convex/_generated/api'
import { AeRenderErrorBoundary } from '@/components/ae/feedback/AeObservabilityErrorBoundary'
import { APP_NAVIGATION, resolveAppDestination, type AppDestination } from '@/lib/navigation/app-navigation'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { useActiveNavigationSafetyGuard } from '../AeNavigationSafetyContext'
import { ADMIN_NAVIGATION, DEVELOPER_NAVIGATION, APP_NAVIGATION_ICONS, activeRoleNavigationHref, type AppSidebarItem } from './app-shell.contracts'
import './WorkspaceNavigationComposition.css'

type Access = Readonly<{ owner: boolean; admin: boolean; developer: boolean }>
const noAccess: Access = { owner: false, admin: false, developer: false }

function Destination({ item, active }: { item: AppDestination; active: boolean }) {
  const Icon = APP_NAVIGATION_ICONS[item.id]
  return <DropdownMenuItem nativeButton={false} label={item.label} className="arc-workspace-menu-item"
    render={<Link to={item.to} activeOptions={{ exact: true, includeHash: true }} {...(item.hash ? { hash: item.hash.slice(1) } : {})} aria-current={active ? 'page' : undefined} />}>
    <Icon aria-hidden="true" /><span>{item.label}</span>
  </DropdownMenuItem>
}

function RoleMenu({ label, icon: Icon, items, active }: { label: string; icon: LucideIcon; items: readonly AppSidebarItem[]; active: string | undefined }) {
  return <DropdownMenuSub>
    <DropdownMenuSubTrigger className="arc-workspace-submenu-trigger"><Icon aria-hidden="true" /><span>{label}</span></DropdownMenuSubTrigger>
    <DropdownMenuSubContent aria-label={label} className="arc-market arc-workspace-menu">
      <DropdownMenuGroup>{items.map(item => <DropdownMenuItem key={item.href} nativeButton={false} label={item.label} className="arc-workspace-menu-item"
        render={<Link to={item.href} activeOptions={{ exact: true }} aria-current={item.href === active ? 'page' : undefined} />}>
        <item.icon aria-hidden="true" /><span>{item.label}</span>
      </DropdownMenuItem>)}</DropdownMenuGroup>
    </DropdownMenuSubContent>
  </DropdownMenuSub>
}

function MenuContents({ access }: { access: Access }) {
  const { pathname, hash } = useLocation()
  const active = resolveAppDestination(pathname, hash)
  const adminPath = /^\/admin\/(calls|quotes)\//.test(pathname) ? '/admin/activity'
    : pathname.startsWith('/admin/workspaces/') ? '/admin/accounts' : pathname
  return <DropdownMenu modal={false}>
    <DropdownMenuTrigger render={<Button type="button" variant="outline" size="icon" aria-label="Workspace menu" className="arc-market arc-workspace-menu-trigger rounded-full" />}><MenuIcon aria-hidden="true" /></DropdownMenuTrigger>
    <DropdownMenuContent align="end" className="arc-market arc-workspace-menu">
      <DropdownMenuGroup>{APP_NAVIGATION.filter(item => ['market', 'chat', 'agents', 'calls', 'credit'].includes(item.id)).map(item => <Destination key={item.id} item={item} active={item.id === active} />)}</DropdownMenuGroup>
      <DropdownMenuSeparator className="arc-workspace-menu-separator" />
      <DropdownMenuGroup>
        {access.owner ? <DropdownMenuSub>
          <DropdownMenuSubTrigger className="arc-workspace-submenu-trigger"><StoreIcon aria-hidden="true" /><span>Provider</span></DropdownMenuSubTrigger>
          <DropdownMenuSubContent aria-label="Provider" className="arc-market arc-workspace-menu"><DropdownMenuGroup>
            {APP_NAVIGATION.filter(item => ['tools', 'earnings'].includes(item.id)).map(item => <Destination key={item.id} item={item} active={item.id === active} />)}
          </DropdownMenuGroup></DropdownMenuSubContent>
        </DropdownMenuSub> : null}
        {access.admin ? <RoleMenu label="Admin" icon={ShieldIcon} items={ADMIN_NAVIGATION} active={activeRoleNavigationHref(adminPath, ADMIN_NAVIGATION)} /> : null}
        {access.developer && pathname.startsWith('/developers/') ? <RoleMenu label="Developer" icon={CodeIcon} items={DEVELOPER_NAVIGATION} active={activeRoleNavigationHref(pathname, DEVELOPER_NAVIGATION)} /> : null}
        {APP_NAVIGATION.filter(item => ['settings', 'support', 'status'].includes(item.id)).map(item => <Destination key={item.id} item={item} active={item.id === active} />)}
        <DropdownMenuItem nativeButton={false} label="Developer docs" className="arc-workspace-menu-item" render={<Link to="/developers/api" />}><BookOpenIcon aria-hidden="true" /><span>Developer docs</span></DropdownMenuItem>
      </DropdownMenuGroup>
    </DropdownMenuContent>
  </DropdownMenu>
}

function AuthorizedMenu() {
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
  return <MenuContents access={access} />
}

export function WorkspaceMenu() {
  const fallback = <MenuContents access={noAccess} />
  if (!import.meta.env.VITE_CONVEX_URL?.trim()) return fallback
  return <AeRenderErrorBoundary fallback={fallback}><AuthorizedMenu /></AeRenderErrorBoundary>
}

// Clerk owns its own popup/focus lifecycle, so it stays outside the navigation menu.
export function WorkspaceAccountSwitcher() {
  const guard = useActiveNavigationSafetyGuard()
  return <div className="flex min-h-11 min-w-0 items-center" aria-label="Active Account">
    {guard !== undefined ? <>
      <p role="status" className="sr-only">Finish or recheck the current change before switching Account. To leave it, choose a navigation destination and review its leave confirmation.</p>
      <Button type="button" variant="ghost" size="icon" onClick={guard.focus} aria-label="Review active change" title="Review the current change before switching Account"><Building2Icon aria-hidden="true" /></Button>
    </> : <OrganizationSwitcher hidePersonal={false} appearance={{ elements: {
      organizationPreview: 'min-w-0',
      organizationPreviewTextContainer: 'hidden min-w-0 overflow-hidden lg:block',
      organizationPreviewMainIdentifier: 'truncate',
      organizationSwitcherTrigger: 'max-w-44 min-w-0 min-h-11 overflow-hidden',
    } }} />}
  </div>
}
