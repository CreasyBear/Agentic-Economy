import { SignOutButton, UserProfile } from '@clerk/tanstack-react-start'

import { AeSection, AeSettingsRow } from '@/components/ae/layout/AeSection'
import { AeAccountSecurityHistory } from '@/components/ae/settings/AeAccountSecurityHistory'
import { AeCompromiseRecoveryChecklist } from '@/components/ae/settings/AeCompromiseRecoveryChecklist'
import { OwnerNotificationSettings } from '@/components/ae/settings/OwnerNotificationSettings'
import { TaxProfileFormSection } from '@/components/ae/settings/TaxProfileFormSection'
import { AeSiteAuthSubmit, AeSiteBody } from '@/components/ae/website'
import { buttonVariants } from '@/components/ui/button-variants'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { clerkEmbeddedProfileAppearance } from '@/components/ae/website/clerk-appearance'

import {
  ownerSettingsBusinessSection,
  ownerSettingsPrivacySection,
  ownerSettingsSectionNavigation,
  type AccountSettingsSectionProps,
} from './owner-settings.contracts'
import { useOwnerNotificationPreferences } from './useOwnerNotificationPreferences'

type SettingsSectionId = (typeof ownerSettingsSectionNavigation)[number]['id']

function sectionFromHash(hash: string): SettingsSectionId {
  const id = hash.startsWith('#') ? hash.slice(1) : hash
  const match = ownerSettingsSectionNavigation.find((section) => section.id === id)
  return match?.id ?? 'clerk-account-security'
}

export function AccountSettingsSection({ history }: AccountSettingsSectionProps) {
  const notifications = useOwnerNotificationPreferences()
  const defaultSection = sectionFromHash(typeof window === 'undefined' ? '' : window.location.hash)

  return (
    <Tabs defaultValue={defaultSection} className="gap-section">
      <TabsList
        variant="line"
        aria-label="Account settings sections"
        className="max-w-full justify-start overflow-x-auto overflow-y-hidden"
      >
        {ownerSettingsSectionNavigation.map(({ id, label }) => (
          <TabsTrigger key={id} value={id}>{label}</TabsTrigger>
        ))}
      </TabsList>
      <TabsContent value="clerk-account-security">
        <AeSection
          id="clerk-account-security"
          title="Profile"
          description="Name, email, security, and active sessions for this owner."
        >
          <div className="grid gap-section">
            <div className="min-h-96 w-full">
              <UserProfile appearance={clerkEmbeddedProfileAppearance} />
            </div>
            <div className="grid gap-related">
              <h3
                id="owner-sign-out"
                className="font-sans text-base font-medium leading-snug tracking-tight text-foreground"
              >
                Sign out
              </h3>
              <AeSiteBody muted size="sm">
                This browser returns to the public site. Your Credit, Agent connections, and published Tools stay as they are.
              </AeSiteBody>
              <SignOutButton redirectUrl="/">
                <AeSiteAuthSubmit>Sign out</AeSiteAuthSubmit>
              </SignOutButton>
            </div>
          </div>
        </AeSection>
      </TabsContent>
      <TabsContent value="compromise-recovery">
        <AeCompromiseRecoveryChecklist />
      </TabsContent>
      <TabsContent value="security-history">
        <AeAccountSecurityHistory initialResult={history} />
      </TabsContent>
      <TabsContent value="team">
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
      </TabsContent>
      <TabsContent value="workspace">
        <AeSection
          id="workspace"
          title="Workspace"
          description="Organisation profile, and closing or transferring this workspace."
        >
          <AeSettingsRow
            title="Workspace profile"
            description="Open the organisation profile, or close or transfer this workspace."
            href="/owner/workspace"
          />
        </AeSection>
      </TabsContent>
      <TabsContent value="business">
        <AeSection
          id={ownerSettingsBusinessSection.id}
          title={ownerSettingsBusinessSection.title}
          description={ownerSettingsBusinessSection.description}
        >
          <TaxProfileFormSection />
        </AeSection>
      </TabsContent>
      <TabsContent value="privacy">
        <AeSection
          id={ownerSettingsPrivacySection.id}
          title={ownerSettingsPrivacySection.title}
          description={ownerSettingsPrivacySection.description}
        >
          <a
            href={ownerSettingsPrivacySection.downloadHref}
            download
            className={buttonVariants({ variant: 'outline' })}
          >
            {ownerSettingsPrivacySection.downloadLabel}
          </a>
        </AeSection>
      </TabsContent>
      <TabsContent value="notifications">
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
      </TabsContent>
    </Tabs>
  )
}
