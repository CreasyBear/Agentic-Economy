import { useRef, useState } from 'react'
import { Button } from '@astryxdesign/core/Button'
import { Heading, Text } from '@astryxdesign/core/Text'
import { Selector } from '@astryxdesign/core/Selector'
import { TextInput } from '@astryxdesign/core/TextInput'

import type {
  CustomerRequestConnectedAssistantsResult,
  CustomerRequestRepeatPermission,
  CustomerRequestRepeatPermissionResult,
} from '@/modules/customer-request/agent-contract'
import type { CustomerRequestView } from '@/modules/customer-request/customer-projection'

type CustomerRoute = NonNullable<CustomerRequestView['decision']>['routes'][number]
type ConnectedAssistant = Extract<
  CustomerRequestConnectedAssistantsResult,
  { kind: 'connected_assistants' }
>['assistants'][number]

const optionTimeFormatter = new Intl.DateTimeFormat('en-AU', {
  dateStyle: 'medium',
  timeStyle: 'short',
})
const moneyFormatters = new Map<string, Intl.NumberFormat>()

export function CustomerRequestRepeatPermissionControl({
  projection,
  route,
}: {
  projection: CustomerRequestView
  route: CustomerRoute
}) {
  const maximumCost = route.maximumTotalCost
  const [expanded, setExpanded] = useState(false)
  const [assistants, setAssistants] = useState<readonly ConnectedAssistant[]>([])
  const [assistantRef, setAssistantRef] = useState('')
  const [occurrences, setOccurrences] = useState('2')
  const [totalCeiling, setTotalCeiling] = useState(
    maximumCost.kind === 'known' ? minorUnitsToInput(maximumCost.amountMinor * 2) : '',
  )
  const [expiryChoice, setExpiryChoice] = useState('one_day')
  const [loading, setLoading] = useState(false)
  const [receipt, setReceipt] = useState<CustomerRequestRepeatPermission>()
  const [error, setError] = useState<string>()
  const allowKeyRef = useRef<string | undefined>(undefined)
  const withdrawKeyRef = useRef<string | undefined>(undefined)

  async function open() {
    setExpanded(true)
    setLoading(true)
    setError(undefined)
    try {
      const response = await fetch(
        `/api/requests/${encodeURIComponent(projection.requestRef)}/repeat-permissions`,
        { method: 'GET', headers: { Accept: 'application/json' } },
      )
      const result: CustomerRequestConnectedAssistantsResult = await response.json()
      if (!response.ok || result.kind !== 'connected_assistants') {
        setError(response.status === 401
          ? 'Sign in again to manage repeat permission.'
          : 'AE could not load your connected assistants.')
        return
      }
      setAssistants(result.assistants)
      setAssistantRef((current) => current || result.assistants[0]?.assistantRef || '')
      const currentPermission = result.permissions.find((permission) => (
        permission.routeRef === route.routeRef
      ))
      if (currentPermission !== undefined) {
        setReceipt(currentPermission)
        setAssistantRef(currentPermission.delegatedCredentialId)
      }
    } catch {
      setError('AE could not be reached. No repeat permission was created.')
    } finally {
      setLoading(false)
    }
  }

  async function allow() {
    if (maximumCost.kind !== 'known') return
    const occurrenceLimit = Number(occurrences)
    const cumulativeAmountMinor = inputToMinorUnits(totalCeiling)
    if (!Number.isSafeInteger(occurrenceLimit) || occurrenceLimit < 1) {
      setError('Maximum uses must be a positive whole number.')
      return
    }
    if (cumulativeAmountMinor === undefined || cumulativeAmountMinor < maximumCost.amountMinor) {
      setError(`The total ceiling must cover at least one use: ${formatMoney(maximumCost.currency, maximumCost.amountMinor)}.`)
      return
    }
    if (assistantRef.length === 0) {
      setError('Choose a connected assistant first.')
      return
    }
    setLoading(true)
    setError(undefined)
    try {
      allowKeyRef.current ??= `allow-repeat:${projection.requestRef}:${route.routeRef}:${crypto.randomUUID()}`
      const response = await fetch(
        `/api/requests/${encodeURIComponent(projection.requestRef)}/repeat-permissions`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            revision: projection.revision,
            routeRef: route.routeRef,
            delegatedCredentialId: assistantRef,
            occurrences: occurrenceLimit,
            cumulativeSpend: {
              currency: maximumCost.currency,
              amountMinor: cumulativeAmountMinor,
            },
            validUntil: repeatPermissionExpiry(expiryChoice, route.validUntil),
            idempotencyKey: allowKeyRef.current,
          }),
        },
      )
      const result: CustomerRequestRepeatPermissionResult = await response.json()
      if (!response.ok || result.kind !== 'repeat_permission') {
        setError(repeatPermissionError(result))
        return
      }
      setReceipt(result)
    } catch {
      setError('AE could not be reached. No repeat permission was created.')
    } finally {
      setLoading(false)
    }
  }

  async function withdraw() {
    if (receipt === undefined) return
    setLoading(true)
    setError(undefined)
    try {
      withdrawKeyRef.current ??= `withdraw-repeat:${projection.requestRef}:${route.routeRef}:${crypto.randomUUID()}`
      const response = await fetch(
        `/api/requests/${encodeURIComponent(projection.requestRef)}/repeat-permissions/${encodeURIComponent(receipt.permissionRef)}/withdrawal`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            routeRef: route.routeRef,
            idempotencyKey: withdrawKeyRef.current,
          }),
        },
      )
      const result: CustomerRequestRepeatPermissionResult = await response.json()
      if (!response.ok || result.kind !== 'repeat_permission') {
        setError(repeatPermissionError(result))
        return
      }
      setReceipt(result)
    } catch {
      setError('AE could not be reached. The existing permission may still be active.')
    } finally {
      setLoading(false)
    }
  }

  if (!expanded) {
    return <Button label="Allow repeat use" variant="secondary" clickAction={() => void open()} />
  }

  const selectedAssistant = assistants.find((assistant) => assistant.assistantRef === assistantRef)
  if (receipt !== undefined) {
    return <div className="basis-full rounded-md border border-border bg-surface p-4" aria-live="polite">
      <div className="grid gap-3">
        <Heading level={3}>Repeat permission {receipt.status === 'active' ? 'active' : 'withdrawn'}</Heading>
        <Text>{selectedAssistant?.label ?? 'The connected assistant'} may confirm this exact choice up to {receipt.limits.occurrences} times.</Text>
        <Text color="secondary">Total ceiling {receipt.limits.cumulativeSpend.currency} {minorUnitsToInput(
          receipt.limits.cumulativeSpend.amountMinor,
        )}. Expires {formatOptionTime(receipt.validUntil)}.</Text>
        <Text color="secondary">If this choice changes or a limit is reached, AE will ask you to confirm again.</Text>
        {receipt.status === 'active'
          ? <>
              <Text weight="semibold">Nothing has started. Each permitted use creates a confirmation before work can begin.</Text>
              <Button
                label={loading ? 'Withdrawing…' : 'Withdraw repeat permission'}
                variant="secondary"
                isDisabled={loading}
                clickAction={() => void withdraw()}
              />
            </>
          : <Text weight="semibold">The assistant cannot use this permission again.</Text>}
        {error === undefined ? null : <Text className="text-danger">{error}</Text>}
      </div>
    </div>
  }

  return <div className="basis-full rounded-md border border-border bg-surface p-4" aria-live="polite">
    <div className="grid gap-4">
      <div className="grid gap-1">
        <Heading level={3}>Set limits for repeat use</Heading>
        <Text color="secondary">Nothing starts when you create this permission. The assistant can only confirm this exact current choice within the limits below.</Text>
      </div>
      {loading && assistants.length === 0
        ? <Text color="secondary">Loading connected assistants…</Text>
        : assistants.length === 0
          ? <Text color="secondary">No eligible assistant is connected to this Request yet.</Text>
          : <>
              <Selector
                label="Connected assistant"
                value={assistantRef}
                options={assistants.map((assistant) => ({
                  value: assistant.assistantRef,
                  label: assistant.label,
                }))}
                isDisabled={loading}
                onChange={(value) => setAssistantRef(value ?? '')}
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="grid gap-1 text-sm font-semibold">
                  Maximum uses
                  <input
                    className="min-h-11 rounded-md border border-border bg-canvas px-3 py-2 font-normal"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    step={1}
                    value={occurrences}
                    disabled={loading}
                    onChange={(event) => setOccurrences(event.target.value)}
                  />
                </label>
                <TextInput
                  label="Total spending ceiling"
                  htmlName="repeat-permission-total-ceiling"
                  value={totalCeiling}
                  isDisabled={loading}
                  onChange={setTotalCeiling}
                  {...(maximumCost.kind === 'known'
                    ? { description: `Enter the total in ${maximumCost.currency}.` }
                    : {})}
                />
              </div>
              <Selector
                label="Permission expires"
                value={expiryChoice}
                options={[
                  { value: 'one_hour', label: 'In one hour, or when this choice expires' },
                  { value: 'one_day', label: 'In 24 hours, or when this choice expires' },
                  { value: 'choice_expiry', label: 'When this choice expires' },
                ]}
                isDisabled={loading}
                onChange={(value) => setExpiryChoice(value ?? 'choice_expiry')}
              />
              <Text type="supporting" color="secondary">One use can cost at most {maximumCost.kind === 'known'
                ? formatMoney(maximumCost.currency, maximumCost.amountMinor)
                : 'an amount that still needs confirmation'}.</Text>
              <div className="flex flex-wrap gap-3">
                <Button
                  label={loading ? 'Creating…' : 'Create repeat permission'}
                  variant="primary"
                  isDisabled={loading}
                  clickAction={() => void allow()}
                />
                <Button label="Cancel" variant="ghost" isDisabled={loading} clickAction={() => setExpanded(false)} />
              </div>
            </>}
      {error === undefined ? null : <Text className="text-danger">{error}</Text>}
    </div>
  </div>
}

