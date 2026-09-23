'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from '@/lib/ui/toast'
import { canonicalAudUnits } from '@/modules/money/public'
import {
  AUTO_RECHARGE_PRESETS,
  buildTriggerStatement,
  mapAutoRechargeDiagnostic,
  matchingAutoRechargePresetId,
  type AutoRechargeDiagnostic,
  type AutoRechargePresetId,
} from './auto-recharge-copy'
import { audInputTextFromUnits } from './credit-top-up-format'

const MIN_RECHARGE_UNITS = 5_000_000n
const MAX_RECHARGE_UNITS = 25_000_000_000n

const PRESET_CHIP_CLASS =
  'inline-flex min-h-touch items-center rounded-full border border-border bg-container px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted/60 enabled:active:scale-[0.98] transition-transform duration-100 ease-out motion-reduce:transition-none motion-reduce:active:scale-100'

const SWITCH_PRESS_CLASS =
  'enabled:active:scale-[0.98] transition-transform duration-100 ease-out motion-reduce:transition-none motion-reduce:active:scale-100'

export type AeAutoRechargeCardProps = Readonly<{
  settings: Readonly<{
    enabled: boolean
    thresholdUnits: string
    rechargeAmountUnits: string
    revision: number
  }>
  mandateState: 'missing' | 'ready' | 'authentication_required' | 'failed'
  pendingTopup?: Readonly<{ commandRef: string }> | null
  onSave: (payload: Readonly<{
    enabled: boolean
    thresholdUnits: string
    rechargeAmountUnits: string
    expectedRevision: number
  }>) => void | Promise<void>
}>

