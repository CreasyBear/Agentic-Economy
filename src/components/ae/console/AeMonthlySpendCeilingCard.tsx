'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

import { SettingsGroup, SettingsRow } from '@/components/ae/settings/settings-shell/components/SettingsSections'
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
import { Switch } from '@/components/ui/switch'
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
  utilizationPercent,
  type MonthlySpendCeilingDiagnostic,
  type MonthlySpendCeilingPresetId,
} from './monthly-spend-ceiling-copy'

const PRIMARY_BUTTON_PRESS_CLASS =
  'min-h-touch enabled:active:scale-[0.98] transition-transform duration-100 ease-out motion-reduce:transition-none motion-reduce:active:scale-100'

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
  const [ceilingInvalid, setCeilingInvalid] = useState(false)
  const ceilingInputRef = useRef<HTMLInputElement>(null)

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
    setCeilingInvalid(false)
  }

  function clearDiagnostic() {
    setDiagnostic(null)
    setCeilingInvalid(false)
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
        setCeilingInvalid(true)
        toast.error(diag.whatHappened, { description: diag.nextStep })
        ceilingInputRef.current?.focus()
        return
      }
    } else {
      nextUnits = nextUnits ?? BigInt(resolvedSettings.ceilingUnits || '0')
    }

    setDiagnostic(null)
    setCeilingInvalid(false)
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
    <>
      <SettingsGroup title="Monthly spending cap" description="Limit paid Calls across your workspace; Agent spending policies still apply.">
        <SettingsRow label="Current limit" description="Workspace-wide limit for paid Calls.">
          <div className="flex min-w-0 flex-wrap items-center gap-3 sm:justify-end">
            <span role="status" aria-live="polite" className="font-mono text-sm tabular-nums">{resolvedSettings.enabled ? `${spendFormatted} spent of ${ceilingFormatted} monthly cap (${percent}%)` : 'Off — prepaid credit and Agent policies still apply.'}</span>
            <Button type="button" variant="secondary" onClick={() => { resetDialogForm(); setDialogOpen(true) }}>
              {resolvedSettings.enabled ? 'Edit limit' : 'Set limit'}
            </Button>
          </div>
        </SettingsRow>
        {resolvedSettings.enabled && <SettingsRow label="Monthly usage" description="Resets at the start of the next month.">
          <div className="grid min-w-0 gap-2 sm:w-48">
            <Progress value={percent} className={PROGRESS_BAND_CLASS[band]} aria-label={`${percent}% of monthly spending cap used`} />
            {renderCardAlertSlot()}
          </div>
        </SettingsRow>}
      </SettingsGroup>

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
              {MONTHLY_SPEND_CEILING_PRESETS.map((preset) => <Button key={preset.id} type="button" variant={selectedPresetId === preset.id ? 'secondary' : 'outline'} size="sm" aria-pressed={selectedPresetId === preset.id} onClick={() => applyPreset(preset.id)}>{preset.label}</Button>)}
            </div>
          </fieldset>
          <div className="flex items-center justify-between gap-4">
            <Label htmlFor="monthly-spend-switch">Monthly spending cap</Label>
            <Switch id="monthly-spend-switch" checked={enabled} onCheckedChange={(checked) => { setEnabled(checked); clearDiagnostic() }} aria-label="Monthly spending cap" />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="monthly-spend-ceiling-cap">Monthly cap (AUD)</Label>
            <Input
              ref={ceilingInputRef}
              id="monthly-spend-ceiling-cap"
              inputMode="decimal"
              value={ceilingText}
              aria-invalid={ceilingInvalid || undefined}
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
              variant="secondary"
              disabled={saving}
              className={PRIMARY_BUTTON_PRESS_CLASS}
              onClick={() => { void handleSave() }}
            >
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
