import { useState } from 'react'
import { SignOutButton, UserProfile } from '@clerk/tanstack-react-start'

import { AeSection } from '@/components/ae/layout/AeSection'
import { AeAccountSecurityHistory } from '@/components/ae/settings/AeAccountSecurityHistory'
import { AeCompromiseRecoveryChecklist } from '@/components/ae/settings/AeCompromiseRecoveryChecklist'
import {
  OwnerNotificationSettings,
  type NotificationPreferencePatch,
  type NotificationPreferencesView,
} from '@/components/ae/settings/OwnerNotificationSettings'
import { AeSiteAuthPanel, AeSiteAuthSubmit } from '@/components/ae/website'
import type { AccountSecurityHistoryResult } from '@/modules/security/account-security'

const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferencesView = {
  lowCreditBalance: true,
  lowCreditThresholdCents: 2500,
  spendCapWarning: true,
  callFailureSpike: true,
  invoiceReady: true,
  teamMembershipChanged: true,
  revision: 0,
}

export function AccountSettingsSection({
  history,
}: Readonly<{ history: AccountSecurityHistoryResult }>) {
  const [notificationPreferences, setNotificationPreferences] = useState(DEFAULT_NOTIFICATION_PREFERENCES)

  const handleNotificationUpdate = (patch: NotificationPreferencePatch) => {
    setNotificationPreferences((current) => ({
      ...current,
      ...patch,
      revision: current.revision + 1,
    }))
  }

  return (
    <>
      <AeSection
        id="clerk-account-security"
        title="Profile"
        description="Name, email, security, and active sessions for this owner."
      >
        <div className="grid gap-section">
          <div className="min-h-96 w-full">
            <UserProfile />
          </div>
          <AeSiteAuthPanel
            eyebrow="Session"
            title="Sign out"
            titleId="owner-sign-out"
            titleAs="h3"
            body="This browser returns to the public site. Your Balance, Agent connections, and published Tools stay as they are."
          >
            <SignOutButton redirectUrl="/">
              <AeSiteAuthSubmit>Sign out</AeSiteAuthSubmit>
            </SignOutButton>
          </AeSiteAuthPanel>
        </div>
      </AeSection>
      <AeCompromiseRecoveryChecklist />
      <AeSection
        id="notifications"
        title="Email alerts"
        description="Choose which emails this owner receives. Changes apply to this Account only."
      >
        <OwnerNotificationSettings
          preferences={notificationPreferences}
          onUpdate={handleNotificationUpdate}
        />
      </AeSection>
      <AeAccountSecurityHistory initialResult={history} />
    </>
  )
}
