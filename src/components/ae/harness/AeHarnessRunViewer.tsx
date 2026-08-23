'use client'

import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  FileJsonIcon,
  LockKeyholeIcon,
} from 'lucide-react'
import { useState } from 'react'

import { AeStatusBadge } from '@/components/ae/status/AeStatusBadge'
import { getStatusPresentation, aeStatusToneVariants } from '@/lib/ui/status-presentation'
import { formatTimestamp } from '@/lib/ui/format-time'
import { AeFactList } from '@/components/ae/data/AeFactList'
import { AeOperatorFilterCard } from '@/components/ae/operator/AeOperatorFilterCard'
import { AeOperatorQueueList } from '@/components/ae/operator/AeOperatorQueueList'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type {
  HarnessRunViewerDetail,
  HarnessRunViewerDetailResult,
  HarnessRunViewerFilters,
  HarnessRunViewerListAllowed,
  HarnessRunViewerListResult,
  HarnessRunViewerListRow,
  HarnessRunViewerPhaseRow,
  HarnessRunViewerToolRow,
} from '@/modules/answer-thread/run-viewer.schema'

export function AeHarnessRunList({
  result,
  filters,
}: {
  result: HarnessRunViewerListResult
  filters: HarnessRunViewerFilters
}) {
  return (
    <>
      <RunViewerAccess result={result} />
      <RunViewerFilters filters={filters} />
      {result.kind === 'denied' ? (
        <DeniedRows result={result} />
      ) : (
        <AllowedList result={result} />
      )}
    </>
  )
}

export function AeHarnessRunDetail({ result }: { result: HarnessRunViewerDetailResult }) {
  if (result.kind === 'denied') {
    return (
      <>
        <RunViewerAccess result={result} />
        <DeniedRows result={result} />
      </>
    )
  }

  if (result.kind === 'not_found') {
    return (
      <>
        <Alert variant="destructive">
          <AlertTriangleIcon aria-hidden="true" />
          <AlertTitle>Run not found</AlertTitle>
          <AlertDescription>{`${result.publicMessage} HTTP ${result.httpStatus}.`}</AlertDescription>
        </Alert>
        <Card className="p-5">
          <div className="grid gap-1.5">
            <p className="break-words text-lg font-semibold text-foreground">Turn {result.turnId}</p>
            <p className="text-sm text-muted-foreground">No private rows were returned for this detail request.</p>
          </div>
        </Card>
      </>
    )
  }

  return (
    <>
      <RunViewerAccess result={result} />
      <RunDetailHeader detail={result.detail} />
      <RunDetailTabs detail={result.detail} />
    </>
  )
}

function RunViewerAccess({
  result,
}: {
  result: HarnessRunViewerListResult | HarnessRunViewerDetailResult
}) {
  const denied = result.kind === 'denied'
  return (
    <Alert
      data-readback-kind={result.kind}
      variant={denied ? 'destructive' : 'default'}
    >
      {denied
        ? <LockKeyholeIcon aria-hidden="true" />
        : <CheckCircle2Icon aria-hidden="true" />}
      <AlertTitle>{denied ? 'Access withheld' : 'Run surface ready'}</AlertTitle>
      <AlertDescription>
        {denied
          ? `${result.publicMessage} HTTP ${result.httpStatus}.`
          : `Run data is scoped to the admin operator surface. HTTP ${result.httpStatus}.`}
      </AlertDescription>
    </Alert>
  )
}


