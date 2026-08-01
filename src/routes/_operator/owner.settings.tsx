import { useState } from 'react'
import { UserProfile } from '@clerk/tanstack-react-start'
import { createFileRoute } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Field, FieldContent, FieldDescription, FieldLabel } from '@/components/ui/field'
import { Switch } from '@/components/ui/switch'

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
    <Card className="grid gap-4 p-5">
      <SectionHeader
        title="Account"
        description="Update your Clerk profile, email addresses, security settings, and active sessions."
      />
      <div className="overflow-hidden rounded-md border border-border bg-card p-2">
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
    <Card className="grid gap-4 p-5">
      <SectionHeader
        title="Notifications"
        description="Choose whether AE emails you when a new written message is recorded for your business page."
      />
      {readback.kind === 'error' ? (
        <Alert>
          <AlertTitle>Notification preferences need an owner record</AlertTitle>
          <AlertDescription>{readback.reason}</AlertDescription>
        </Alert>
      ) : null}
      <Field orientation="horizontal" data-disabled={pending || readback.kind === 'error'} className="rounded-md border border-border bg-card p-4">
        <FieldContent>
          <FieldLabel htmlFor="new-message-email">New message email</FieldLabel>
          <FieldDescription>Email me when a customer sends a written message through AE. Your message list still keeps the record.</FieldDescription>
        </FieldContent>
        <Switch
          id="new-message-email"
          checked={enabled}
          onCheckedChange={(checked) => void handleChange(checked)}
          disabled={pending || readback.kind === 'error'}
        />
      </Field>
      {message === undefined ? null : <p className="text-sm text-muted-foreground">{message}</p>}
      {error === undefined ? null : <p role="alert" className="text-sm text-destructive">{error}</p>}
    </Card>
  )
}

function BusinessSettingsSection() {
  return (
    <Card className="grid gap-4 p-5">
      <SectionHeader
        title="Business"
        description="Open the existing owner surfaces for page status, messages, and claim updates."
      />
      <div className="flex flex-wrap gap-3">
        <Button asChild variant="default"><a href="/owner/status">Business page</a></Button>
        <Button asChild variant="secondary"><a href="/owner/offerings">Offerings</a></Button>
        <Button asChild variant="secondary"><a href="/owner/inquiries">Messages</a></Button>
        <Button asChild variant="secondary"><a href="/claim">List or claim a business</a></Button>
      </div>
    </Card>
  )
}

function SectionHeader({ title, description }: { title: string; description: string }) {
  return (
    <div className="grid gap-1">
      <h2>{title}</h2>
      <p className="text-muted-foreground">{description}</p>
    </div>
  )
}
