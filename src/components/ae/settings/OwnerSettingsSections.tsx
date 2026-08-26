import { SignOutButton, UserProfile } from '@clerk/tanstack-react-start'
import { Link } from '@tanstack/react-router'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'

import { AeSection, AeSettingsRow } from '@/components/ae/layout/AeSection'
import { AeSiteAuthPanel, AeSiteAuthSubmit } from '@/components/ae/website'
import { cn } from '@/lib/utils'
import { isLocalE2EAuthBypassEnabled } from '@/lib/client/local-e2e-auth'

export type OwnerSettingsNavCurrent = 'account' | 'workspace' | 'credit'

const settingsTabs = [
  { id: 'account' as const, label: 'Account', to: '/owner/settings' },
  { id: 'workspace' as const, label: 'Workspace', to: '/owner/settings', hash: 'workspace' },
  { id: 'credit' as const, label: 'Credit', to: '/owner/credit' },
] as const

export function OwnerSettingsNav({ current }: { current: OwnerSettingsNavCurrent }) {
  return (
    <nav aria-label="Settings sections" className="flex min-h-10 flex-wrap gap-1 border-b border-border">
      {settingsTabs.map((tab) => (
        <Link
          key={tab.id}
          to={tab.to}
          {...('hash' in tab ? { hash: tab.hash } : {})}
          className={cn(
            'inline-flex min-h-11 items-center border-b-2 px-3 text-sm transition-colors',
            current === tab.id
              ? 'border-foreground font-medium text-foreground'
              : 'border-transparent text-muted-foreground hover:text-foreground',
          )}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  )
}

export function AccountSettingsSection() {
  const localPreview = isLocalE2EAuthBypassEnabled()

  return (
    <AeSection
      title="Profile"
      description="Name, email, security, and active sessions for this owner."
    >
      {localPreview ? (
        <Alert>
          <AlertTitle>Account settings are unavailable in local preview</AlertTitle>
          <AlertDescription>This browser journey does not connect a Clerk account. Sign in outside local preview to manage your profile and sessions.</AlertDescription>
        </Alert>
      ) : (
        <div className="grid gap-section">
          <UserProfile />
          <AeSiteAuthPanel
            eyebrow="Session"
            title="Sign out"
            titleId="owner-sign-out"
            titleAs="h3"
            body="This browser returns to the public site. Operations, credit, and listed tools stay as they are."
          >
            <SignOutButton redirectUrl="/">
              <AeSiteAuthSubmit>Sign out</AeSiteAuthSubmit>
            </SignOutButton>
          </AeSiteAuthPanel>
        </div>
      )}
    </AeSection>
  )
}

export function BusinessSettingsSection() {
  return (
    <AeSection
      id="workspace"
      title="Workspace"
      description="Supplier profile, Operations, credit, and publication setup."
    >
      <div className="grid gap-2">
        <AeSettingsRow
          title="Supplier"
          description="The public supplier agents find."
          href="/owner/status"
        />
        <AeSettingsRow
          title="Operations"
          description="Operations this workspace lists."
          href="/owner/offerings"
        />
        <AeSettingsRow
          title="Credit"
          description="Credit assigned to agents that make paid calls."
          href="/owner/credit"
        />
        <AeSettingsRow
          title="Setup"
          description="Publication setup for this supplier."
          href="/for-providers"
        />
      </div>
    </AeSection>
  )
}