function RunViewerFilters({ filters }: { filters: HarnessRunViewerFilters }) {
  return (
    <AeOperatorFilterCard
      action="/admin/runs"
      title="Find a run"
      description="Filter by status, turn, thread, date, or whether a turn has a run."
      fields={[
        {
          id: 'status',
          name: 'status',
          label: 'Status',
          description: 'any, ok, error, blocked, timeout, aborted, missing, pending, or complete.',
          defaultValue: filters.status ?? '',
        },
        {
          id: 'turnId',
          name: 'turnId',
          label: 'Turn ID',
          description: 'Exact or partial turn identifier.',
          defaultValue: filters.turnId ?? '',
        },
        {
          id: 'threadId',
          name: 'threadId',
          label: 'Thread ID',
          description: 'Exact or partial thread identifier.',
          defaultValue: filters.threadId ?? '',
        },
        {
          id: 'date',
          name: 'date',
          label: 'Date',
          description: 'ISO date prefix, for example 2026-07-02.',
          defaultValue: filters.date ?? '',
        },
        {
          id: 'hasRunEvidence',
          name: 'hasRunEvidence',
          label: 'Run',
          description: 'any, yes, or no.',
          defaultValue: filters.hasRunEvidence ?? '',
        },
      ]}
    />
  )
}

function DeniedRows({
  result,
}: {
  result: Extract<HarnessRunViewerListResult | HarnessRunViewerDetailResult, { kind: 'denied' }>
}) {
  return (
    <Card className="grid gap-4 border border-border bg-card p-5">
      <div className="grid gap-1.5">
        <p className="text-lg font-semibold text-foreground">Private rows withheld</p>
        <p className="text-sm text-muted-foreground">Denied run reads return no raw turn, tool, or model rows.</p>
      </div>
      <AeFactList
        facts={[
          { label: 'Decision', value: result.reason.replaceAll('_', ' ') },
          { label: 'Private rows returned', value: result.rows.length },
          { label: 'Generated', value: formatTimestamp(result.generatedAt) },
        ]}
      />
    </Card>
  )
}

function AllowedList({ result }: { result: HarnessRunViewerListAllowed }) {
  return (
    <>
      <Card className="grid gap-4 border border-border bg-card p-5">
        <div className="grid gap-1.5">
          <p className="text-lg font-semibold text-foreground">Run summary</p>
          <p className="text-sm text-muted-foreground">Rows are derived from private answer-turn evidence after admin access is resolved.</p>
        </div>
        <AeFactList
          facts={[
            { label: 'Turns', value: result.summary.turns },
            { label: 'Harness runs', value: result.summary.withHarnessRun },
            { label: 'Missing evidence', value: result.summary.missingRunEvidence },
            { label: 'Needs attention', value: result.summary.attention },
            { label: 'Generated', value: formatTimestamp(result.generatedAt) },
          ]}
        />
      </Card>
      {result.rows.length === 0 ? (
        <Empty className="border border-border bg-card p-5">
          <EmptyHeader>
            <EmptyTitle>No run rows</EmptyTitle>
            <EmptyDescription>No answer turns match the current run filters.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <AeOperatorQueueList
          scroll
          rows={result.rows.map((row) => {
            const runPres = getStatusPresentation(row.runStatus)
            return {
              id: row.rowId,
              href: `/admin/runs/${encodeURIComponent(row.turnId)}`,
              badges: [
                { label: runPres.label, variant: aeStatusToneVariants[runPres.tone] },
                { label: row.runSource.replaceAll(/([A-Z])/g, ' $1').toLowerCase(), variant: 'outline' },
              ],
              title: row.turnId,
              description: row.queryPreview,
              facts: listRowFacts(row),
            }
          })}
          emptyTitle="No run rows"
          emptyDescription="No answer turns match the current run filters."
        />
      )}
    </>
  )
}

function RunDetailHeader({ detail }: { detail: HarnessRunViewerDetail }) {
  return (
    <Card className="grid gap-4 border border-border bg-card p-5">
      <div className="grid gap-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <AeStatusBadge status={detail.run.status} audience="operator" />
          <Badge variant="outline">{detail.run.source.replaceAll(/([A-Z])/g, ' $1').toLowerCase()}</Badge>
          {detail.publicProjection.leakedMarkers.length === 0 ? (
            <Badge variant="secondary">public diff clean</Badge>
          ) : (
            <Badge variant="destructive">public diff leak</Badge>
          )}
        </div>
        <p className="break-words font-mono text-lg font-semibold text-foreground">{detail.turn.turnId}</p>
        <p className="text-sm text-muted-foreground">{detail.turn.query}</p>
      </div>
      <AeFactList
        facts={[
          { label: 'Thread', value: detail.turn.threadId },
          { label: 'Turn status', value: detail.turn.status.replaceAll('_', ' ') },
          { label: 'Intent', value: detail.turn.intent.replaceAll('_', ' ') },
          { label: 'Duration', value: `${detail.run.durationMs}ms` },
          { label: 'Tools', value: detail.tools.length },
          { label: 'Phases', value: detail.phases.length },
        ]}
      />
    </Card>
  )
}

