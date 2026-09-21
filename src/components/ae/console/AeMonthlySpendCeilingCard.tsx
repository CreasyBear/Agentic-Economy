'use client'

import { useEffect, useMemo, useState } from 'react'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { toast } from '@/lib/ui/toast'
import { AUD_EXPONENT, canonicalAudUnits, formatDisplayAmount } from '@/modules/money/public'
import { audInputTextFromUnits } from './credit-top-up-format'
import {
  MONTHLY_SPEND_CEILING_PRESETS,
  buildCeilingPreviewStatement,
  ceilingTextFromPresetId,
  mapMonthlySpendCeilingDiagnostic,
  matchingMonthlySpendCeilingPresetId,
  utilizationBand,
  type MonthlySpendCeilingDiagnostic,
  type MonthlySpendCeilingPresetId,
} from './monthly-spend-ceiling-copy'

const SWITCH_PRESS_CLASS =
  'enabled:active:scale-[0.98] transition-transform duration-100 ease-out motion-reduce:transition-none motion-reduce:active:scale-100'

const PRIMARY_BUTTON_PRESS_CLASS =
  'min-h-touch enabled:active:scale-[0.98] transition-transform duration-100 ease-out motion-reduce:transition-none motion-reduce:active:scale-100'

const PRESET_CHIP_CLASS =
  'inline-flex min-h-touch items-center rounded-full border border-border bg-container px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted/60 enabled:active:scale-[0.98] transition-transform duration-100 ease-out motion-reduce:transition-none motion-reduce:active:scale-100'

const PROGRESS_BAND_CLASS = {
  normal: '[&_[data-slot=progress-indicator]]:bg-success',
  warning: '[&_[data-slot=progress-indicator]]:bg-warning',
  critical: '[&_[data-slot=progress-indicator]]:bg-warning',
  exceeded: '[&_[data-slot=progress-indicator]]:bg-destructive',
} as const

export interface AeMonthlySpendCeilingCardProps {
  settings?: {
    enabled: boolean
    ceilingUnits: string
    revision: number
  }
  monthSpend?: {
    kind: 'available' | 'empty' | 'unavailable'
    spendUnits?: string
  }
  onSave: (data: {
    enabled: boolean
    ceilingUnits: string
    expectedRevision: number
  }) => Promise<void> | void
}

function utilizationPercent(spendUnits: bigint, ceilingUnits: bigint): number {
  if (ceilingUnits <= 0n) return spendUnits > 0n ? 100 : 0
  const basisPoints = (spendUnits * 10_000n) / ceilingUnits
  const wholePercent = Number(basisPoints / 100n)
  const fraction = Number(basisPoints % 100n)
  return fraction >= 50 ? Math.min(100, wholePercent + 1) : Math.min(100, wholePercent)
}

