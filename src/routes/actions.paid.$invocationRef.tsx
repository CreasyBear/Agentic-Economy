import { useRef, useState } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'

import { AePaidOperationCard } from '@/components/ae/action-invocation/AePaidOperationCard'
import {
  handleHostedPaidOperationHumanCommand,
  handleHostedPaidOperationHumanInspect,
  requireHostedPaidOperationHumanBeforeLoad,
} from '@/lib/server/hosted-paid-operation-human-api'
import { getHostedPaidOperationRuntime } from '@/lib/server/hosted-paid-operation-runtime'
import {
  isHostedPaidOperationHumanAcceptedReadback,
  type HostedPaidOperationCommandDescriptor,
  type HostedPaidOperationHumanAcceptedReadback,
} from '@/modules/action-invocation/paid-operation-card-contract'

export type HostedPaidOperationDetailReadback = Readonly<{
  status: number
  body: unknown
}>

type HostedPaidOperationCommandSender = (
  body: Readonly<Record<string, unknown>>,
) => Promise<HostedPaidOperationDetailReadback>

const readHostedPaidOperationDetailServer = createServerFn({ method: 'GET' })
  .validator((data: unknown) => {
    if (data === null || typeof data !== 'object' || Array.isArray(data)) {
      throw new Error('hosted_paid_operation_detail_input_invalid')
    }
    const candidate = data as Record<string, unknown>
    if (typeof candidate.invocationRef !== 'string'
      || candidate.invocationRef.trim().length === 0
      || !Number.isSafeInteger(candidate.expectedInvocationVersion)
      || (candidate.expectedInvocationVersion as number) < 0) {
      throw new Error('hosted_paid_operation_detail_input_invalid')
    }
    return {
      invocationRef: candidate.invocationRef,
      expectedInvocationVersion: candidate.expectedInvocationVersion as number,
    }
  })
  .handler(async ({ data }) => {
    const runtime = await getHostedPaidOperationRuntime()
    const response = await handleHostedPaidOperationHumanInspect(
      data.invocationRef,
      data.expectedInvocationVersion,
      {
        gateway: runtime.gateway,
        provenance: runtime.provenance,
        currentVersion: (ref) => runtime.currentVersion(ref),
      },
    )
    return { status: response.status, body: await response.json() }
  })

export const Route = createFileRoute('/actions/paid/$invocationRef')({
  validateSearch: (search: Record<string, unknown>) => ({
    expectedInvocationVersion: Number(search.expectedInvocationVersion),
  }),
  loaderDeps: ({ search }) => search,
  beforeLoad: requireHostedPaidOperationHumanBeforeLoad,
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const runtime = await getHostedPaidOperationRuntime()
        return handleHostedPaidOperationHumanCommand(request, params.invocationRef, {
          gateway: runtime.gateway,
          provenance: runtime.provenance,
          currentVersion: (ref) => runtime.currentVersion(ref),
        })
      },
    },
  },
  loader: ({ params, deps }) => readHostedPaidOperationDetailServer({
    data: {
      invocationRef: params.invocationRef,
      expectedInvocationVersion: deps.expectedInvocationVersion,
    },
  }),
  head: () => ({
    meta: [
      { title: 'Paid sandbox operation | Agentic Economy' },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  component: PaidOperationDetailRoute,
})

function PaidOperationDetailRoute() {
  const result = Route.useLoaderData()
  return <HostedPaidOperationDetailView result={result} />
}

export function HostedPaidOperationDetailView({
  followInspectRelation = defaultFollowInspectRelation,
  result,
  sendCommand = sendHostedPaidOperationCommand,
}: Readonly<{
  followInspectRelation?: (relation: string) => void
  result: HostedPaidOperationDetailReadback
  sendCommand?: HostedPaidOperationCommandSender
}>) {
  if (result.status === 404) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-12">
        <h1 className="text-2xl font-semibold">Operation unavailable</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          This operation is not available to this account.
        </p>
        <SandboxSetupBacklink />
      </main>
    )
  }

  if (!isHostedPaidOperationHumanAcceptedReadback(result.body)) {
    return (
      <ReadUnavailable
        followInspectRelation={followInspectRelation}
      />
    )
  }

  return (
    <AcceptedPaidOperationDetail
      initial={result.body}
      followInspectRelation={followInspectRelation}
      sendCommand={sendCommand}
    />
  )
}

