'use client'

import { useEffect, useState } from 'react'
import { AlertCircleIcon } from 'lucide-react'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { cn } from '@/lib/utils'
import { parseDecimalExactAmount } from '@/modules/money/public'
import { toast } from '@/lib/ui/toast'

import {
  BELOW_MINIMUM_DIAGNOSTIC,
  BECS_REASSURANCE,
  buildNextPayoutStatement,
  buildThresholdSummary,
  CONFLICT_DIAGNOSTIC,
  INVALID_AMOUNT_DIAGNOSTIC,
  NETWORK_DIAGNOSTIC,
  PAYOUT_THRESHOLD_PRESETS,
  TACTILE,
  type PayoutPolicyDiagnostic,
  type PayoutScheduleType,
} from './payout-policy-copy'

export type { PayoutScheduleType } from './payout-policy-copy'

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

const SCHEDULE_OPTIONS: ReadonlyArray<{
  value: PayoutScheduleType
  id: string
  title: string
  subtitle: string
}> = [
  {
    value: 'weekly',
    id: 'schedule-weekly',
    title: 'Weekly on Monday',
    subtitle: 'Transferred every Monday 10:00 AM AEST',
  },
  {
    value: 'monthly',
    id: 'schedule-monthly',
    title: 'Monthly on the 1st',
    subtitle: 'Transferred on the 1st of each month',
  },
  {
    value: 'manual',
    id: 'schedule-manual',
    title: 'Manual Approval',
    subtitle: 'Funds accumulate until you review and trigger payout',
  },
]

const RADIO_CARD_CLASS = cn(
  'grid min-h-touch cursor-pointer grid-cols-[auto_minmax(0,1fr)] items-start gap-3 rounded-md border border-border px-3 py-3',
  'has-[[data-checked]]:border-foreground has-[[data-checked]]:bg-muted',
  TACTILE,
)

