import { UserProfile } from '@clerk/tanstack-react-start'
import { Link } from '@tanstack/react-router'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'

import { isLocalE2EAuthBypassEnabled } from '@/lib/client/local-e2e-auth'

export type OwnerSettingsNavCurrent = 'account' | 'workspace' | 'credit'

export function OwnerSettingsNav({ current }: { current: OwnerSettingsNavCurrent }) {
  return (
    <nav aria-label="Settings sections" className="flex flex-wrap gap-2 border-b border-border pb-4">
      <Button asChild variant={current === 'account' ? 'secondary' : 'ghost'} className="min-h-11">
        <Link to="/owner/settings">Account</Link>
      </Button>
      <Button asChild variant={current === 'workspace' ? 'secondary' : 'ghost'} className="min-h-11">
        <Link to="/owner/settings" hash="workspace">Workspace</Link>
      </Button>
      <Button asChild variant={current === 'credit' ? 'secondary' : 'ghost'} className="min-h-11">
        <Link to="/owner/credit">Credit</Link>
      </Button>
    </nav>
  )
}

export function AccountSettingsSection() {
  const localPreview = isLocalE2EAuthBypassEnabled()

  return (
    <section className="grid gap-4 border-b border-border pb-8">
      <SectionHeader
        title="Account"
        description="Update your Clerk profile, email addresses, security settings, and active sessions."
      />
      {localPreview ? (
        <Alert>
          <AlertTitle>Account settings are unavailable in local preview</AlertTitle>
          <AlertDescription>This browser journey does not connect a Clerk account. Sign in outside local preview to manage your profile and sessions.</AlertDescription>
        </Alert>
      ) : (
        <UserProfile />
      )}
    </section>
  )
}

export function BusinessSettingsSection() {
  return (
    <section id="workspace" className="grid scroll-mt-6 gap-4 pt-2">
      <SectionHeader
        title="Supplier workspace"
        description="Manage the supplier profile, Operations, credit, and publication setup."
      />
      <div className="flex flex-wrap gap-3">
        <Button asChild variant="default" className="min-h-11"><Link to="/owner/status">Supplier profile</Link></Button>
        <Button asChild variant="secondary" className="min-h-11"><Link to="/owner/offerings">Operations</Link></Button>
        <Button asChild variant="secondary" className="min-h-11"><Link to="/owner/credit">Credit</Link></Button>
        <Button asChild variant="secondary" className="min-h-11"><Link to="/for-providers">Review supplier setup</Link></Button>
      </div>
    </section>
  )
}

function SectionHeader({ title, description }: { title: string; description: string }) {
  return (
    <div className="grid gap-1">
      <h2 className="text-sm font-medium">{title}</h2>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
  )
}
