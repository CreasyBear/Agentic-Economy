import { SignOutButton, UserProfile } from '@clerk/tanstack-react-start'

import { AeSection, AeSettingsRow } from '@/components/ae/layout/AeSection'
import { AeAccountSecurityHistory } from '@/components/ae/settings/AeAccountSecurityHistory'
import { AeCompromiseRecoveryChecklist } from '@/components/ae/settings/AeCompromiseRecoveryChecklist'
import { OwnerNotificationSettings } from '@/components/ae/settings/OwnerNotificationSettings'
import { TaxProfileFormSection } from '@/components/ae/settings/TaxProfileFormSection'
import { AeSiteAuthPanel, AeSiteAuthSubmit } from '@/components/ae/website'

import {
  ownerSettingsBusinessSection,
  type AccountSettingsSectionProps,
} from './owner-settings.contracts'
import { useOwnerNotificationPreferences } from './useOwnerNotificationPreferences'

export function AccountSettingsSection({ history }: AccountSettingsSectionProps) {
  const notifications = useOwnerNotificationPreferences()

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
            eyebrow=""
            title="Sign out"
            titleId="owner-sign-out"
            titleAs="h3"
            body="This browser returns to the public site. Your Credit, Agent connections, and published Tools stay as they are."
          >
            <SignOutButton redirectUrl="/">
              <AeSiteAuthSubmit>Sign out</AeSiteAuthSubmit>
            </SignOutButton>
          </AeSiteAuthPanel>
        </div>
      </AeSection>
      <AeSection
        id="team"
        title="Team"
        description="Members, roles, and invitations for this workspace."
      >
        <AeSettingsRow
          title="Manage Team"
          description="Open Team settings to manage members, roles, and invitations."
          href="/owner/team"
        />
      </AeSection>
      <AeSection
        id={ownerSettingsBusinessSection.id}
        title={ownerSettingsBusinessSection.title}
        description={ownerSettingsBusinessSection.description}
      >
        <TaxProfileFormSection />
      </AeSection>
      <AeCompromiseRecoveryChecklist />
      <AeSection
        id="notifications"
        title="Email alerts"
        description="Choose which emails this owner receives. Saved for this Account."
      >
        <OwnerNotificationSettings
          preferences={notifications.preferences}
          disabled={notifications.loading}
          onUpdate={notifications.update}
        />
      </AeSection>
      <AeAccountSecurityHistory initialResult={history} />
    </>
  )
}