function unitsToDecimalString(units: string | undefined): string {
  if (!units) return '50'
  try {
    const raw = BigInt(units)
    const factor = 1_000_000n
    const whole = raw / factor
    return whole.toString()
  } catch (cause) {
    void cause
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
  const [thresholdDollars, setThresholdDollars] = useState(() =>
    unitsToDecimalString(initialThresholdUnits),
  )
  const [schedule, setSchedule] = useState<PayoutScheduleType>(initialSchedule)
  const [revision, setRevision] = useState(initialRevision)
  const [diagnostic, setDiagnostic] = useState<PayoutPolicyDiagnostic | null>(null)
  const [pending, setPending] = useState(false)

  useEffect(() => {
    setThresholdDollars(unitsToDecimalString(initialThresholdUnits))
    setSchedule(initialSchedule)
    setRevision(initialRevision)
  }, [initialThresholdUnits, initialSchedule, initialRevision])

  const clearDiagnostic = () => setDiagnostic(null)

  const resetDraftFromProps = () => {
    setThresholdDollars(unitsToDecimalString(initialThresholdUnits))
    setSchedule(initialSchedule)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setDiagnostic(null)

    const exactAmount = parseDecimalExactAmount('AUD', thresholdDollars, 6)
    if (!exactAmount) {
      setDiagnostic(INVALID_AMOUNT_DIAGNOSTIC)
      toast.error(INVALID_AMOUNT_DIAGNOSTIC.whatHappened, {
        description: INVALID_AMOUNT_DIAGNOSTIC.nextStep,
      })
      return
    }

    const units = BigInt(exactAmount.units)
    if (units < 10_000_000n) {
      setDiagnostic(BELOW_MINIMUM_DIAGNOSTIC)
      toast.error(BELOW_MINIMUM_DIAGNOSTIC.whatHappened, {
        description: BELOW_MINIMUM_DIAGNOSTIC.nextStep,
      })
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
        clearDiagnostic()
        toast.success('Payout preferences saved', {
          description: `${buildNextPayoutStatement(schedule)} ${buildThresholdSummary(thresholdDollars)}`,
        })
      } else {
        setRevision(result.currentRevision)
        resetDraftFromProps()
        setDiagnostic(CONFLICT_DIAGNOSTIC)
        toast.error(CONFLICT_DIAGNOSTIC.whatHappened, {
          description: CONFLICT_DIAGNOSTIC.nextStep,
        })
      }
    } catch (cause) {
      void cause
      setDiagnostic(NETWORK_DIAGNOSTIC)
      toast.error(NETWORK_DIAGNOSTIC.whatHappened, {
        description: NETWORK_DIAGNOSTIC.nextStep,
      })
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="grid min-h-[26rem] gap-4 rounded-xl border bg-card p-5 shadow-xs">
      <div>
        <h4 className="text-sm font-medium text-foreground">Payout Schedule & Threshold</h4>
        <p className="text-xs text-muted-foreground">
          Choose how often accumulated AUD earnings leave your provider balance, and the minimum that
          must accumulate first.
        </p>
      </div>

      <form onSubmit={(e) => void handleSubmit(e)} className="grid gap-4">
        <FieldGroup className="grid gap-3">
          <Field>
            <FieldLabel className="text-xs">Payout frequency</FieldLabel>
            <RadioGroup
              value={schedule}
              onValueChange={(val) => {
                setSchedule(val as PayoutScheduleType)
                clearDiagnostic()
              }}
              className="grid gap-2 pt-1"
              disabled={pending}
            >
              {SCHEDULE_OPTIONS.map((option) => (
                <Label key={option.value} htmlFor={option.id} className={RADIO_CARD_CLASS}>
                  <RadioGroupItem value={option.value} id={option.id} />
                  <div className="grid gap-0.5">
                    <span className="text-xs font-medium">{option.title}</span>
                    <span className="text-[11px] text-muted-foreground">{option.subtitle}</span>
                  </div>
                </Label>
              ))}
            </RadioGroup>
          </Field>

          <div className="min-h-[2.75rem] flex items-center">
            <div
              role="status"
              aria-live="polite"
              className="font-mono text-sm tabular-nums text-muted-foreground"
            >
              {buildNextPayoutStatement(schedule)}
            </div>
          </div>

          <Field>
            <FieldLabel htmlFor="payout-threshold" className="text-xs">
              Minimum payout threshold (A$)
            </FieldLabel>
            <div className="flex flex-wrap gap-2 pb-2">
              {PAYOUT_THRESHOLD_PRESETS.map((preset) => {
                const selected = thresholdDollars === preset.dollars
                return (
                  <button
                    key={preset.id}
                    type="button"
                    aria-pressed={selected}
                    disabled={pending}
                    onClick={() => {
                      setThresholdDollars(preset.dollars)
                      clearDiagnostic()
                    }}
                    className={cn(
                      'rounded-full border border-border bg-container px-3 py-1.5 text-xs font-medium font-mono tabular-nums',
                      TACTILE,
                      selected && 'border-foreground bg-muted',
                    )}
                  >
                    {preset.label}
                  </button>
                )
              })}
            </div>
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
                  clearDiagnostic()
                }}
                className="pl-8 text-sm font-mono tabular-nums"
              />
            </div>
            <p className="font-mono text-xs tabular-nums text-muted-foreground">
              {buildThresholdSummary(thresholdDollars)}
            </p>
            <FieldDescription className="text-[11px]">
              Minimum A$10.00. Earnings below this amount stay in your provider balance.
            </FieldDescription>
          </Field>
        </FieldGroup>

        <p className="text-xs text-muted-foreground">{BECS_REASSURANCE}</p>

        <div className="min-h-[3rem]" aria-live="polite">
          {diagnostic ? (
            <Alert variant="destructive">
              <AlertCircleIcon className="size-4" />
              <AlertTitle>{diagnostic.whatHappened}</AlertTitle>
              <AlertDescription className="grid gap-0.5">
                <span>{diagnostic.financialImpact}</span>
                <span>{diagnostic.nextStep}</span>
              </AlertDescription>
            </Alert>
          ) : null}
        </div>

        <div className="flex justify-end">
          <Button
            type="submit"
            size="sm"
            disabled={pending}
            className={cn('min-h-touch', TACTILE)}
          >
            {pending ? 'Saving preferences...' : 'Save Payout Preferences'}
          </Button>
        </div>
      </form>
    </div>
  )
}