function RunDetailTabs({ detail }: { detail: HarnessRunViewerDetail }) {
  const [activeTab, setActiveTab] = useState('overview')

  return (
    <div className="grid gap-4">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList aria-label="Run detail tabs" className="max-w-full flex-wrap justify-start">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="tools">Tools</TabsTrigger>
          <TabsTrigger value="phases">Phases</TabsTrigger>
          <TabsTrigger value="evidence">Evidence</TabsTrigger>
          <TabsTrigger value="public">Public view</TabsTrigger>
          <TabsTrigger value="raw">Raw JSON</TabsTrigger>
        </TabsList>
      </Tabs>
      {activeTab === 'overview' ? <OverviewTab detail={detail} /> : null}
      {activeTab === 'tools' ? <ToolRows rows={detail.tools} /> : null}
      {activeTab === 'phases' ? <PhaseRows rows={detail.phases} /> : null}
      {activeTab === 'evidence' ? <EvidenceTab detail={detail} /> : null}
      {activeTab === 'public' ? <PublicProjectionTab detail={detail} /> : null}
      {activeTab === 'raw' ? <RawJsonTab detail={detail} /> : null}
    </div>
  )
}
function OverviewTab({ detail }: { detail: HarnessRunViewerDetail }) {
  return (
    <Card className="grid gap-4 border border-border bg-card p-5">
      <div className="grid gap-1.5">
        <p className="text-lg font-semibold text-foreground">Overview</p>
        <p className="text-sm text-muted-foreground">Run identity, coverage, and terminal state.</p>
      </div>
      <AeFactList
        facts={[
          { label: 'Run ID', value: detail.run.runId ?? 'not recorded' },
          { label: 'Session ID', value: detail.run.sessionId ?? 'not recorded' },
          { label: 'Snapshot', value: detail.turn.snapshotHash.length > 0 ? 'Recorded' : 'Not recorded' },
          { label: 'Started', value: detail.run.startedAt === undefined ? 'not recorded' : formatTimestamp(detail.run.startedAt) },
          { label: 'Ended', value: detail.run.endedAt === undefined ? 'not recorded' : formatTimestamp(detail.run.endedAt) },
          { label: 'Errors', value: detail.run.report?.summary.errors.count ?? 0 },
        ]}
      />
      {detail.turn.snapshotHash.length > 0 ? (
        <ReferenceDetails label="View snapshot reference" value={detail.turn.snapshotHash} />
      ) : null}
    </Card>
  )
}