export function AeAutoRechargeCard({
  settings,
  mandateState,
  pendingTopup,
  onSave,
}: AeAutoRechargeCardProps) {
  const [enabled, setEnabled] = useState(settings.enabled)
  const [thresholdText, setThresholdText] = useState(
    () => audInputTextFromUnits(BigInt(settings.thresholdUnits)),
  )
  const [rechargeText, setRechargeText] = useState(
    () => audInputTextFromUnits(BigInt(settings.rechargeAmountUnits)),
  )
  const [saving, setSaving] = useState(false)
  const [diagnostic, setDiagnostic] = useState<AutoRechargeDiagnostic | null>(null)
  const [thresholdInvalid, setThresholdInvalid] = useState(false)
  const [rechargeInvalid, setRechargeInvalid] = useState(false)
  const thresholdInputRef = useRef<HTMLInputElement>(null)
  const rechargeInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setEnabled(settings.enabled)
    setThresholdText(audInputTextFromUnits(BigInt(settings.thresholdUnits)))
    setRechargeText(audInputTextFromUnits(BigInt(settings.rechargeAmountUnits)))
  }, [settings.enabled, settings.thresholdUnits, settings.rechargeAmountUnits])

  const mandateBlocksEnable = mandateState === 'missing' || mandateState === 'failed'
  const switchDisabled =
    mandateState === 'missing'
    || mandateState === 'failed'
    || mandateState === 'authentication_required'

  const selectedPresetId = useMemo(
    () => matchingAutoRechargePresetId(thresholdText, rechargeText),
    [thresholdText, rechargeText],
  )

  const triggerStatement = useMemo(
    () => buildTriggerStatement(enabled, thresholdText, rechargeText),
    [enabled, thresholdText, rechargeText],
  )

  function applyPreset(presetId: AutoRechargePresetId) {
    const preset = AUTO_RECHARGE_PRESETS.find((item) => item.id === presetId)
    if (preset === undefined) return
    setThresholdText(audInputTextFromUnits(BigInt(preset.thresholdUnits)))
    setRechargeText(audInputTextFromUnits(BigInt(preset.rechargeUnits)))
    setDiagnostic(null)
    setThresholdInvalid(false)
    setRechargeInvalid(false)
  }

  function clearDiagnostic() {
    setDiagnostic(null)
    setThresholdInvalid(false)
    setRechargeInvalid(false)
  }

  async function handleSave() {
    const thresholdUnits = canonicalAudUnits(thresholdText)
    const rechargeAmountUnits = canonicalAudUnits(rechargeText)

    if (thresholdUnits === undefined || rechargeAmountUnits === undefined) {
      const nextThresholdInvalid = thresholdUnits === undefined
      const nextRechargeInvalid = rechargeAmountUnits === undefined
      setThresholdInvalid(nextThresholdInvalid)
      setRechargeInvalid(nextRechargeInvalid)
      setDiagnostic(mapAutoRechargeDiagnostic('invalid_amount'))
      setSaving(false)
      const focusTarget = nextThresholdInvalid ? thresholdInputRef.current : rechargeInputRef.current
      focusTarget?.focus()
      return
    }
    if (thresholdUnits < 0n) {
      setThresholdInvalid(true)
      setRechargeInvalid(false)
      setDiagnostic(mapAutoRechargeDiagnostic('auto_recharge_units_invalid'))
      setSaving(false)
      thresholdInputRef.current?.focus()
      return
    }
    if (rechargeAmountUnits < MIN_RECHARGE_UNITS || rechargeAmountUnits > MAX_RECHARGE_UNITS) {
      setThresholdInvalid(false)
      setRechargeInvalid(true)
      setDiagnostic(mapAutoRechargeDiagnostic('funding_amount_invalid'))
      setSaving(false)
      rechargeInputRef.current?.focus()
      return
    }

    setDiagnostic(null)
    setThresholdInvalid(false)
    setRechargeInvalid(false)
    setSaving(true)
    try {
      await onSave({
        enabled,
        thresholdUnits: thresholdUnits.toString(),
        rechargeAmountUnits: rechargeAmountUnits.toString(),
        expectedRevision: settings.revision,
      })
      const description = buildTriggerStatement(enabled, thresholdText, rechargeText)
      toast.success(enabled ? 'Auto-recharge on' : 'Auto-recharge off', { description })
    } catch (error: unknown) {
      const nextDiagnostic = mapAutoRechargeDiagnostic(error)
      setDiagnostic(nextDiagnostic)
      toast.error(nextDiagnostic.whatHappened, { description: nextDiagnostic.nextStep })
    } finally {
      setSaving(false)
    }
  }

  function renderStatusSlot() {
    if (diagnostic !== null) {
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
    if (pendingTopup) {
      return (
        <Alert>
          <div className="flex items-start gap-2">
            <span
              className="mt-1.5 size-2 shrink-0 rounded-full bg-primary animate-pulse motion-reduce:animate-none"
              aria-hidden
            />
            <div className="grid gap-1">
              <AlertTitle className="text-sm">Top-up in progress</AlertTitle>
              <AlertDescription className="text-xs">
                Auto-recharge is waiting for the current top-up to finish. A$0.00 will be charged for a duplicate top-up until it completes.
              </AlertDescription>
            </div>
          </div>
        </Alert>
      )
    }
    if (mandateState === 'missing') {
      return (
        <Alert>
          <AlertDescription>
            <a href="/owner/credit" className="font-medium underline">
              Add payment method
            </a>
            {' '}in Payment methods above before enabling auto-recharge.
          </AlertDescription>
        </Alert>
      )
    }
    if (mandateState === 'failed') {
      return (
        <Alert variant="destructive">
          <AlertTitle className="text-sm">Saved card unavailable</AlertTitle>
          <AlertDescription className="text-xs">
            The default card could not be used for off-session top-ups. Update or replace it in Payment methods, then try again.
          </AlertDescription>
        </Alert>
      )
    }
    if (mandateState === 'authentication_required') {
      return (
        <Alert>
          <AlertTitle className="text-sm">Bank authentication required</AlertTitle>
          <AlertDescription className="text-xs">
            Your bank needs another check before auto-recharge can charge the saved card. Finish authentication via Payment methods, then enable auto-recharge.
          </AlertDescription>
        </Alert>
      )
    }
    return null
  }

  return (
    <div className="grid gap-3 border-t border-border pt-4">
      <div>
        <h3 className="text-sm font-medium">Auto-recharge</h3>
        <p className="text-sm text-muted-foreground">
          When balance falls below the threshold, automatically add credit using the default payment method.
        </p>
      </div>

      <p
        className="min-h-[2.75rem] font-mono text-sm tabular-nums text-muted-foreground"
        role="status"
        aria-live="polite"
      >
        {triggerStatement}
      </p>

      <fieldset className="grid gap-2" disabled={mandateBlocksEnable}>
        <legend className="text-sm font-medium">Quick setup</legend>
        <div className="flex flex-wrap gap-2">
          {AUTO_RECHARGE_PRESETS.map((preset) => {
            const selected = selectedPresetId === preset.id
            return (
              <button
                key={preset.id}
                type="button"
                aria-pressed={selected}
                disabled={mandateBlocksEnable}
                onClick={() => applyPreset(preset.id)}
                className={`${PRESET_CHIP_CLASS}${selected ? ' border-foreground bg-muted' : ''}`}
              >
                {preset.label}
              </button>
            )
          })}
        </div>
      </fieldset>

      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        aria-label="Auto-recharge"
        disabled={switchDisabled}
        className={`flex min-h-touch w-full items-center justify-between gap-4 rounded-md text-left disabled:cursor-not-allowed disabled:opacity-50 ${SWITCH_PRESS_CLASS}`}
        data-state={enabled ? 'on' : 'off'}
        onClick={() => {
          if (switchDisabled) return
          setEnabled((current) => !current)
          clearDiagnostic()
        }}
      >
        <span className="text-sm">Auto-recharge</span>
        <span
          className="relative inline-flex h-6 w-11 shrink-0 rounded-full border border-input bg-muted transition-colors data-[state=on]:bg-primary"
          data-state={enabled ? 'on' : 'off'}
          aria-hidden="true"
        >
          <span
            className="pointer-events-none block size-5 translate-x-0.5 rounded-full border border-border bg-background shadow-none transition-transform data-[state=on]:translate-x-[1.375rem]"
            data-state={enabled ? 'on' : 'off'}
          />
        </span>
      </button>

      <div className="grid gap-2">
        <Label htmlFor="auto-recharge-threshold">Low balance threshold (AUD)</Label>
        <Input
          ref={thresholdInputRef}
          id="auto-recharge-threshold"
          inputMode="decimal"
          value={thresholdText}
          aria-invalid={thresholdInvalid || undefined}
          onChange={(event) => {
            setThresholdText(event.target.value)
            clearDiagnostic()
          }}
          className="font-mono tabular-nums"
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="auto-recharge-amount">Recharge amount (AUD)</Label>
        <Input
          ref={rechargeInputRef}
          id="auto-recharge-amount"
          inputMode="decimal"
          value={rechargeText}
          aria-invalid={rechargeInvalid || undefined}
          onChange={(event) => {
            setRechargeText(event.target.value)
            clearDiagnostic()
          }}
          className="font-mono tabular-nums"
        />
        <p className="text-xs text-muted-foreground">
          Add A$5.00 to A$25,000.00 in A$0.01 increments.
        </p>
        <div className="min-h-[1.25rem]" aria-live="polite" />
      </div>

      <div className="min-h-[5.5rem]">{renderStatusSlot()}</div>

      <Button type="button" variant="secondary" disabled={saving} onClick={() => { void handleSave() }}>
        {saving ? 'Saving…' : 'Save'}
      </Button>
    </div>
  )
}
