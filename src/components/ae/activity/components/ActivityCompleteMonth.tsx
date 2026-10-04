import { useEffect,useRef,useState } from 'react'
import { useRouter,Link } from '@tanstack/react-router'
import { BillingHistory } from '@/components/arc/blocks/billing-overview/billing-overview'
import { Button } from '@/components/arc/button/button'
import { Input } from '@/components/arc/input/input'
import { AeFactList } from '@/components/ae/data/AeFactList'
import { formatUtcTimestamp } from '@/lib/ui/format-time'
import { formatExactAmount } from '@/modules/money/public'
import { monthlyDraftIntentSchema } from '@/modules/capability-execution/monthly-usage-draft'
import { activityReturnSearch,type ActivityReturnScope } from '@/lib/call-recovery/activity-return-scope'
import { downloadCsv,downloadJson } from '@/lib/export/csv-export'
import { assembleMonthlyClose,generateMonthlyFinancialCsv,readMonthlyCloseSnapshot,type MonthlyUsageClose } from '@/lib/export/monthly-usage-close'
import { requestCompleteMonthlyUsageServer,readCompleteMonthlyUsageServer,readMonthlyRelatedDocumentsServer,readMonthlyFinancialPartsServer,readUsageReportingPolicyServer,configureUsageReportingServer } from '@/lib/server/complete-monthly-usage.functions'
import { readOwnerUsageReportPartsServer } from '@/lib/server/durable-usage-report.functions'
function priorMonth(){const now=new Date();return new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth()-1,1)).toISOString().slice(0,7)}
export function ActivityCompleteMonth({returnScope,draftRef}:{returnScope:ActivityReturnScope;draftRef?:string}){
  const router=useRouter(),generation=useRef(0),inFlight=useRef(false),policyInFlight=useRef(false)
  const [month,setMonth]=useState(priorMonth),[close,setClose]=useState<MonthlyUsageClose|null>(null),[message,setMessage]=useState(''),[pending,setPending]=useState(false)
  const [policy,setPolicy]=useState<Awaited<ReturnType<typeof readUsageReportingPolicyServer>>|null>(null),[policyPending,setPolicyPending]=useState(false),[policyMessage,setPolicyMessage]=useState('')
  const snapshot=close?.state==='complete'?readMonthlyCloseSnapshot(close):null
  useEffect(()=>{const ref=generation;return()=>{ref.current++}},[])
  useEffect(()=>{let active=true;void readUsageReportingPolicyServer().then(result=>{if(active)setPolicy(result)}).catch(()=>{if(active)setPolicyMessage('Monthly reporting preferences are unavailable.')});return()=>{active=false}},[])
  async function read(ref:string){
    if(inFlight.current)return
    inFlight.current=true;setPending(true);const current=++generation.current
    try{const result=await readCompleteMonthlyUsageServer({data:{draftRef:ref}})
      if(current!==generation.current)return
      if(result.kind!=='available'){setMessage('This monthly close is unavailable for the account.');return}
      setClose(result.close);setMonth(result.close.month);setMessage('')
    }catch{if(current===generation.current)setMessage('Monthly close status could not be read. Retry the same record.')}
    finally{inFlight.current=false;setPending(false)}
  }
  useEffect(()=>{if(draftRef?.startsWith('monthly-usage-close:'))void read(draftRef)},[draftRef])
  async function prepare(revision:number){
    if(inFlight.current||!monthlyDraftIntentSchema.safeParse({month,revision}).success)return
    inFlight.current=true;setPending(true);const current=++generation.current;setMessage('Preparing the complete monthly statement…')
    try{const result=await requestCompleteMonthlyUsageServer({data:{month,revision}})
      if(current!==generation.current)return
      if(result.kind!=='available'){setMessage(result.kind==='setup_required'?'The financial source must be configured before this month can be closed.':'The close requires a closed month, current owner access and its preceding revision.');return}
      setClose(result.close);setMessage(result.close.state==='building'?'The close is saved and preparing. Refresh its status when ready.':'')
      await router.navigate({to:'/activity',search:{...activityReturnSearch(returnScope),draftRef:result.close.draftRef},replace:true})
    }catch{if(current===generation.current)setMessage('The monthly close could not be requested. Retry the same month and revision.')}
    finally{inFlight.current=false;setPending(false)}
  }
  async function download(format:'JSON'|'CSV'){
    if(inFlight.current||close?.state!=='complete')return
    inFlight.current=true;setPending(true);const current=++generation.current;setMessage('Verifying the complete monthly evidence…')
    try{const document=await assembleMonthlyClose(close,{financial:cursor=>readMonthlyFinancialPartsServer({data:{draftRef:close.draftRef,cursor}}),documents:cursor=>readMonthlyRelatedDocumentsServer({data:{draftRef:close.draftRef,cursor}}),usage:(manifest,cursor)=>readOwnerUsageReportPartsServer({data:{reportRef:manifest.reportRef,cursor}})})
      if(current!==generation.current)return
      const name=`monthly-usage-${close.month}-r${close.revision}`
      if(format==='JSON')downloadJson(`${name}.json`,document);else downloadCsv(`${name}-ledger.csv`,generateMonthlyFinancialCsv(document))
      setMessage(`Downloaded verified monthly ${format} evidence.`)
    }catch{if(current===generation.current)setMessage('The complete monthly evidence could not be verified. No partial file was downloaded. Retry the same close.')}
    finally{inFlight.current=false;setPending(false)}
  }
  async function configure(automaticMonthly=!(policy?.automaticMonthly??false)){
    if(policyInFlight.current||policy===null)return
    policyInFlight.current=true;setPolicyPending(true)
    try{await configureUsageReportingServer({data:{automaticMonthly,expectedRevision:policy.revision,idempotencyRef:`usage-reporting:${crypto.randomUUID()}`}});setPolicy(await readUsageReportingPolicyServer());setPolicyMessage('The preference is saved. Automatic preparation is currently inactive.')}
    catch{setPolicyMessage('The preference could not be saved. Refresh the page before trying again.')}
    finally{policyInFlight.current=false;setPolicyPending(false)}
  }
  const facts=snapshot===null?[]:[{label:'UTC month / revision',value:`${snapshot.month} / ${snapshot.revision}`},{label:'Calls created in this month',value:snapshot.usageReport.recordCountUnits},
    {label:'Call facts captured (UTC)',value:formatUtcTimestamp(snapshot.sourcesCapturedAt)},{label:'Ledger recorded through (UTC)',value:formatUtcTimestamp(snapshot.ledgerSnapshotAt)},
    ...(['grossChargeUnits','refundUnits','netChargeUnits','promotionalUseUnits','promotionalRefundUnits'] as const).map(field=>({label:{grossChargeUnits:'Gross settled charges (AUD)',refundUnits:'Refunds (AUD)',netChargeUnits:'Net charge (AUD)',promotionalUseUnits:'Promotional credit used (AUD)',promotionalRefundUnits:'Promotional credit returned (AUD)'}[field],value:formatExactAmount({currency:'AUD',exponent:6,units:snapshot.financial.totals[field]})??'Unknown'})),
    {label:'Provider transfers (USDC)',value:formatExactAmount({currency:'USDC',exponent:6,units:snapshot.financial.totals.providerTransferUnits})??'Unknown'},{label:'Amount / attribution coverage',value:`${snapshot.financial.amountCoverage} / ${snapshot.financial.attributionCoverage}`},
    {label:'Existing financial documents',value:snapshot.relatedDocumentCountUnits},{label:'Snapshot digest',value:close?.snapshotDigest??'Unavailable',mono:true}]
  return <BillingHistory title="Complete monthly usage statements" description="Consolidated evidence for a closed UTC month. Supplements preserve the original close and capture late settlements or corrections. Original funding tax invoices remain separate records.">
    <div className="flex flex-wrap items-end gap-3"><Input label="Statement UTC month" type="month" value={month} max={priorMonth()} disabled={pending} onChange={event=>{generation.current++;setMonth(event.target.value);setClose(null);setMessage('')}} />
      <Button type="button" variant="secondary" disabled={pending||!monthlyDraftIntentSchema.shape.month.safeParse(month).success} onClick={()=>void prepare(close?.revision??1)}>Prepare or read monthly close</Button>
      {close===null?null:<Button type="button" variant="secondary" disabled={pending} onClick={()=>void read(close.draftRef)}>Refresh monthly close</Button>}
      {close?.state!=='complete'?null:<Button type="button" variant="secondary" disabled={pending||close.revision>=100} onClick={()=>void prepare(close.revision+1)}>Create monthly supplement</Button>}
    </div>
    <p role="status" aria-live="polite" className="text-sm text-muted-foreground">{message|| (close===null?'':`Revision ${close.revision}: ${close.state}${close.failureCode===null?'':` · ${close.failureCode}`}`)}</p>
    {snapshot===null?null:<><AeFactList facts={facts}/><div className="flex flex-wrap gap-2"><Button type="button" variant="secondary" disabled={pending} onClick={()=>void download('JSON')}>Download complete monthly JSON</Button><Button type="button" variant="secondary" disabled={pending} onClick={()=>void download('CSV')}>Download monthly ledger CSV</Button><Link to="/owner/credit">Read financial documents</Link></div>
      <p className="text-xs text-muted-foreground">Ledger totals use financial effective dates. The JSON includes the creation-date bridge, measured service units, every captured financial entry and original document references. Amounts with partial coverage remain incomplete.</p></>}
    <div className="flex flex-wrap gap-2"><Button type="button" variant="secondary" disabled={policyPending||policy===null} onClick={()=>void configure()}>{policy?.automaticMonthly?'Disable monthly reporting preference':'Save automatic monthly reporting preference'}</Button>{policy?.automaticMonthly&&!policy.ownerConsentCurrent?<Button type="button" variant="secondary" disabled={policyPending} onClick={()=>void configure(true)}>Renew owner reporting consent</Button>:null}<span className="text-sm text-muted-foreground">Automatic preparation is inactive.{policy?.automaticMonthly?' Preference saved.':''}{policy?.automaticMonthly&&!policy.ownerConsentCurrent?' Owner consent requires renewal.':''}</span></div>
    <p role="status" aria-live="polite" className="text-sm text-muted-foreground">{policyMessage}</p>
  </BillingHistory>
}
