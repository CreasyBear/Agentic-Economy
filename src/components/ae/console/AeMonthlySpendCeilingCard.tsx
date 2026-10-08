/* Arc usage-billing spend/meter composition with the existing revision-checked cap editor.
 * Requires authoritative settings and spend; ensures exact formatted amounts and unchanged save payload.
 * Missing spend withholds utilization instead of claiming zero; funding never grants authority. */
'use client'

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

import { SettingsGroup } from '@/components/ae/settings/settings-shell/components/SettingsSections'
import { UsageBillingMeter } from '@/components/ae/shared/arc-pro/usage-billing/usage-billing'
import { AeAlert } from '@/components/ae/shared/alert/AeAlert'
import { Button } from '@/components/arc/button/button'
import { Drawer, DrawerContent } from '@/components/ae/shared/base-ui/drawer/drawer'
import './MonthlySpendComposition.css'
import { Switch } from '@/components/ui/switch'
import { useWorkspacePresentationLifetime } from '@/lib/client/workspace-presentation'
import { toast } from '@/lib/ui/toast'
import { AUD_EXPONENT, canonicalAudUnits, formatDisplayAmount } from '@/modules/money/public'
import { audInputTextFromUnits } from './credit-top-up-format'
import { monthlySpendCeilingSavedNotice } from './monthly-spend-ceiling-notice'
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

function MonthlySpendCapView({ enabled, spend, ceiling, percent, tone, notice, onEdit }: {
  enabled: boolean | undefined
  spend: string | undefined
  ceiling: string
  percent: number
  tone: 'ok' | 'warning' | 'critical'
  notice: ReactNode
  onEdit: () => void
}) {
  const summary = enabled === undefined ? <span>Monthly spending cap unavailable.</span>
    : !enabled ? <span>Off. Prepaid credit and Agent policies still apply.</span>
      : <><strong>{spend ?? ceiling}</strong><span>{spend === undefined ? 'Monthly cap; monthly spend is unavailable.' : `spent of ${ceiling} monthly cap (${percent}%)`}</span></>
  return <SettingsGroup title="Monthly spending cap" description="Limit paid Calls across your workspace; Agent spending policies still apply.">
    <UsageBillingMeter
      summary={<><p className="arc-monthly-label">Current limit</p><p role="status" aria-live="polite" className="arc-monthly-value">{summary}</p></>}
      action={enabled === undefined ? null : <Button type="button" variant="secondary" onClick={onEdit}>{enabled ? 'Edit limit' : 'Set limit'}</Button>}
      meter={enabled ? {
        name: 'Monthly usage',
        percent: spend === undefined ? undefined : percent,
        valueText: spend === undefined ? 'Monthly spend is unavailable.' : `${spend} spent of ${ceiling} monthly cap (${percent}%)`,
        tone,
        note: 'Resets at the start of the next month.',
        notice,
      } : undefined}
    />
  </SettingsGroup>
}

export function AeMonthlySpendCeilingCard({
  settings,
  monthSpend,
  onSave,
}: AeMonthlySpendCeilingCardProps) {
  const capturePresentation = useWorkspacePresentationLifetime()
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
  const spendKnown = monthSpend?.kind === 'empty' || (monthSpend?.kind === 'available' && monthSpend.spendUnits !== undefined)
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
    if (!spendKnown) {
      return (
        <AeAlert tone="info" title="Monthly spend data is unavailable." role="alert" />
      )
    }
    if (resolvedSettings.enabled && percent >= 90 && percent < 100) {
      return (
        <AeAlert role="alert" tone="warning" title={`Approaching monthly limit (${percent}%)`} />
      )
    }
    if (resolvedSettings.enabled && percent >= 100) {
      return (
        <AeAlert tone="danger" title="Monthly spending limit reached">
            Paid Calls are paused until next month or the cap is raised.
          </AeAlert>
      )
    }
    return null
  }

  function renderDialogDiagnosticSlot() {
    if (diagnostic === null) return null
    return (
      <AeAlert tone="danger" title={diagnostic.whatHappened}><div className="grid gap-1 text-xs">
          <span>{diagnostic.financialImpact}</span>
          <span>{diagnostic.nextStep}</span>
        </div></AeAlert>
    )
  }

  async function handleSave() {
    if (settings === undefined) return
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
    const canPresent = capturePresentation()
    try {
      await onSave({
        enabled,
        ceilingUnits: nextUnits.toString(),
        expectedRevision: resolvedSettings.revision,
      })
      if (!canPresent()) return
      toast.success(monthlySpendCeilingSavedNotice(
        enabled,
        resolvedSettings.enabled,
        formatDisplayAmount({ currency: 'AUD', exponent: AUD_EXPONENT, units: nextUnits.toString() }),
      ))
      setDialogOpen(false)
    } catch (error: unknown) {
      if (!canPresent()) return
      const diag = mapMonthlySpendCeilingDiagnostic(error)
      setDiagnostic(diag)
      toast.error(diag.whatHappened, { description: diag.nextStep })
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <MonthlySpendCapView enabled={settings?.enabled} spend={spendKnown ? spendFormatted : undefined}
        ceiling={ceilingFormatted} percent={percent} tone={band === 'normal' ? 'ok' : band === 'exceeded' ? 'critical' : 'warning'}
        notice={renderCardAlertSlot()} onEdit={() => { resetDialogForm(); setDialogOpen(true) }} />

      <Drawer
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open)
          if (open) {
            resetDialogForm()
          }
        }}
      >
        <DrawerContent title="Organization monthly spending cap" description="Set a workspace-wide monthly limit for paid Calls. Agent spending policies still apply." side="right">
          <div className="arc-monthly-editor">
          <fieldset className="grid gap-2">
            <legend className="text-sm font-medium">Quick setup</legend>
            <div className="flex flex-wrap gap-2">
              {MONTHLY_SPEND_CEILING_PRESETS.map((preset) => <Button key={preset.id} type="button" variant="secondary" size="sm" aria-pressed={selectedPresetId === preset.id} onClick={() => applyPreset(preset.id)}>{preset.label}</Button>)}
            </div>
          </fieldset>
          <div className="flex items-center justify-between gap-4">
            <label htmlFor="monthly-spend-switch">Monthly spending cap</label>
            <Switch id="monthly-spend-switch" checked={enabled} onCheckedChange={(checked) => { setEnabled(checked); clearDiagnostic() }} aria-label="Monthly spending cap" />
          </div>

          <div className="grid gap-2">
            <label htmlFor="monthly-spend-ceiling-cap">Monthly cap (AUD)</label>
            <input
              ref={ceilingInputRef}
              id="monthly-spend-ceiling-cap"
              inputMode="decimal"
              value={ceilingText}
              aria-invalid={ceilingInvalid || undefined}
              onChange={(event) => {
                setCeilingText(event.target.value)
                clearDiagnostic()
              }}
              className="arc-monthly-input"
            />
          </div>

          <p className="min-h-[2.75rem] text-sm text-muted-foreground" role="status" aria-live="polite">
            {previewStatement}
          </p>

          <div className="min-h-[5.5rem]">{renderDialogDiagnosticSlot()}</div>

          <footer className="arc-monthly-footer">
            <Button
              type="button"
              variant="primary"
              disabled={saving || settings === undefined}
              onClick={() => { void handleSave() }}
            >
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </footer>
          </div>
        </DrawerContent>
      </Drawer>
    </>
  )
}
