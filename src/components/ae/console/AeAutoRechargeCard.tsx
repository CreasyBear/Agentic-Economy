'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { SettingsGroup, SettingsRow } from '@/components/ae/settings/settings-shell/components/SettingsSections'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from '@/lib/ui/toast'
import { Switch } from '@/components/ui/switch'
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
    const pendingFunding = pendingTopup ? (
      <Alert>
        <AlertTitle className="flex items-center gap-2 text-sm">
          <span className="size-2 shrink-0 rounded-full bg-primary animate-pulse motion-reduce:animate-none" aria-hidden />
          Credit top-up in progress
        </AlertTitle>
        <AlertDescription className="text-xs">
          A funding command is still open. <a href="/owner/credit" className="font-medium underline">Recover it on Credit</a>. This is not auto-recharge, and saving these defaults will not start another charge.
        </AlertDescription>
      </Alert>
    ) : null
    const mandateAlert = mandateState === 'missing' ? (
      <Alert>
        <AlertDescription>
          <a href="/owner/settings/payment-methods" className="font-medium underline">Add a payment method</a>
          {' '}before enabling auto-recharge.
        </AlertDescription>
      </Alert>
    ) : mandateState === 'failed' ? (
      <Alert variant="destructive">
        <AlertTitle className="text-sm">Saved card unavailable</AlertTitle>
        <AlertDescription className="text-xs">
          The default card could not be used for off-session top-ups. <a href="/owner/settings/payment-methods" className="underline">Update or replace it</a>, then try again.
        </AlertDescription>
      </Alert>
    ) : mandateState === 'authentication_required' ? (
      <Alert>
        <AlertTitle className="text-sm">Bank authentication required</AlertTitle>
        <AlertDescription className="text-xs">
          Your bank needs another check. <a href="/owner/settings/payment-methods" className="underline">Authenticate the saved card</a>, then enable auto-recharge.
        </AlertDescription>
      </Alert>
    ) : null
    return <>{pendingFunding}{mandateAlert}</>
  }

  return <SettingsGroup title="Auto-recharge" description="Automatically add credit using your default card when your balance falls below a threshold.">
    <SettingsRow label="Status" description="Enable automatic top-ups for this workspace.">
      <div className="flex flex-wrap items-center gap-3 sm:justify-end">
        <span role="status" aria-live="polite" className="max-w-xs text-muted-foreground">{triggerStatement}</span>
        <Switch checked={enabled} onCheckedChange={(checked) => { setEnabled(checked); clearDiagnostic() }} disabled={switchDisabled} aria-label="Auto-recharge" />
      </div>
    </SettingsRow>
    <SettingsRow label="Quick setup" description="Choose a preset or enter your own amounts.">
      <div className="flex flex-wrap gap-2 sm:justify-end">
        {AUTO_RECHARGE_PRESETS.map((preset) => <Button key={preset.id} type="button" variant={selectedPresetId === preset.id ? 'secondary' : 'outline'} size="sm" aria-pressed={selectedPresetId === preset.id} disabled={mandateBlocksEnable} onClick={() => applyPreset(preset.id)}>{preset.label}</Button>)}
      </div>
    </SettingsRow>
    <SettingsRow label="Low balance threshold" description="Start a recharge when available credit falls below this amount (AUD).">
      <Input ref={thresholdInputRef} id="auto-recharge-threshold" aria-label="Low balance threshold (AUD)" inputMode="decimal" value={thresholdText} aria-invalid={thresholdInvalid || undefined} onChange={(event) => { setThresholdText(event.target.value); clearDiagnostic() }} className="w-full font-mono tabular-nums sm:w-48" />
    </SettingsRow>
    <SettingsRow label="Recharge amount" description="Add A$5.00 to A$25,000.00 in A$0.01 increments.">
      <Input ref={rechargeInputRef} id="auto-recharge-amount" aria-label="Recharge amount (AUD)" inputMode="decimal" value={rechargeText} aria-invalid={rechargeInvalid || undefined} onChange={(event) => { setRechargeText(event.target.value); clearDiagnostic() }} className="w-full font-mono tabular-nums sm:w-48" />
    </SettingsRow>
    <SettingsRow label="Save auto-recharge" description="Changes only take effect after saving.">
      <div className="grid gap-3 sm:justify-items-end">
        {renderStatusSlot()}
        <Button type="button" disabled={saving} onClick={() => { void handleSave() }}>{saving ? 'Saving…' : 'Save changes'}</Button>
      </div>
    </SettingsRow>
  </SettingsGroup>
}
