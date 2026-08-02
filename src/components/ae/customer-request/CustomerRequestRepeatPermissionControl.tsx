import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { formatTimestamp } from '@/lib/ui/format-time'
import { formatMoney } from '@/lib/ui/format-money'

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
    return <Button type="button" variant="secondary" onClick={() => void open()}>Allow repeat use</Button>
  }

  const selectedAssistant = assistants.find((assistant) => assistant.assistantRef === assistantRef)
  if (receipt !== undefined) {
    return <Card className="basis-full p-4" aria-live="polite">
      <CardHeader className="p-0">
        <CardTitle>Repeat permission {receipt.status === 'active' ? 'active' : 'withdrawn'}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 p-0">
        <p>{selectedAssistant?.label ?? 'The connected assistant'} may confirm this exact choice up to {receipt.limits.occurrences} times.</p>
        <p className="text-muted-foreground">Total ceiling {receipt.limits.cumulativeSpend.currency} {minorUnitsToInput(
          receipt.limits.cumulativeSpend.amountMinor,
        )}. Expires {formatTimestamp(receipt.validUntil)}.</p>
        <p className="text-muted-foreground">If this choice changes or a limit is reached, AE will ask you to confirm again.</p>
        {receipt.status === 'active'
          ? <>
              <p className="font-semibold">Nothing has started. Each permitted use creates a confirmation before work can begin.</p>
              <Button
                type="button"
                variant="secondary"
                disabled={loading}
                onClick={() => void withdraw()}
              >
                {loading ? 'Withdrawing…' : 'Withdraw repeat permission'}
              </Button>
            </>
          : <p className="font-semibold">The assistant cannot use this permission again.</p>}
        {error === undefined ? null : <p className="text-destructive">{error}</p>}
      </CardContent>
    </Card>
  }

  return <Card className="basis-full p-4" aria-live="polite">
    <CardHeader className="p-0">
      <CardTitle>Set limits for repeat use</CardTitle>
      <CardDescription>Nothing starts when you create this permission. The assistant can only confirm this exact current choice within the limits below.</CardDescription>
    </CardHeader>
    <CardContent className="grid gap-4 p-0">
      {loading && assistants.length === 0
        ? <p className="text-muted-foreground">Loading connected assistants…</p>
        : assistants.length === 0
          ? <p className="text-muted-foreground">No eligible assistant is connected to this Request yet.</p>
          : <>
              <FieldGroup className="grid gap-4">
                <Field data-disabled={loading}>
                  <FieldLabel htmlFor="repeat-permission-assistant">Connected assistant</FieldLabel>
                  <Select value={assistantRef} onValueChange={setAssistantRef} disabled={loading}>
                    <SelectTrigger id="repeat-permission-assistant" className="min-h-11 w-full">
                      <SelectValue placeholder="Connected assistant" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {assistants.map((assistant) => <SelectItem key={assistant.assistantRef} value={assistant.assistantRef}>{assistant.label}</SelectItem>)}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
                <FieldGroup className="grid grid-cols-2 gap-4">
                  <Field data-disabled={loading}>
                    <FieldLabel htmlFor="repeat-permission-occurrences">Maximum uses</FieldLabel>
                    <Input
                      id="repeat-permission-occurrences"
                      className="min-h-11 rounded-md border border-border bg-canvas px-3 py-2 font-normal"
                      type="number"
                      inputMode="numeric"
                      min={1}
                      step={1}
                      value={occurrences}
                      disabled={loading}
                      onChange={(event) => setOccurrences(event.target.value)}
                    />
                  </Field>
                  <Field data-disabled={loading}>
                    <FieldLabel htmlFor="repeat-permission-total-ceiling">Total spending ceiling</FieldLabel>
                    <Input
                      id="repeat-permission-total-ceiling"
                      name="repeat-permission-total-ceiling"
                      value={totalCeiling}
                      disabled={loading}
                      onChange={(event) => setTotalCeiling(event.target.value)}
                      {...(maximumCost.kind === 'known'
                        ? { 'aria-describedby': 'repeat-permission-total-ceiling-description' }
                        : {})}
                    />
                    {maximumCost.kind === 'known'
                      ? <FieldDescription id="repeat-permission-total-ceiling-description">Enter the total in {maximumCost.currency}.</FieldDescription>
                      : null}
                  </Field>
                </FieldGroup>
                <Field data-disabled={loading}>
                  <FieldLabel htmlFor="repeat-permission-expiry">Permission expires</FieldLabel>
                  <Select value={expiryChoice} onValueChange={setExpiryChoice} disabled={loading}>
                    <SelectTrigger id="repeat-permission-expiry" className="min-h-11 w-full">
                      <SelectValue placeholder="Permission expires" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value="one_hour">In one hour, or when this choice expires</SelectItem>
                        <SelectItem value="one_day">In 24 hours, or when this choice expires</SelectItem>
                        <SelectItem value="choice_expiry">When this choice expires</SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
              </FieldGroup>
              <p className="text-sm text-muted-foreground">One use can cost at most {maximumCost.kind === 'known'
                ? formatMoney(maximumCost.currency, maximumCost.amountMinor)
                : 'an amount that still needs confirmation'}.</p>
              <Field orientation="horizontal" className="flex flex-wrap gap-3">
                <Button
                  type="button"
                  variant="default"
                  disabled={loading}
                  onClick={() => void allow()}
                >
                  {loading ? 'Creating…' : 'Create repeat permission'}
                </Button>
                <Button type="button" variant="ghost" disabled={loading} onClick={() => setExpanded(false)}>Cancel</Button>
              </Field>
            </>}
      {error === undefined ? null : <p className="text-destructive">{error}</p>}
    </CardContent>
  </Card>
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


