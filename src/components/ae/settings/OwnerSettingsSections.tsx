import { SignOutButton, UserProfile } from '@clerk/tanstack-react-start'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'

import { AeSection } from '@/components/ae/layout/AeSection'
import { AeSiteAuthPanel, AeSiteAuthSubmit } from '@/components/ae/website'
import { OwnerSettingsNav } from '@/components/ae/settings/OwnerSettingsNav'
import { isLocalE2EAuthBypassEnabled } from '@/lib/client/local-e2e-auth'

export type { OwnerSettingsNavCurrent } from '@/lib/operator/settings-navigation'
export { OwnerSettingsNav }

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