function AcceptedPaidOperationDetail({
  followInspectRelation,
  initial,
  sendCommand,
}: Readonly<{
  followInspectRelation: (relation: string) => void
  initial: HostedPaidOperationHumanAcceptedReadback
  sendCommand: HostedPaidOperationCommandSender
}>) {
  const [readback, setReadback] = useState(initial)
  const [card, setCard] = useState(readback.card)
  const [announcement, setAnnouncement] = useState('')
  const pendingCommandRef = useRef<string | null>(null)
  const statusRef = useRef<HTMLParagraphElement>(null)

  async function dispatch(descriptor: HostedPaidOperationCommandDescriptor) {
    if (
      pendingCommandRef.current !== null
      || !descriptorMatchesReadback(descriptor, readback)
    ) return
    const commandId = crypto.randomUUID()
    const body = commandBody(descriptor, commandId)
    if (body === null) return
    pendingCommandRef.current = commandId

    setCard({
      ...readback.card,
      pendingCommand: { pendingCommandId: commandId, kind: descriptor.command },
      transportRescue: null,
    })
    setAnnouncement('Applying the selected action to this operation.')
    focusStatus(statusRef)

    try {
      const response = await sendCommand(body)
      pendingCommandRef.current = null
      if (isHostedPaidOperationHumanAcceptedReadback(response.body)) {
        setReadback(response.body)
        setCard(response.body.card)
        replaceCurrentVersion(response.body)
        setAnnouncement(commandAcceptedAnnouncement(descriptor))
        focusStatus(statusRef)
        return
      }

      const inspectRelation = responseInspectRelation(response.body, readback)
      if (isUpdateNotConfirmed(response.body) && inspectRelation !== null) {
        setCard({
          ...readback.card,
          pendingCommand: null,
          transportRescue: {
            kind: 'update_not_confirmed',
            requestId: response.body.requestId,
            inspectRelation,
          },
        })
        setAnnouncement(
          'Update not confirmed. Reload this operation before doing anything else.',
        )
        focusStatus(statusRef)
        return
      }

      if (inspectRelation !== null) {
        setCard(readback.card)
        setAnnouncement(
          'Operation changed. Loading the latest durable state without repeating the action.',
        )
        focusStatus(statusRef)
        followInspectRelation(inspectRelation)
        return
      }
    } catch {
      pendingCommandRef.current = null
      const inspectRelation = currentInspectRelation(readback)
      setCard({
        ...readback.card,
        pendingCommand: null,
        transportRescue: {
          kind: 'update_not_confirmed',
          requestId: commandId,
          inspectRelation,
        },
      })
      setAnnouncement(
        'Update not confirmed. Reload this operation before doing anything else.',
      )
      focusStatus(statusRef)
      return
    }

    const inspectRelation = currentInspectRelation(readback)
    setCard({
      ...readback.card,
      pendingCommand: null,
      transportRescue: {
        kind: 'update_not_confirmed',
        requestId: commandId,
        inspectRelation,
      },
    })
    setAnnouncement(
      'Update not confirmed. Reload this operation before doing anything else.',
    )
    focusStatus(statusRef)
  }

  function followReadOnlyInspect(relation: string) {
    if (safeInspectRelation(relation, readback) === null) return
    followInspectRelation(relation)
  }

  return (
    <main className="mx-auto grid w-full max-w-4xl gap-6 px-4 py-8 sm:px-6">
      <div className="grid gap-3">
        <SandboxSetupBacklink />
        <h1 className="text-[28px] font-semibold leading-[1.2] text-primary">
          Paid sandbox task
        </h1>
      </div>
      <p
        ref={statusRef}
        tabIndex={-1}
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="min-h-11 rounded-md border border-border bg-surface p-3 text-sm text-primary focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        {announcement}
      </p>
      <script
        type="application/json"
        data-paid-operation-human-projection="agentic-paid-operation:v1"
      >
        {serializeEmbeddedProjection({
          semanticDigest: readback.projection.semanticDigest,
          expectedInvocationVersion: readback.expectedInvocationVersion,
        })}
      </script>
      <AePaidOperationCard
        semantics={readback.projection.semantics}
        card={card}
        onCommand={dispatch}
        onReadOnlyInspect={followReadOnlyInspect}
      />
    </main>
  )
}

function serializeEmbeddedProjection(value: unknown): string {
  return JSON.stringify(value)
    .replaceAll('<', '\\u003c')
    .replaceAll('\u2028', '\\u2028')
    .replaceAll('\u2029', '\\u2029')
}

function ReadUnavailable({
  followInspectRelation,
}: Readonly<{ followInspectRelation: (relation: string) => void }>) {
  return (
    <main className="mx-auto grid w-full max-w-3xl gap-4 px-4 py-12 sm:px-6">
      <h1 className="text-[28px] font-semibold leading-[1.2] text-primary">
        Operation not loaded
      </h1>
      <p className="text-sm text-secondary">
        AE could not load the durable operation record. Reload before taking another action.
      </p>
      <button
        type="button"
        className={[
          'min-h-11 min-w-11 rounded-md border border-border bg-surface px-4 py-2',
          'text-sm font-semibold text-primary focus-visible:outline-2',
          'focus-visible:outline-offset-2 sm:w-fit',
        ].join(' ')}
        onClick={() => followInspectRelation(window.location.href)}
      >
        Reload operation
      </button>
    </main>
  )
}