function ToolRows({ rows }: { rows: readonly HarnessRunViewerToolRow[] }) {
  if (rows.length === 0) {
    return (
      <Empty className="border border-border bg-card p-5">
        <EmptyHeader>
          <EmptyTitle>No tool rows</EmptyTitle>
          <EmptyDescription>This turn does not include tool-call evidence.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <AeOperatorQueueList
      rows={rows.map((row) => {
        const statusPres = getStatusPresentation(row.status)
        return {
          id: row.id,
          badges: [
            { label: statusPres.label, variant: aeStatusToneVariants[statusPres.tone] },
            { label: `${row.durationMs}ms`, variant: 'outline' },
          ],
          title: row.toolId,
          description: row.errorCode ?? 'No error code recorded.',
          body:
            row.resultHash === undefined ? undefined : <ReferenceDetails label="View result reference" value={row.resultHash} />,
          facts: [
            { label: 'Count', value: String(row.count) },
            { label: 'Sequence', value: row.seq === undefined ? 'summary' : String(row.seq) },
            { label: 'Result', value: row.resultHash === undefined ? 'not recorded' : 'Recorded' },
          ],
        }
      })}
      emptyTitle="No tool rows"
      emptyDescription="This turn does not include tool evidence."
    />
  )
}

function PhaseRows({ rows }: { rows: readonly HarnessRunViewerPhaseRow[] }) {
  if (rows.length === 0) {
    return (
      <Empty className="border border-border bg-card p-5">
        <EmptyHeader>
          <EmptyTitle>No phase rows</EmptyTitle>
          <EmptyDescription>This run report has no phase counters yet.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <AeOperatorQueueList
      rows={rows.map((row) => {
        const statusPres = getStatusPresentation(row.status)
        return {
          id: row.id,
          badges: [
            { label: statusPres.label, variant: aeStatusToneVariants[statusPres.tone] },
            { label: `${row.durationMs}ms`, variant: 'outline' },
          ],
          title: row.phase,
          description: row.errorCode ?? 'No phase error code recorded.',
          facts: [
            { label: 'Events', value: String(row.count) },
            { label: 'Duration', value: `${row.durationMs}ms` },
            { label: 'Error code', value: row.errorCode ?? 'none' },
          ],
        }
      })}
      emptyTitle="No phase rows"
      emptyDescription="This run report has no phase counters yet."
    />
  )
}

function EvidenceTab({ detail }: { detail: HarnessRunViewerDetail }) {
  return (
    <Card className="grid gap-4 border border-border bg-card p-5">
      <div className="grid gap-1.5">
        <p className="text-lg font-semibold text-foreground">Evidence</p>
        <p className="text-sm text-muted-foreground">Private evidence shape without expanding raw JSON.</p>
      </div>
      <div className="grid gap-5">
        <AeFactList
          facts={[
            { label: 'Providers', value: detail.evidence.providerCount },
            { label: 'Allowed slugs', value: detail.evidence.allowedSlugCount },
            { label: 'Tool calls', value: detail.evidence.toolCallCount },
            { label: 'Timings', value: detail.evidence.timingCount },
            { label: 'Work log', value: detail.evidence.workLogCount },
            { label: 'Agent JSON', value: detail.evidence.agentJsonUrl ?? 'not recorded' },
          ]}
        />
        <TokenList title="Result references" values={detail.evidence.resultHashes} reference />
        <TokenList title="Artifact kinds" values={detail.evidence.artifactKinds} />
      </div>
    </Card>
  )
}

function PublicProjectionTab({ detail }: { detail: HarnessRunViewerDetail }) {
  const diff = detail.publicProjection
  return (
    <Card className="grid gap-4 border border-border bg-card p-5">
      <div className="grid gap-1.5">
        <p className="text-lg font-semibold text-foreground">Public projection comparison</p>
        <p className="text-sm text-muted-foreground">Public thread projection is an allowlist; raw tool and run data must stay absent.</p>
      </div>
      <div className="grid gap-5">
        <AeFactList
          facts={[
            { label: 'Leaked markers', value: diff.leakedMarkers.length },
            { label: 'Excluded markers', value: diff.excludedPrivateMarkers.length },
            { label: 'Artifacts', value: diff.publicTurn.artifacts.length },
            { label: 'Work steps', value: diff.publicTurn.workLog.length },
            { label: 'Checks failed', value: diff.publicTurn.answerCheckSummary?.checksFailed ?? 0 },
            { label: 'Checks passed', value: diff.publicTurn.answerCheckSummary?.checksPassed ?? 0 },
          ]}
        />
        {diff.leakedMarkers.length === 0 ? (
          <Alert>
            <CheckCircle2Icon aria-hidden="true" />
            <AlertTitle>Public projection is clean</AlertTitle>
            <AlertDescription>No configured raw-evidence markers appear in the public projection.</AlertDescription>
          </Alert>
        ) : (
          <Alert variant="destructive">
            <AlertTriangleIcon aria-hidden="true" />
            <AlertTitle>Public projection needs review</AlertTitle>
            <AlertDescription>{diff.leakedMarkers.join(', ')}</AlertDescription>
          </Alert>
        )}
        <CollapsedJson label="View public projection reference" value={diff.serializedPublicProjection} />
      </div>
    </Card>
  )
}

function RawJsonTab({ detail }: { detail: HarnessRunViewerDetail }) {
  return (
    <Card className="grid gap-4 border border-border bg-card p-5">
      <div className="grid gap-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <FileJsonIcon aria-hidden="true" className="size-4 text-muted-foreground" />
          <p className="text-lg font-semibold text-foreground">Raw JSON</p>
        </div>
        <p className="text-sm text-muted-foreground">Collapsed by default. This section is only for authorized admin/operator contexts.</p>
      </div>
      <div className="grid gap-3">
        <CollapsedJson label="Turn JSON" value={detail.rawJson.turnJson} />
        <CollapsedJson label="Evidence JSON" value={detail.rawJson.evidenceJson} />
        <CollapsedJson label="Prose JSON" value={detail.rawJson.proseJson} />
        <CollapsedJson label="Artifact kinds JSON" value={detail.rawJson.artifactKindsJson} />
      </div>
    </Card>
  )
}

function CollapsedJson({ label, value }: { label: string; value: string }) {
  return (
    <details className="rounded-sm border border-border bg-card">
      <summary className="flex min-h-11 cursor-pointer items-center px-3 py-2 text-sm font-medium text-foreground">{label}</summary>
      <div className="border-t border-border p-3">
        <JsonBlock label={label} value={value} />
      </div>
    </details>
  )
}

function JsonBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="overflow-auto rounded-md border border-border" style={{ maxHeight: 'min(60vh, 32rem)' }}>
      <pre aria-label={label} className="whitespace-pre-wrap break-words p-3 font-mono text-xs leading-5 text-foreground">
        {value}
      </pre>
    </div>
  )
}

