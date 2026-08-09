import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { StartRequestPanel } from './StartRequestPanel'
import { CUSTOMER_REQUEST_HUMAN_COMPREHENSION } from '@/modules/customer-request/public-comprehension'
import { DIALOG_WELCOME } from '@/content/brand-copy'
import { cn } from '@/lib/utils'
import { AeDecisionTrail } from '../plan/AeDecisionTrail'
import { RequestResult } from './panels/request-result'
import { useCustomerRequestWorkspaceController } from './workspace-controller'
import { projectCustomerRequestDecisionRecords } from '@/modules/customer-request/application/public'
import type { WorkspaceState } from './workspace-types'

export type AeCustomerRequestWorkspaceProps = Readonly<{
  initialNeed?: string
}>

export function AeCustomerRequestWorkspace({ initialNeed = '' }: AeCustomerRequestWorkspaceProps) {
  const {
    need,
    setNeed,
    answer,
    setAnswer,
    state,
    turns,
    editingRevision,
    routeFeedback,
    setRouteFeedback,
    resumeOffer,
    dismissResumeOffer,
    resumeStoredRequest,
    submit,
    compare,
    reviewRoute,
    leaveRouteReview,
    reportRouteUnavailable,
    continueRequest,
    authorize,
    confirmRoute,
    refresh,
    actOnRoute,
    edit,
    restart,
  } = useCustomerRequestWorkspaceController({ initialNeed })

  const showStartHeader = state.kind === 'idle' || state.kind === 'error'

  // Idle is the front door and gets the whole viewport; once there is a Request
  // to read, the surface becomes a document and starts at the top.
  return (
    <main className={cn('mx-auto grid min-w-0 w-full max-w-6xl gap-8 px-4 py-10 sm:px-6 lg:py-14', showStartHeader ? 'min-h-[calc(100dvh-9rem)] content-center' : 'content-start')}>
      {showStartHeader ? <header className="mx-auto grid max-w-3xl gap-4 text-center">
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">{DIALOG_WELCOME.heading}</h1>
        <p className="block text-lg text-muted-foreground">{CUSTOMER_REQUEST_HUMAN_COMPREHENSION.situation}</p>
      </header> : null}

      {showStartHeader && resumeOffer !== undefined ? <Card className="mx-auto w-full max-w-3xl p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="block font-semibold">You have a Request saved on this device.</p>
            {resumeOffer.summary === undefined
              ? null
              : <p className="mt-1 block text-sm text-muted-foreground">{resumeOffer.summary}</p>}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="secondary" onClick={() => void resumeStoredRequest(resumeOffer)}>Pick it up</Button>
            <Button type="button" variant="ghost" onClick={dismissResumeOffer}>Discard</Button>
          </div>
        </div>
      </Card> : null}

      {state.kind === 'request' && state.projection.recovery?.state === 'restored'
        ? <Card className="mx-auto w-full max-w-4xl p-3" aria-live="polite">
            <p className="text-muted-foreground">{state.projection.recovery.reason === 'choice_expired'
              ? 'AE restored this Request. The earlier choice expired, so no work was authorized or restarted.'
              : 'AE restored the latest saved state for this Request. Checking it did not restart the work.'}</p>
          </Card>
        : null}

      {state.kind === 'idle' || state.kind === 'error' ? <section className="mx-auto grid w-full max-w-3xl gap-5" aria-label="Start a request">
        <StartRequestPanel
          need={need}
          onNeedChange={setNeed}
          onSubmit={() => void submit()}
          editingRevision={editingRevision}
        />
        {state.kind === 'error' ? <RequestResult state={state} compare={compare} reviewRoute={reviewRoute} leaveRouteReview={leaveRouteReview} reportRouteUnavailable={reportRouteUnavailable} confirmRoute={confirmRoute} actOnRoute={actOnRoute} authorize={authorize} refresh={refresh} continueRequest={continueRequest} edit={edit} restart={restart} answer={answer} setAnswer={setAnswer} routeFeedback={routeFeedback} setRouteFeedback={setRouteFeedback} turns={turns} /> : null}
      </section> : <><RequestResult state={state} compare={compare} reviewRoute={reviewRoute} leaveRouteReview={leaveRouteReview} reportRouteUnavailable={reportRouteUnavailable} confirmRoute={confirmRoute} actOnRoute={actOnRoute} authorize={authorize} refresh={refresh} continueRequest={continueRequest} edit={edit} restart={restart} answer={answer} setAnswer={setAnswer} routeFeedback={routeFeedback} setRouteFeedback={setRouteFeedback} turns={turns} /><RequestDecisionTrail state={state} /></>}
    </main>
  )
}

function RequestDecisionTrail({ state }: Readonly<{ state: WorkspaceState }>) {
  if (!('projection' in state)) return null
  return <AeDecisionTrail decisions={projectCustomerRequestDecisionRecords(state.projection)} />
}


