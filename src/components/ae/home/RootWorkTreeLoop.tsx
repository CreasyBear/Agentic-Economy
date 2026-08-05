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
  type RootWorkTreeView,
  type WorkTreeDecisionReceipt,
} from '@/modules/work-tree/human-root.functions'
import type { DecisionInboxExit, DecisionInboxExitKind, DecisionInboxItem } from '@/modules/work-tree/public'

/**
 * The person-facing WorkTree loop. Component state holds only transient action
 * status (decision or claim) and never the tree, inbox or a receipt. Every
 * rendered fact is the loader's source readback, so a hard reload lands on the
 * same revision, the same inbox and the same receipt.
 */
export function RootWorkTreeLoop({ readback }: Readonly<{ readback: RootWorkTreeReadback }>) {
  const router = useRouter()
  const [pendingExit, setPendingExit] = useState<DecisionInboxExitKind | undefined>(undefined)
  const [decided, setDecided] = useState<WorkTreeDecisionReceipt | undefined>(undefined)
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

  const decide = useCallback(async (kind: DecisionInboxExitKind, item: DecisionInboxItem, exit: DecisionInboxExit) => {
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
      setDecided(unknownReceipt(view, exit.nodeId, kind, item))
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

  const receipt = decided ?? view.receipts[view.receipts.length - 1]
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
        {...(receipt === undefined ? {} : { status: receiptStatus(receipt) })}
        onLock={(item, exit) => { void decide('lock', item, exit) }}
        onAdjust={(item, exit) => { void decide('adjust', item, exit) }}
        onPark={(item, exit) => { void decide('park', item, exit) }}
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

function receiptStatus(receipt: WorkTreeDecisionReceipt): AeDecisionInboxStatus {
  if (receipt.kind === 'refused') {
    if (!('decision' in receipt)) {
      return {
        tone: 'refusal',
        message: 'Authentication required.',
        detail: REFUSAL_COPY[receipt.code] ?? 'Sign in before deciding this WorkTree item.',
      }
    }
    return {
      tone: 'refusal',
      message: `${DECISION_NOUN[receipt.decision]} was refused.`,
      detail: REFUSAL_COPY[receipt.refusalCode ?? ''] ?? 'Nothing changed.',
    }
  }
  if (receipt.kind === 'unknown') {
    return {
      tone: 'unknown',
      message: `We can’t confirm ${DECISION_NOUN[receipt.decision].toLowerCase()} yet.`,
      detail: 'The plan below is the current record. Re-read it before deciding again.',
    }
  }
  return {
    tone: 'receipt',
    message: `${DECISION_NOUN[receipt.decision]} — ${receipt.disposition}.`,
    detail: `Receipt ${receipt.receiptId} at revision ${receipt.readback.revision}.`,
  }
}

function unknownReceipt(
  view: RootWorkTreeView,
  nodeId: string,
  kind: DecisionInboxExitKind,
  item: DecisionInboxItem,
): WorkTreeDecisionReceipt {
  return {
    kind: 'unknown',
    decision: kind,
    projectId: view.projectId,
    nodeId,
    receiptId: `unconfirmed:${item.treeId}:${nodeId}`,
    generation: view.generation,
    revision: view.revision,
    disposition: 'unchanged',
    occurredAt: Date.now(),
    readback: { projectId: view.projectId, revision: view.revision },
  }
}
