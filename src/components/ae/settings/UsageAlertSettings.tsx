import { useState } from 'react'
import { Button } from '@/components/arc/button/button'
import { Input } from '@/components/arc/input/input'
import { SettingsGroup,SettingsRow } from './settings-shell/components/SettingsSections'
import type { NotificationPreferencePatch,UsageAlertPolicy } from '@/modules/principal-account/notification-preferences.view-model'
export function UsageAlertSettings({policy,disabled,onUpdate,revision}:{policy:UsageAlertPolicy|undefined;disabled:boolean;revision:number;onUpdate:(patch:NotificationPreferencePatch)=>Promise<void>}){
  const [failure,setFailure]=useState(String(policy?.failurePercent??20)),[minimum,setMinimum]=useState(String(policy?.minimumCalls??20)),[spend,setSpend]=useState(String(policy?.spendWarningPercent??80))
  const valid=(value:string,max:number)=>/^\d+$/u.test(value)&&Number(value)>=1&&Number(value)<=max
  const invalid=!valid(failure,100)||!valid(minimum,100000)||!valid(spend,100)
  return <SettingsGroup title="Usage alerts" description="Owner opt-in is required. Complete reports evaluate refused or uncertain Call outcomes; financial warnings use reconciled effective-date spending and native available credit. Alerts never change spending authority. Evaluation follows completed Calls and reports, using the existing worker and rate limits; it is not a continuous monitor.">
    <SettingsRow label="Call outcome threshold (%)" description="Refused plus uncertain outcomes, as a percentage of all Calls in a complete Account-month capture."><Input label="Call outcome threshold percent" aria-label="Call outcome threshold percent" inputMode="numeric" value={failure} disabled={disabled} onChange={event=>setFailure(event.target.value)} /></SettingsRow>
    <SettingsRow label="Minimum Calls" description="Do not evaluate the outcome percentage below this sample size."><Input label="Minimum Calls for alert" aria-label="Minimum Calls for alert" inputMode="numeric" value={minimum} disabled={disabled} onChange={event=>setMinimum(event.target.value)} /></SettingsRow>
    <SettingsRow label="Monthly ceiling warning (%)" description="Uses your actual enabled spending ceiling. Refunds and promotional credits remain separate."><Input label="Monthly ceiling warning percent" aria-label="Monthly ceiling warning percent" inputMode="numeric" value={spend} disabled={disabled} onChange={event=>setSpend(event.target.value)} /></SettingsRow>
    <p className="text-sm text-muted-foreground">Status: {policy?.enabled===true?'Enabled; ownership changes require consent renewal.':'Disabled.'} Low-credit alerts use the saved threshold. Ready-document alerts require an issued monthly statement.</p>
    <div className="flex flex-wrap gap-2"><Button type="button" variant="secondary" disabled={disabled||invalid} onClick={()=>void onUpdate({expectedRevision:revision,usageAlertPolicy:{enabled:true,failurePercent:Number(failure),minimumCalls:Number(minimum),spendWarningPercent:Number(spend)}})}>Save and enable usage alerts</Button>
      <Button type="button" variant="secondary" disabled={disabled||policy?.enabled!==true} onClick={()=>void onUpdate({expectedRevision:revision,usageAlertPolicy:{enabled:false,failurePercent:policy?.failurePercent??20,minimumCalls:policy?.minimumCalls??20,spendWarningPercent:policy?.spendWarningPercent??80}})}>Disable usage alerts</Button></div>
  </SettingsGroup>
}
