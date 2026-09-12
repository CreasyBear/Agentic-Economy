import { SignOutButton, UserProfile } from '@clerk/tanstack-react-start'

import { AeSection } from '@/components/ae/layout/AeSection'
import { AeAccountSecurityHistory } from '@/components/ae/settings/AeAccountSecurityHistory'
import { AeCompromiseRecoveryChecklist } from '@/components/ae/settings/AeCompromiseRecoveryChecklist'
import { AeSiteAuthPanel, AeSiteAuthSubmit } from '@/components/ae/website'
import type { AccountSecurityHistoryResult } from '@/modules/security/account-security'

export function AccountSettingsSection({
  history,
}: Readonly<{ history: AccountSecurityHistoryResult }>) {
  return (
    <>
      <AeSection
        id="clerk-account-security"
        title="Profile"
        description="Name, email, security, and active sessions for this owner."
      >
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
      </AeSection>
      <AeCompromiseRecoveryChecklist />
      <AeAccountSecurityHistory initialResult={history} />
    </>
  )
}
