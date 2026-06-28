import { useEffect, useState, type FormEvent } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { createServerFn, useServerFn } from '@tanstack/react-start'
import { ConvexHttpClient } from 'convex/browser'
import { makeFunctionReference } from 'convex/server'
import type { DefaultFunctionArgs, FunctionArgs, FunctionReference, FunctionReturnType } from 'convex/server'
import { z } from 'zod'

import { AePageHeader } from '@/components/ae/layout/AePageHeader'
import { AePublicShell } from '@/components/ae/layout/AePublicShell'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { Spinner } from '@/components/ui/spinner'
import { Textarea } from '@/components/ui/textarea'
import { getDefaultPublicOwnerStatusReadback, getPublicOwnerStatusReadbackBySlug } from '@/modules/catalog/public'
import { brandNonEmpty } from '@/modules/common/ids'
import {
  createEmptyDisputeSourceState,
  openRemovalDispute as openRemovalDisputeModule,
} from '@/modules/security/public'
import type { DisputeOpenResult } from '@/modules/security/public'

const removalSchema = z.object({
  slug: z.string(),
  contactEmail: z.string(),
  reasonCode: z.enum(['privacy_removal_requested', 'ownership_contested', 'duplicate_or_impersonation', 'unsafe_or_inaccurate']),
  evidenceSummary: z.string(),
})

type RemovalInput = z.infer<typeof removalSchema>
type Env = Record<string, string | undefined>

type OpenRemovalDisputeArgs = {
  businessId: string
  targetType: 'business'
  targetRef: string
  reasonCode: RemovalInput['reasonCode']
  contactEmail?: string
  evidence: {
    label: string
    mediaType: 'text/plain'
    byteLength: number
    privateRef: string
  }[]
  publicMessage?: string
  csrfToken?: string
  csrfCookie?: string
  origin?: string
  operationKey: string
  correlationId: string
}

const openRemovalDisputeMutation = sourceMutation<OpenRemovalDisputeArgs, DisputeOpenResult>('security:openRemovalDispute')

const openRemovalServer = createServerFn({ method: 'POST' })
  .validator((data) => removalSchema.parse(data))
  .handler(async ({ data }) => openRemovalDisputeThroughSource(data))

export async function openRemovalDisputeThroughSource(data: RemovalInput): Promise<DisputeOpenResult> {
  if (usesLocalE2eBypass()) {
    return openRemovalDisputeLocal(data)
  }

  try {
    const readback = getPublicOwnerStatusReadbackBySlug(data.slug) ?? getDefaultPublicOwnerStatusReadback()
    const operationSuffix = `${normalizeOperationPart(data.slug)}:${crypto.randomUUID()}`
    return await callPublicMutation(openRemovalDisputeMutation, {
      businessId: readback.catalog.businessId,
      targetType: 'business',
      targetRef: readback.catalog.businessId,
      reasonCode: data.reasonCode,
      contactEmail: data.contactEmail,
      evidence: [
        {
          label: data.evidenceSummary,
          mediaType: 'text/plain',
          byteLength: Math.max(data.evidenceSummary.length, 1),
          privateRef: `private:evidence:removal:${readback.catalog.slug}`,
        },
      ],
      publicMessage: data.slug,
      csrfToken: 'csrf-removal',
      csrfCookie: 'csrf-removal',
      origin: requestOrigin(),
      operationKey: `op:removal:${operationSuffix}`,
      correlationId: `corr:removal:${operationSuffix}`,
    })
  } catch {
    return {
      kind: 'error',
      code: 'dispute_invalid_target',
      retryable: true,
      reason: 'Removal request could not be recorded. Please try again.',
    }
  }
}