function SandboxSetupBacklink() {
  return (
    <Link className="w-fit text-sm underline" to="/actions/paid/new">
      Back to Sandbox setup
    </Link>
  )
}

function descriptorMatchesReadback(
  descriptor: HostedPaidOperationCommandDescriptor,
  readback: HostedPaidOperationHumanAcceptedReadback,
): boolean {
  if (
    descriptor.commandIdRequired !== true
    || descriptor.expectedInvocationVersion !== readback.expectedInvocationVersion
  ) return false
  const descriptors = [
    readback.card.authorize,
    readback.card.refuse,
    readback.card.safeContinuation,
  ].filter((item): item is HostedPaidOperationCommandDescriptor => item !== null)
  return descriptors.some((item) =>
    item.command === descriptor.command
    && item.expectedInvocationVersion === descriptor.expectedInvocationVersion
    && item.accept === descriptor.accept
    && item.requiredInput.join('\0') === descriptor.requiredInput.join('\0'))
}

function commandBody(
  descriptor: HostedPaidOperationCommandDescriptor,
  commandId: string,
): Readonly<Record<string, unknown>> | null {
  const base = {
    command: descriptor.command,
    commandId,
    expectedInvocationVersion: descriptor.expectedInvocationVersion,
  }
  if (descriptor.command === 'authorize') {
    return typeof descriptor.accept === 'boolean'
      && descriptor.requiredInput.length === 1
      && descriptor.requiredInput[0] === 'accept'
      ? { ...base, accept: descriptor.accept }
      : null
  }
  return descriptor.accept === undefined && descriptor.requiredInput.length === 0
    ? base
    : null
}

async function sendHostedPaidOperationCommand(
  body: Readonly<Record<string, unknown>>,
): Promise<HostedPaidOperationDetailReadback> {
  const response = await fetch(window.location.href, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    cache: 'no-store',
  })
  return { status: response.status, body: await response.json() }
}

function responseInspectRelation(
  value: unknown,
  readback: HostedPaidOperationHumanAcceptedReadback,
): string | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null
  const relation = (value as Record<string, unknown>).relation
  if (relation === null || typeof relation !== 'object' || Array.isArray(relation)) return null
  return safeInspectRelation(
    (relation as Record<string, unknown>).inspect,
    readback,
  )
}

function safeInspectRelation(
  value: unknown,
  readback: HostedPaidOperationHumanAcceptedReadback,
): string | null {
  if (typeof value !== 'string' || value.startsWith('//')) return null
  const expectedPath =
    `/actions/paid/${encodeURIComponent(readback.card.technicalDetails.invocationRef)}`
  let parsed: URL
  try {
    parsed = new URL(value, 'https://paid-operation.local')
  } catch {
    return null
  }
  const version = Number(parsed.searchParams.get('expectedInvocationVersion'))
  return parsed.origin === 'https://paid-operation.local'
    && parsed.pathname === expectedPath
    && Number.isSafeInteger(version)
    && version >= 1
    ? `${parsed.pathname}${parsed.search}`
    : null
}

function isUpdateNotConfirmed(
  value: unknown,
): value is Readonly<{
  kind: 'update_not_confirmed'
  requestId: string
  relation: Readonly<{ inspect: string }>
}> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const candidate = value as Record<string, unknown>
  return candidate.kind === 'update_not_confirmed'
    && typeof candidate.requestId === 'string'
    && candidate.requestId.trim().length > 0
}

function currentInspectRelation(
  readback: HostedPaidOperationHumanAcceptedReadback,
): string {
  return `/actions/paid/${encodeURIComponent(
    readback.card.technicalDetails.invocationRef,
  )}?expectedInvocationVersion=${readback.expectedInvocationVersion}`
}

function replaceCurrentVersion(
  readback: HostedPaidOperationHumanAcceptedReadback,
) {
  if (typeof window === 'undefined') return
  window.history.replaceState(null, '', currentInspectRelation(readback))
}

function commandAcceptedAnnouncement(
  descriptor: HostedPaidOperationCommandDescriptor,
): string {
  return descriptor.command === 'authorize' && descriptor.accept === true
    ? 'Permission recorded. Nothing has been submitted yet.'
    : 'Updated from the durable record.'
}

function focusStatus(ref: Readonly<{ current: HTMLParagraphElement | null }>) {
  queueMicrotask(() => ref.current?.focus())
}

function defaultFollowInspectRelation(relation: string) {
  window.location.assign(relation)
}
