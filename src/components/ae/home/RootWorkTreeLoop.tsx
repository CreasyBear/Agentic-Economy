import { useCallback, useState } from 'react'
import { Link, useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { AeDecisionInbox, type AeDecisionInboxStatus } from '@/components/ae/work-tree/AeDecisionInbox'
import { AeWorkTreePanel } from '@/components/ae/work-tree/AeWorkTreePanel'
import {
  claimRootWorkTreeServer,
  decideRootWorkTreeServer,
  type RootWorkTreeReadback,
  type WorkTreeDecisionResult,
} from '@/modules/work-tree/human-root.functions'
import type { DecisionInboxExit, DecisionInboxExitKind } from '@/modules/work-tree/public'

/**
 * The person-facing WorkTree loop. Component state holds only transient action
 * status (decision or claim) and never the tree, inbox or a receipt. Every
 * rendered fact is the loader's source readback, so a hard reload lands on the
 * same revision, the same inbox and the same receipt.
 */
export function RootWorkTreeLoop({ readback }: Readonly<{ readback: RootWorkTreeReadback }>) {
  const router = useRouter()
  const [pendingExit, setPendingExit] = useState<DecisionInboxExitKind | undefined>(undefined)
  const [decided, setDecided] = useState<WorkTreeDecisionResult | undefined>(undefined)
  const view = readback.kind === 'ready' ? readback : undefined
  const claimWorkTree = useServerFn(claimRootWorkTreeServer)
  const [claimPending, setClaimPending] = useState(false)
  const [claimMessage, setClaimMessage] = useState<string | undefined>(undefined)

  const claim = useCallback(async () => {
    if (view === undefined) return
    setClaimPending(true)
    setClaimMessage(undefined)
    try {
      const result = await claimWorkTree({
        data: {
          projectId: view.projectId,
          idempotencyKey: `work-tree:claim:${view.projectId}`,
        },
      })
      if (result.kind === 'accepted' || result.kind === 'replayed') {
        await router.invalidate()
        return
      }
      setClaimMessage(result.code === 'authentication_required'
        ? 'Sign in first, then claim this plan.'
        : 'This plan could not be claimed. Nothing changed.')
    } catch {
      setClaimMessage('This plan could not be claimed. Nothing changed.')
    } finally {
      setClaimPending(false)
    }
  }, [claimWorkTree, router, view])

  const decide = useCallback(async (kind: DecisionInboxExitKind, exit: DecisionInboxExit) => {
    if (view === undefined) return
    setPendingExit(kind)
    try {
      const result = await decideRootWorkTreeServer({
        data: {
          projectId: view.projectId,
          nodeId: exit.nodeId,
          kind,
          // Fences come from the readback the person is looking at. A decision
          // taken against an older revision is refused by the source, not here.
          expectedGeneration: view.generation,
          expectedRevision: view.revision,
        },
      })
      setDecided(result.receipt)
      await router.invalidate()
    } catch {
      setDecided({ kind: 'unknown' })
      try {
        await router.invalidate()
      } catch {
        // The unknown result still requires a fresh inspect before retrying.
      }
    } finally {
      setPendingExit(undefined)
    }
  }, [router, view])

  if (view === undefined) {
    return (
      <Card className="grid w-full gap-2 border border-destructive/50 bg-card p-5 text-left" role="alert">
        <p className="font-semibold text-foreground">We can’t open that plan</p>
        <p className="text-muted-foreground">
          {readback.kind === 'refused' && readback.reason === 'forbidden'
            ? 'This plan belongs to someone else. Nothing has changed.'
            : 'That plan reference isn’t available. Nothing has changed.'}
        </p>
        <Button asChild variant="default" className="min-h-11 justify-self-start"><Link to="/">Start a new ask</Link></Button>
      </Card>
    )
  }

  const decisionResult = decided ?? view.receipts[view.receipts.length - 1]
  const canClaim = !view.events.some((event) => event.kind === 'claimed')
    && view.events.some((event) => event.kind === 'created' && event.actor?.source === 'browser_guest')

  return (
    <div className="grid w-full gap-8 text-left">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary">Revision {view.revision}</Badge>
        <Badge variant="outline">Generation {view.generation}</Badge>
      </div>
      {canClaim ? (
        <Card className="grid gap-3 border border-border bg-card p-5">
          <div className="grid gap-1">
            <p className="font-semibold text-foreground">Keep this plan with your account</p>
            <p className="text-sm text-muted-foreground">
              Claim it after signing in so your owner session can reopen it and your assistant can work within the same project.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" className="min-h-11" disabled={claimPending} onClick={() => { void claim() }}>
              {claimPending ? 'Claiming…' : 'Claim this plan'}
            </Button>
            <Button asChild variant="outline" className="min-h-11">
              <a href={`/sign-in?redirect=${encodeURIComponent(`/?project=${view.projectId}`)}`}>Sign in first</a>
            </Button>
          </div>
          {claimMessage === undefined ? null : <p className="text-sm text-destructive" role="alert">{claimMessage}</p>}
        </Card>
      ) : null}

      <AeDecisionInbox
        projection={view.inbox}
        {...(pendingExit === undefined ? {} : { pendingExit })}
        {...(decisionResult === undefined ? {} : { status: receiptStatus(decisionResult) })}
        onLock={(_item, exit) => { void decide('lock', exit) }}
        onAdjust={(_item, exit) => { void decide('adjust', exit) }}
        onPark={(_item, exit) => { void decide('park', exit) }}
      />

      <AeWorkTreePanel tree={view.tree} />
    </div>
  )
}

const DECISION_NOUN: Readonly<Record<DecisionInboxExitKind, string>> = {
  lock: 'Locked in',
  adjust: 'Adjusted',
  park: 'Parked',
}

const REFUSAL_COPY: Readonly<Record<string, string>> = {
  authentication_required: 'Sign in before deciding this WorkTree item.',
  stale_fence: 'This plan moved on while you were deciding. Nothing changed — read the current plan and choose again.',
  forbidden: 'You don’t have authority for that decision here. Nothing changed.',
  not_found: 'That decision isn’t ready to be taken yet. Nothing changed.',
  digest_mismatch: 'That decision didn’t match the one on record. Nothing changed.',
}

function receiptStatus(result: WorkTreeDecisionResult): AeDecisionInboxStatus {
  if (result.kind === 'unknown') {
    return {
      tone: 'unknown',
      message: 'We can’t confirm that decision yet.',
      detail: 'Inspect the current WorkTree and reconcile before deciding again.',
    }
  }
  if (result.kind === 'refused') {
    if ('code' in result) {
      return {
        tone: 'refusal',
        message: 'Authentication required.',
        detail: REFUSAL_COPY[result.code] ?? 'Sign in before deciding this WorkTree item.',
      }
    }
    return {
      tone: 'refusal',
      message: `${DECISION_NOUN[result.decision]} was refused.`,
      detail: REFUSAL_COPY[result.refusalCode] ?? 'Nothing changed.',
    }
  }
  return {
    tone: 'receipt',
    message: `${DECISION_NOUN[result.decision]} — ${result.disposition}.`,
    detail: `Receipt ${result.receiptId} at revision ${result.readback.revision}.`,
  }
}