export const Route = createFileRoute('/privacy/remove-business')({
  head: () => ({
    meta: [
      { title: 'Request removal or correction | Agentic Economy' },
      { name: 'description', content: 'Request removal or correction for an Agentic Economy public service page.' },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  component: RemoveBusinessRoute,
})

function RemoveBusinessRoute() {
  const openRemoval = useServerFn(openRemovalServer)
  const [hydrated, setHydrated] = useState(false)
  const [value, setValue] = useState<RemovalInput>({
    slug: 'parramatta-emergency-plumbing',
    contactEmail: '',
    reasonCode: 'privacy_removal_requested',
    evidenceSummary: '',
  })
  const [error, setError] = useState<string | undefined>()
  const [receipt, setReceipt] = useState<string | undefined>()
  const [pending, setPending] = useState(false)

  useEffect(() => {
    setHydrated(true)
  }, [])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(undefined)
    setReceipt(undefined)

    if (value.contactEmail.trim().length === 0) {
      setError('A contact email is required.')
      focusField('contactEmail')
      return
    }

    if (value.evidenceSummary.trim().length === 0) {
      setError('Evidence summary is required.')
      focusField('evidenceSummary')
      return
    }

    setPending(true)
    try {
      const result = await openRemoval({ data: value })
      if (result.kind === 'ok') {
        setReceipt(`Request ${result.receipt.status}. Reference ${result.receipt.disputeId}.`)
        return
      }

      setError(result.reason)
    } finally {
      setPending(false)
    }
  }

  return (
    <AePublicShell>
      <AePageHeader
        eyebrow="Privacy and correction"
        title="Request removal or correction"
        description="Use this safety valve when a public service page should be removed, corrected, or reviewed for ownership."
      />
      <form onSubmit={handleSubmit} className="mx-auto grid w-full max-w-3xl gap-6 px-4 pb-16 md:px-6" noValidate>
        {error === undefined ? null : (
          <Alert variant="destructive">
            <AlertTitle>Request needs attention</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {receipt === undefined ? null : (
          <Alert>
            <AlertTitle>Request recorded</AlertTitle>
            <AlertDescription>{receipt}</AlertDescription>
          </Alert>
        )}
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="slug">Public page slug</FieldLabel>
            <Input
              id="slug"
              name="slug"
              value={value.slug}
              disabled={!hydrated || pending}
              onChange={(event) => {
                const nextValue = event.currentTarget.value
                setValue((current) => ({ ...current, slug: nextValue }))
              }}
            />
            <FieldDescription>Use the slug from the page URL.</FieldDescription>
          </Field>
          <Field data-invalid={error?.includes('contact') ? true : undefined}>
            <FieldLabel htmlFor="contactEmail">Contact email</FieldLabel>
            <Input
              id="contactEmail"
              name="contactEmail"
              type="email"
              value={value.contactEmail}
              aria-invalid={error?.includes('contact') || undefined}
              disabled={!hydrated || pending}
              onChange={(event) => {
                const nextValue = event.currentTarget.value
                setValue((current) => ({ ...current, contactEmail: nextValue }))
              }}
            />
            <FieldDescription>Stored behind private evidence; not shown on public pages.</FieldDescription>
            {error?.includes('contact') ? <FieldError>{error}</FieldError> : null}
          </Field>
          <Field>
            <FieldLabel htmlFor="reasonCode">Reason</FieldLabel>
            <NativeSelect
              id="reasonCode"
              name="reasonCode"
              value={value.reasonCode}
              disabled={!hydrated || pending}
              onChange={(event) => {
                const nextValue = toRemovalReason(event.currentTarget.value)
                setValue((current) => ({ ...current, reasonCode: nextValue }))
              }}
            >
              <option value="privacy_removal_requested">Remove this public page</option>
              <option value="ownership_contested">Ownership is contested</option>
              <option value="duplicate_or_impersonation">Duplicate or impersonation concern</option>
              <option value="unsafe_or_inaccurate">Unsafe or inaccurate public facts</option>
            </NativeSelect>
          </Field>
          <Field data-invalid={error?.includes('Evidence') ? true : undefined}>
            <FieldLabel htmlFor="evidenceSummary">Evidence summary</FieldLabel>
            <Textarea
              id="evidenceSummary"
              name="evidenceSummary"
              value={value.evidenceSummary}
              aria-invalid={error?.includes('Evidence') || undefined}
              disabled={!hydrated || pending}
              onChange={(event) => {
                const nextValue = event.currentTarget.value
                setValue((current) => ({ ...current, evidenceSummary: nextValue }))
              }}
            />
            <FieldDescription>Summarize the correction or removal evidence. Do not include secrets.</FieldDescription>
            {error?.includes('Evidence') ? <FieldError>{error}</FieldError> : null}
          </Field>
        </FieldGroup>
        <Button type="submit" disabled={pending || !hydrated}>
          {pending ? <Spinner data-icon="inline-start" /> : null}
          Submit request
        </Button>
      </form>
    </AePublicShell>
  )
}

function focusField(name: keyof Pick<RemovalInput, 'contactEmail' | 'evidenceSummary'>) {
  requestAnimationFrame(() => {
    document.querySelector<HTMLElement>(`[name="${name}"]`)?.focus()
  })
}

function toRemovalReason(value: string): RemovalInput['reasonCode'] {
  if (value === 'ownership_contested' || value === 'duplicate_or_impersonation' || value === 'unsafe_or_inaccurate') {
    return value
  }

  return 'privacy_removal_requested'
}

function openRemovalDisputeLocal(data: RemovalInput): DisputeOpenResult {
  const readback = getPublicOwnerStatusReadbackBySlug(data.slug) ?? getDefaultPublicOwnerStatusReadback()
  const state = createEmptyDisputeSourceState()
  return openRemovalDisputeModule(state, {
    businessId: readback.catalog.businessId,
    targetType: 'business',
    targetRef: readback.catalog.businessId,
    reasonCode: data.reasonCode,
    contact: { email: data.contactEmail },
    evidence: [
      {
        label: data.evidenceSummary,
        mediaType: 'text/plain',
        byteLength: Math.max(data.evidenceSummary.length, 1),
        privateRef: `private:evidence:removal:${readback.catalog.slug}`,
      },
    ],
    publicMessage: data.slug,
    security: {
      csrf: {
        csrfToken: 'csrf-removal',
        csrfCookie: 'csrf-removal',
        allowedOrigins: ['https://ae.example'],
      },
      rateLimit: {
        scope: 'dispute_open',
        key: `removal:${normalizeOperationPart(data.slug)}`,
        now: 1_000,
        limit: 3,
        windowMs: 60_000,
      },
    },
    operationKey: brandNonEmpty(`op:removal:${normalizeOperationPart(data.slug)}`, 'OperationKey'),
    correlationId: brandNonEmpty(`corr:removal:${normalizeOperationPart(data.slug)}`, 'CorrelationId'),
    now: 1_000,
  })
}

function sourceMutation<Args extends DefaultFunctionArgs = DefaultFunctionArgs, Result = unknown>(
  name: string
): FunctionReference<'mutation', 'public', Args, Result> {
  return makeFunctionReference<'mutation', Args, Result>(name)
}

async function callPublicMutation<Mutation extends FunctionReference<'mutation'>>(
  mutation: Mutation,
  args: FunctionArgs<Mutation>
): Promise<FunctionReturnType<Mutation>> {
  const client = new ConvexHttpClient(readRequiredConvexUrl(process.env))
  return client.mutation(mutation, args)
}

function requestOrigin(): string {
  return readEnv(process.env, 'SITE_URL') ?? readEnv(process.env, 'VITE_SITE_URL') ?? 'https://ae.example'
}

function readRequiredConvexUrl(env: Env): string {
  const value = readEnv(env, 'CONVEX_URL') ?? readEnv(env, 'VITE_CONVEX_URL')
  if (value === undefined) {
    throw new Error('CONVEX_URL or VITE_CONVEX_URL is required for server Convex calls.')
  }

  return value
}

function readEnv(env: Env, name: string): string | undefined {
  const value = env[name]
  if (value === undefined || value.trim().length === 0) {
    return undefined
  }

  return value.trim()
}

function normalizeOperationPart(value: string): string {
  const normalized = value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 72)
  return normalized.length === 0 ? 'removal' : normalized
}

function usesLocalE2eBypass(): boolean {
  return process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E === 'true'
}
