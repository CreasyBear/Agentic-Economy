import { UserProfile } from '@clerk/tanstack-react-start'
import { Link } from '@tanstack/react-router'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

import { isLocalE2EAuthBypassEnabled } from '@/lib/client/local-e2e-auth'

export function AccountSettingsSection() {
  const localPreview = isLocalE2EAuthBypassEnabled()

  return (
    <Card className="grid gap-4 p-5">
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
        <div className="overflow-hidden rounded-md border border-border bg-card p-2">
          <UserProfile />
        </div>
      )}
    </Card>
  )
}

export function BusinessSettingsSection() {
  return (
    <Card className="grid gap-4 p-5">
      <SectionHeader
        title="Supplier workspace"
        description="Manage the supplier profile, Operations, and publication setup."
      />
      <div className="flex flex-wrap gap-3">
        <Button asChild variant="default"><Link to="/owner/status">Supplier profile</Link></Button>
        <Button asChild variant="secondary"><Link to="/owner/offerings">Operations</Link></Button>
        <Button asChild variant="secondary"><Link to="/for-providers">Review supplier setup</Link></Button>
      </div>
    </Card>
  )
}

function SectionHeader({ title, description }: { title: string; description: string }) {
  return (
    <div className="grid gap-1">
      <h2 className="text-base font-semibold">{title}</h2>
      <p className="text-muted-foreground">{description}</p>
    </div>
  )
}