export function AeMonthlySpendCeilingCard({
  settings,
  monthSpend,
  onSave,
}: AeMonthlySpendCeilingCardProps) {
  const resolvedSettings = settings ?? { enabled: false, ceilingUnits: '0', revision: 0 }
  const [dialogOpen, setDialogOpen] = useState(false)
  const [enabled, setEnabled] = useState(resolvedSettings.enabled)
  const [ceilingText, setCeilingText] = useState(
    () => audInputTextFromUnits(BigInt(resolvedSettings.ceilingUnits)),
  )
  const [saving, setSaving] = useState(false)
  const [diagnostic, setDiagnostic] = useState<MonthlySpendCeilingDiagnostic | null>(null)

  useEffect(() => {
    setEnabled(resolvedSettings.enabled)
    setCeilingText(audInputTextFromUnits(BigInt(resolvedSettings.ceilingUnits)))
  }, [resolvedSettings.enabled, resolvedSettings.ceilingUnits])

  const spendUnits = useMemo(() => {
    if (monthSpend?.kind !== 'available' || monthSpend.spendUnits === undefined) return 0n
    return BigInt(monthSpend.spendUnits)
  }, [monthSpend])

  const ceilingUnits = BigInt(resolvedSettings.ceilingUnits)
  const percent = utilizationPercent(spendUnits, ceilingUnits)
  const band = utilizationBand(percent)

  const spendFormatted = formatDisplayAmount({
    currency: 'AUD',
    exponent: AUD_EXPONENT,
    units: spendUnits.toString(),
  })
  const ceilingFormatted = formatDisplayAmount({
    currency: 'AUD',
    exponent: AUD_EXPONENT,
    units: resolvedSettings.ceilingUnits,
  })

  const selectedPresetId = useMemo(
    () => matchingMonthlySpendCeilingPresetId(ceilingText),
    [ceilingText],
  )

  const previewStatement = useMemo(
    () => buildCeilingPreviewStatement(enabled, ceilingText),
    [enabled, ceilingText],
  )

  function resetDialogForm() {
    setEnabled(resolvedSettings.enabled)
    setCeilingText(audInputTextFromUnits(BigInt(resolvedSettings.ceilingUnits)))
    setDiagnostic(null)
  }

  function clearDiagnostic() {
    setDiagnostic(null)
  }

  function applyPreset(presetId: MonthlySpendCeilingPresetId) {
    setCeilingText(ceilingTextFromPresetId(presetId))
    clearDiagnostic()
  }

  function renderCardAlertSlot() {
    if (resolvedSettings.enabled && percent >= 90 && percent < 100) {
      return (
        <Alert className="border-warning-ring bg-warning-subtle text-warning-foreground">
          <AlertTitle>Approaching monthly limit ({percent}%)</AlertTitle>
        </Alert>
      )
    }
    if (resolvedSettings.enabled && percent >= 100) {
      return (
        <Alert variant="destructive">
          <AlertTitle>Monthly spending limit reached</AlertTitle>
          <AlertDescription>
            Paid Calls are paused until next month or the cap is raised.
          </AlertDescription>
        </Alert>
      )
    }
    if (monthSpend?.kind === 'unavailable') {
      return (
        <Alert>
          <AlertDescription>Monthly spend data is unavailable.</AlertDescription>
        </Alert>
      )
    }
    return null
  }

  function renderDialogDiagnosticSlot() {
    if (diagnostic === null) return null
    return (
      <Alert variant="destructive">
        <AlertTitle className="text-sm">{diagnostic.whatHappened}</AlertTitle>
        <AlertDescription className="grid gap-1 text-xs">
          <span>{diagnostic.financialImpact}</span>
          <span>{diagnostic.nextStep}</span>
        </AlertDescription>
      </Alert>
    )
  }

  async function handleSave() {
    let nextUnits = canonicalAudUnits(ceilingText)
    if (enabled) {
      if (nextUnits === undefined) {
        const diag = mapMonthlySpendCeilingDiagnostic('invalid_amount')
        setDiagnostic(diag)
        toast.error(diag.whatHappened, { description: diag.nextStep })
        return
      }
    } else {
      nextUnits = nextUnits ?? BigInt(resolvedSettings.ceilingUnits || '0')
    }

    setDiagnostic(null)
    setSaving(true)
    try {
      await onSave({
        enabled,
        ceilingUnits: nextUnits.toString(),
        expectedRevision: resolvedSettings.revision,
      })
      if (enabled) {
        toast.success(
          `Monthly spending cap updated: ${formatDisplayAmount({
            currency: 'AUD',
            exponent: AUD_EXPONENT,
            units: nextUnits.toString(),
          })}`,
        )
      } else {
        toast.success('Monthly spending cap disabled')
      }
      setDialogOpen(false)
    } catch (error: unknown) {
      const diag = mapMonthlySpendCeilingDiagnostic(error)
      setDiagnostic(diag)
      toast.error(diag.whatHappened, { description: diag.nextStep })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="grid gap-3 border-t border-border pt-4">
      <div>
        <h3 className="font-medium">Organization monthly spending cap</h3>
      </div>

      <div className="min-h-[2.75rem]">
        {resolvedSettings.enabled ? (
          <p className="font-mono text-sm tabular-nums" role="status" aria-live="polite">
            {spendFormatted} spent of {ceilingFormatted} monthly cap ({percent}%)
          </p>
        ) : (
          <p className="text-sm text-muted-foreground" role="status">
            Monthly spending cap is disabled. Calls are bounded only by prepaid credit and agent spending policies — no surprise overage charges.
          </p>
        )}
      </div>

      <Progress
        value={resolvedSettings.enabled ? percent : 0}
        className={PROGRESS_BAND_CLASS[resolvedSettings.enabled ? band : 'normal']}
      />

      <div className="min-h-[5.5rem]">{renderCardAlertSlot()}</div>

      <div>
        <Button
          type="button"
          variant="secondary"
          className={PRIMARY_BUTTON_PRESS_CLASS}
          onClick={() => {
            resetDialogForm()
            setDialogOpen(true)
          }}
        >
          {resolvedSettings.enabled ? 'Edit Limit' : 'Set Limit'}
        </Button>
      </div>

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open)
          if (open) {
            resetDialogForm()
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Organization monthly spending cap</DialogTitle>
            <DialogDescription>
              Set a workspace-wide monthly limit for paid Calls. Agent spending policies still apply.
            </DialogDescription>
          </DialogHeader>

          <fieldset className="grid gap-2">
            <legend className="text-sm font-medium">Quick setup</legend>
            <div className="flex flex-wrap gap-2">
              {MONTHLY_SPEND_CEILING_PRESETS.map((preset) => {
                const selected = selectedPresetId === preset.id
                return (
                  <button
                    key={preset.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => applyPreset(preset.id)}
                    className={`${PRESET_CHIP_CLASS}${selected ? ' border-foreground bg-muted' : ''}`}
                  >
                    {preset.label}
                  </button>
                )
              })}
            </div>
          </fieldset>

          <div className="flex items-center justify-between gap-4">
            <span className="text-sm">Monthly spending cap</span>
            <button
              type="button"
              role="switch"
              aria-checked={enabled}
              aria-label="Monthly spending cap"
              className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border border-input bg-muted transition-colors data-[state=on]:bg-primary ${SWITCH_PRESS_CLASS}`}
              data-state={enabled ? 'on' : 'off'}
              onClick={() => {
                setEnabled((current) => !current)
                clearDiagnostic()
              }}
            >
              <span
                className="pointer-events-none block size-5 translate-x-0.5 rounded-full border border-border bg-background shadow-none transition-transform data-[state=on]:translate-x-[1.375rem]"
                data-state={enabled ? 'on' : 'off'}
              />
            </button>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="monthly-spend-ceiling-cap">Monthly cap (AUD)</Label>
            <Input
              id="monthly-spend-ceiling-cap"
              inputMode="decimal"
              value={ceilingText}
              onChange={(event) => {
                setCeilingText(event.target.value)
                clearDiagnostic()
              }}
              className="font-mono tabular-nums"
            />
          </div>

          <p className="min-h-[2.75rem] text-sm text-muted-foreground" role="status" aria-live="polite">
            {previewStatement}
          </p>

          <div className="min-h-[5.5rem]">{renderDialogDiagnosticSlot()}</div>

          <DialogFooter>
            <Button
              type="button"
              disabled={saving}
              className={PRIMARY_BUTTON_PRESS_CLASS}
              onClick={() => { void handleSave() }}
            >
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
