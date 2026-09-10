import { SignOutButton, UserProfile } from '@clerk/tanstack-react-start'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'

import { AeSection } from '@/components/ae/layout/AeSection'
import { AeAccountSecurityHistory } from '@/components/ae/settings/AeAccountSecurityHistory'
import { AeCompromiseRecoveryChecklist } from '@/components/ae/settings/AeCompromiseRecoveryChecklist'
import { AeSiteAuthPanel, AeSiteAuthSubmit } from '@/components/ae/website'
import { isLocalE2EAuthBypassEnabled } from '@/lib/client/local-e2e-auth'
import type { AccountSecurityHistoryResult } from '@/modules/security/account-security'

export function AccountSettingsSection({
  history,
}: Readonly<{ history: AccountSecurityHistoryResult }>) {
  const localPreview = isLocalE2EAuthBypassEnabled()

  return (
    <>
      <AeSection
        id="clerk-account-security"
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
              body="This browser returns to the public site. Tools, credit, and listed services stay as they are."
            >
              <SignOutButton redirectUrl="/">
                <AeSiteAuthSubmit>Sign out</AeSiteAuthSubmit>
              </SignOutButton>
            </AeSiteAuthPanel>
          </div>
        )}
      </AeSection>
      <AeCompromiseRecoveryChecklist />
      <AeAccountSecurityHistory initialResult={history} />
    </>
  )
}