function minorUnitsToInput(amountMinor: number): string {
  return (amountMinor / 100).toFixed(2)
}

function inputToMinorUnits(value: string): number | undefined {
  if (!/^\d+(?:\.\d{1,2})?$/u.test(value.trim())) return undefined
  const [units = '0', fraction = ''] = value.trim().split('.')
  const amount = Number(units) * 100 + Number(fraction.padEnd(2, '0'))
  return Number.isSafeInteger(amount) ? amount : undefined
}

function repeatPermissionExpiry(choice: string, routeValidUntil: number): number {
  const duration = choice === 'one_hour' ? 60 * 60_000 : choice === 'one_day' ? 24 * 60 * 60_000 : Number.MAX_SAFE_INTEGER
  return Math.min(routeValidUntil, Date.now() + duration)
}

function repeatPermissionError(result: CustomerRequestRepeatPermissionResult): string {
  if (result.kind === 'unavailable') return result.summary
  if (result.kind === 'conflict') return 'This choice changed. Return to the current options before allowing repeat use.'
  if (result.kind === 'refused' && result.reason === 'authentication_required') {
    return 'Sign in again to manage repeat permission.'
  }
  return 'AE could not change repeat permission. The existing Request is unchanged.'
}

function formatMoney(currency: string, amountMinor: number): string {
  let formatter = moneyFormatters.get(currency)
  if (formatter === undefined) {
    formatter = new Intl.NumberFormat('en-AU', { style: 'currency', currency })
    moneyFormatters.set(currency, formatter)
  }
  return formatter.format(amountMinor / 100)
}

function formatOptionTime(value: number): string {
  return optionTimeFormatter.format(new Date(value))
}
