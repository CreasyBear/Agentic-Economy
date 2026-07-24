import { useState } from 'react'
import { UserProfile } from '@clerk/tanstack-react-start'
import { createFileRoute } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { Banner } from '@astryxdesign/core/Banner'
import { Button } from '@astryxdesign/core/Button'
import { Card } from '@astryxdesign/core/Card'
import { Switch } from '@astryxdesign/core/Switch'
import { Heading, Text } from '@astryxdesign/core/Text'

import { AeOperatorShell } from '@/components/ae/layout/AeOperatorShell'
import { operatorRouteOptions } from '@/lib/operator/route-options'
import {
  readOwnerNotificationPreferencesServer,
  updateOwnerNotificationPreferencesServer,
  type OwnerNotificationPreferencesReadResult,
  type OwnerNotificationPreferencesMutationResult,
} from '@/modules/settings/settings.functions'

export const Route = createFileRoute('/_operator/owner/settings')({
  ...operatorRouteOptions,
  loader: () => readOwnerNotificationPreferencesServer(),
  head: () => ({
    meta: [
      { title: 'Owner settings | Agentic Economy' },
      { name: 'description', content: 'Owner account, notification, and business page settings.' },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  component: OwnerSettingsRoute,
})

function OwnerSettingsRoute() {
  const initialReadback = Route.useLoaderData()
  const [readback, setReadback] = useState<OwnerNotificationPreferencesReadResult>(initialReadback)

  return (
    <AeOperatorShell
      operatorRole="owner"
      title="Settings"
      description="Manage your AE account profile, message emails, and business page links."
      currentPath="/owner/settings"
    >
      <div className="grid gap-6">
        <AccountSettingsSection />
        <NotificationSettingsSection readback={readback} onReadbackChange={setReadback} />
        <BusinessSettingsSection />
      </div>
    </AeOperatorShell>
  )
}

function AccountSettingsSection() {
  return (
    <Card padding={5} className="grid gap-4">
      <SectionHeader
        title="Account"
        description="Update your Clerk profile, email addresses, security settings, and active sessions."
      />
      <div className="overflow-hidden rounded-md border border-border bg-surface p-2">
        <UserProfile />
      </div>
    </Card>
  )
}

function NotificationSettingsSection({
  readback,
  onReadbackChange,
}: {
  readback: OwnerNotificationPreferencesReadResult
  onReadbackChange: (next: OwnerNotificationPreferencesReadResult) => void
}) {
  const updatePreferences = useServerFn(updateOwnerNotificationPreferencesServer)
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState<string | undefined>()
  const [error, setError] = useState<string | undefined>(readback.kind === 'error' ? readback.reason : undefined)
  const enabled = readback.kind === 'ok' ? readback.preferences.newInquiryEmailEnabled : true

  async function handleChange(nextEnabled: boolean) {
    if (readback.kind !== 'ok') {
      setError(readback.reason)
      return
    }

    const previous = readback
    setPending(true)
    setError(undefined)
    setMessage(undefined)
    onReadbackChange({
      ...readback,
      preferences: {
        ...readback.preferences,
        newInquiryEmailEnabled: nextEnabled,
      },
    })

    try {
      const result = await updatePreferences({ data: { newInquiryEmailEnabled: nextEnabled } })
      handleMutationResult(result, previous)
    } finally {
      setPending(false)
    }
  }

  function handleMutationResult(
    result: OwnerNotificationPreferencesMutationResult,
    previous: OwnerNotificationPreferencesReadResult,
  ) {
    if (result.kind === 'ok') {
      onReadbackChange({
        kind: 'ok',
        code: 'owner_notification_preferences_read',
        ownerId: result.ownerId,
        preferences: result.preferences,
      })
      setMessage(result.preferences.newInquiryEmailEnabled ? 'Message emails are on.' : 'Message emails are off.')
      return
    }

    onReadbackChange(previous)
    setError(result.reason)
  }

  return (
    <Card padding={5} className="grid gap-4">
      <SectionHeader
        title="Notifications"
        description="Choose whether AE emails you when a new written message is recorded for your business page."
      />
      {readback.kind === 'error' ? (
        <Banner status="warning" title="Notification preferences need an owner record" description={readback.reason} />
      ) : null}
      <div className="rounded-md border border-border bg-surface p-4">
        <Switch
          label="New message email"
          description="Email me when a customer sends a written message through AE. Your message list still keeps the record."
          value={enabled}
          onChange={(checked) => void handleChange(checked)}
          isDisabled={pending || readback.kind === 'error'}
          isLoading={pending}
          labelPosition="start"
          labelSpacing="spread"
          width="100%"
        />
      </div>
      {message === undefined ? null : <Text as="p" type="supporting" color="secondary">{message}</Text>}
      {error === undefined ? null : <Text as="p" type="supporting" color="secondary">{error}</Text>}
    </Card>
  )
}

function BusinessSettingsSection() {
  return (
    <Card padding={5} className="grid gap-4">
      <SectionHeader
        title="Business"
        description="Open the existing owner surfaces for page status, messages, and claim updates."
      />
      <div className="flex flex-wrap gap-3">
        <Button href="/owner/status" variant="primary" label="Business page" />
        <Button href="/owner/offerings" variant="secondary" label="Offerings" />
        <Button href="/owner/inquiries" variant="secondary" label="Messages" />
        <Button href="/claim" variant="secondary" label="List or claim a business" />
      </div>
    </Card>
  )
}

function SectionHeader({ title, description }: { title: string; description: string }) {
  return (
    <div className="grid gap-1">
      <Heading level={2}>{title}</Heading>
      <Text as="p" type="body" color="secondary">{description}</Text>
    </div>
  )
}
