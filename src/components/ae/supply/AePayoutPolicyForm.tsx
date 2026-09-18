'use client'

import { useState } from 'react'
import { AlertCircleIcon } from 'lucide-react'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { parseDecimalExactAmount } from '@/modules/money/public'
import { toast } from '@/lib/ui/toast'

export type PayoutScheduleType = 'monthly' | 'weekly' | 'manual'

export type AePayoutPolicyFormProps = Readonly<{
  businessId: string
  currency: string
  initialThresholdUnits?: string
  initialSchedule?: PayoutScheduleType
  initialRevision?: number
  onSavePreferences?: (params: {
    businessId: string
    currency: string
    minimumPayoutUnits: string
    schedule: PayoutScheduleType
    expectedRevision: number
  }) => Promise<{ kind: 'updated'; revision: number } | { kind: 'conflict'; currentRevision: number }>
}>

function unitsToDecimalString(units: string | undefined): string {
  if (!units) return '50'
  try {
    const raw = BigInt(units)
    const factor = 1_000_000n // AUD exponent 6
    const whole = raw / factor
    return whole.toString()
  } catch (cause) {
    void cause;
    return '50'
  }
}

export function AePayoutPolicyForm({
  businessId,
  currency,
  initialThresholdUnits = '50000000',
  initialSchedule = 'monthly',
  initialRevision = 0,
  onSavePreferences,
}: AePayoutPolicyFormProps) {
  const [thresholdDollars, setThresholdDollars] = useState(() => unitsToDecimalString(initialThresholdUnits))
  const [schedule, setSchedule] = useState<PayoutScheduleType>(initialSchedule)
  const [revision, setRevision] = useState(initialRevision)
  const [error, setError] = useState<string>()
  const [pending, setPending] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(undefined)

    const exactAmount = parseDecimalExactAmount('AUD', thresholdDollars, 6)
    if (!exactAmount) {
      setError('Enter a valid dollar amount.')
      return
    }

    const units = BigInt(exactAmount.units)
    if (units < 10_000_000n) { // Min A$10.00
      setError('Minimum payout threshold must be at least A$10.00.')
      return
    }

    if (!onSavePreferences) return

    setPending(true)
    try {
      const result = await onSavePreferences({
        businessId,
        currency,
        minimumPayoutUnits: exactAmount.units,
        schedule,
        expectedRevision: revision,
      })

      if (result.kind === 'updated') {
        setRevision(result.revision)
        toast.success('Payout preferences updated')
      } else {
        setRevision(result.currentRevision)
        setError('Preferences were modified concurrently. Reloaded current settings.')
        toast.error('Update conflict')
      }
    } catch (cause) {
      void cause;
      setError('Network error saving payout preferences.')
      toast.error('Network error')
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="grid gap-4 rounded-xl border bg-card p-5 shadow-xs">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-sm font-semibold text-foreground">
            Payout Schedule & Threshold
          </h4>
          <p className="text-xs text-muted-foreground">
            Configure settlement frequency and minimum accumulation threshold before funds transfer to Stripe Express.
          </p>
        </div>
      </div>

      <form onSubmit={(e) => void handleSubmit(e)} className="grid gap-4 pt-1">
        {error && (
          <Alert variant="destructive" className="py-2">
            <AlertCircleIcon className="size-4" />
            <AlertDescription className="text-xs">{error}</AlertDescription>
          </Alert>
        )}

        <FieldGroup className="grid gap-3">
          <Field>
            <FieldLabel htmlFor="payout-threshold" className="text-xs">
              Minimum payout threshold (A$)
            </FieldLabel>
            <div className="relative max-w-xs">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-muted-foreground text-xs">
                A$
              </span>
              <Input
                id="payout-threshold"
                type="text"
                inputMode="decimal"
                value={thresholdDollars}
                disabled={pending}
                onChange={(e) => {
                  setThresholdDollars(e.target.value)
                  setError(undefined)
                }}
                className="pl-8 text-sm font-mono"
              />
            </div>
            <FieldDescription className="text-[11px]">
              Earnings below this amount remain held in your provider account until reached. Minimum A$10.00.
            </FieldDescription>
          </Field>

          <Field>
            <FieldLabel className="text-xs">Settlement Schedule</FieldLabel>
            <RadioGroup
              value={schedule}
              onValueChange={(val) => setSchedule(val as PayoutScheduleType)}
              className="grid gap-2 pt-1"
              disabled={pending}
            >
              <div className="flex items-center gap-2">
                <RadioGroupItem value="monthly" id="schedule-monthly" />
                <label
                  htmlFor="schedule-monthly"
                  className="text-xs font-medium cursor-pointer"
                >
                  Monthly (1st of each month)
                </label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="weekly" id="schedule-weekly" />
                <label
                  htmlFor="schedule-weekly"
                  className="text-xs font-medium cursor-pointer"
                >
                  Weekly (Every Monday)
                </label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="manual" id="schedule-manual" />
                <label
                  htmlFor="schedule-manual"
                  className="text-xs font-medium cursor-pointer"
                >
                  Manual (Transfer only when manually reviewed and approved)
                </label>
              </div>
            </RadioGroup>
          </Field>
        </FieldGroup>

        <div className="flex justify-end pt-2">
          <Button
            type="submit"
            size="sm"
            disabled={pending}
            className="min-h-touch"
          >
            {pending ? 'Saving preferences...' : 'Save Payout Preferences'}
          </Button>
        </div>
      </form>
    </div>
  )
}