/**
 * Collapsed "view reference" affordance for full refs (hashes) an operator may
 * genuinely need to inspect without showing a raw digest in the main flow.
 */
function ReferenceDetails({ label, value }: { label: string; value: string }) {
  return (
    <details className="rounded-sm border border-border bg-card">
      <summary className="flex min-h-11 cursor-pointer items-center px-3 py-2 text-sm font-medium text-foreground">
        {label}
      </summary>
      <div className="border-t border-border p-3">
        <pre className="whitespace-pre-wrap break-words p-3 font-mono text-xs leading-5 text-foreground">{value}</pre>
      </div>
    </details>
  )
}

function TokenList({ title, values, reference = false }: { title: string; values: readonly string[]; reference?: boolean }) {
  return (
    <section className="grid gap-2">
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      {values.length === 0 ? (
        <p className="text-sm text-muted-foreground">No values recorded.</p>
      ) : reference ? (
        <details className="rounded-sm border border-border bg-card">
          <summary className="flex min-h-11 cursor-pointer items-center gap-2 px-3 py-2 text-sm font-medium text-foreground">
            View {values.length} reference{values.length === 1 ? '' : 's'}
          </summary>
          <div className="border-t border-border p-3">
            <ul className="grid gap-2">
              {values.map((value) => (
                <li key={`${title}:${value}`} className="break-words rounded-sm border border-border bg-card p-3 font-mono text-xs leading-5 text-foreground">
                  {value}
                </li>
              ))}
            </ul>
          </div>
        </details>
      ) : (
        <ul className="grid gap-2">
          {values.map((value) => (
            <li key={`${title}:${value}`} className="break-words rounded-sm border border-border bg-card p-3 font-mono text-xs leading-5 text-foreground">
              {value}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function listRowFacts(row: HarnessRunViewerListRow): readonly { label: string; value: string }[] {
  return [
    { label: 'Thread', value: row.threadId },
    { label: 'Turn status', value: row.turnStatus.replaceAll('_', ' ') },
    { label: 'Providers', value: String(row.providerCount) },
    { label: 'Tools', value: String(row.toolCallCount) },
    { label: 'Checks', value: `${row.checksPassed} passed / ${row.checksFailed} failed` },
    { label: 'Created', value: formatTimestamp(row.createdAt) },
  ]
}


