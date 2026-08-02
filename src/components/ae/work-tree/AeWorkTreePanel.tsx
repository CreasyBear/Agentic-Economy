import { useMemo, useState } from 'react'
import { Tree, type NodeRendererProps } from 'react-arborist'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'
import { formatMoney } from '@/lib/ui/format-money'
import type { WorkNode, WorkTree } from '@/modules/work-tree/public'

// Pattern provenance: disclosure tree/list composition adapted from
// ln-dev7/circle (MIT), https://raw.githubusercontent.com/ln-dev7/circle/master/components/common/inbox/inbox.tsx.
// Primitive/disclosure pattern follows the WorkTree inbox/readback composition.
// react-arborist@3.16.0 TreeProps declares data, children, childrenAccessor,
// idAccessor, rowHeight, width, height, openByDefault, disableDrag,
// disableDrop, and aria-label (node_modules/react-arborist/dist/main/types/tree-props.d.ts:11-68).
export type AeWorkTreePanelProps = Readonly<{
  tree: WorkTree
  defaultOpen?: boolean
}>

type TreeNode = WorkNode & Readonly<{ children?: readonly TreeNode[] }>

export function AeWorkTreePanel({ tree, defaultOpen = false }: AeWorkTreePanelProps) {
  const [open, setOpen] = useState(defaultOpen)
  const data = useMemo(() => toTreeData(tree.nodes), [tree.nodes])
  const height = Math.max(220, Math.min(520, data.length * 76 + 48))

  return (
    <section aria-labelledby="work-tree-disclosure-title" className="grid w-full gap-3">
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <Button type="button" variant="outline" className="min-h-11 w-full justify-between sm:w-auto">
            <span id="work-tree-disclosure-title">{open ? 'Hide the whole plan' : 'See the whole plan'}</span>
            <span aria-hidden="true">{open ? '−' : '+'}</span>
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="grid gap-3 pt-4">
          <Card className="border border-border bg-card">
            <CardHeader>
              <CardTitle>The whole plan</CardTitle>
              <CardDescription>A read-only view of what is decided, waiting, and still open.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {data.length === 0 ? (
                <p className="px-6 pb-6 text-sm text-muted-foreground">The whole plan is not ready yet.</p>
              ) : (
                <div className="overflow-hidden border-t border-border px-2 py-2">
                  <Tree<TreeNode>
                    data={data}
                    children={TreeRow}
                    childrenAccessor="children"
                    idAccessor="nodeId"
                    rowHeight={72}
                    width="100%"
                    height={height}
                    indent={18}
                    openByDefault
                    disableDrag
                    disableDrop
                    aria-label="Whole plan"
                  />
                </div>
              )}
            </CardContent>
          </Card>
        </CollapsibleContent>
      </Collapsible>
    </section>
  )
}

function TreeRow({ node, style }: NodeRendererProps<TreeNode>) {
  const item = node.data
  const fog = item.status === 'fog'
  return (
    <div
      style={style}
      role="treeitem"
      aria-level={node.level + 1}
      aria-expanded={node.isInternal ? node.isOpen : undefined}
      data-fog={fog ? 'true' : 'false'}
      className={cn('flex items-start gap-2 rounded-md px-2 py-2', fog && 'opacity-55')}
    >
      {node.isInternal ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={`${node.isOpen ? 'Collapse' : 'Expand'} ${item.title}`}
          className="mt-0.5 shrink-0 border border-border text-sm text-muted-foreground"
          onClick={(event) => {
            event.stopPropagation()
            node.toggle()
          }}
        >
          <span aria-hidden="true">{node.isOpen ? '−' : '+'}</span>
        </Button>
      ) : <span className="size-7 shrink-0" aria-hidden="true" />}
      <div className="grid min-w-0 flex-1 gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate text-sm font-medium text-foreground">{item.title}</span>
          <Badge variant={item.status === 'ready' ? 'secondary' : 'outline'}>{item.status}</Badge>
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground" aria-label={`Five dimensions for ${item.title}`}>
          <span>Timing: {formatTiming(item)}</span>
          <span>Cost: {formatCost(item)}</span>
          <span>Resource: {item.resource?.owner ?? 'not set'}</span>
          <span>Effort: {item.effort?.humanMinutes === undefined ? 'not set' : `${item.effort.humanMinutes} min`}</span>
          <span>Scope: {formatScope(item)}</span>
        </div>
      </div>
    </div>
  )
}

function toTreeData(nodes: readonly WorkNode[]): readonly TreeNode[] {
  const byId = new Map(nodes.map((node) => [node.nodeId, node]))
  const childrenByParent = new Map<string, WorkNode[]>()
  for (const node of nodes) {
    if (node.parentId === undefined || !byId.has(node.parentId)) continue
    const children = childrenByParent.get(node.parentId) ?? []
    children.push(node)
    childrenByParent.set(node.parentId, children)
  }

  const visited = new Set<string>()
  const roots = nodes.filter((node) => node.parentId === undefined || !byId.has(node.parentId))
  const result = roots.map((node) => expandNode(node, childrenByParent, visited, new Set<string>()))
  for (const node of nodes) {
    if (!visited.has(node.nodeId)) result.push(expandNode(node, childrenByParent, visited, new Set<string>()))
  }
  return result
}

function expandNode(node: WorkNode, childrenByParent: ReadonlyMap<string, readonly WorkNode[]>, visited: Set<string>, path: ReadonlySet<string>): TreeNode {
  visited.add(node.nodeId)
  const nextPath = new Set(path)
  nextPath.add(node.nodeId)
  const children = (childrenByParent.get(node.nodeId) ?? [])
    .filter((child) => !nextPath.has(child.nodeId))
    .map((child) => expandNode(child, childrenByParent, visited, nextPath))
  return children.length === 0 ? node : { ...node, children }
}

function formatTiming(node: WorkNode): string {
  const timing = node.timing
  if (timing === undefined) return 'open'
  if (timing.certainty === 'fixed') return timing.date ?? 'fixed'
  if (timing.certainty === 'window') return timing.window === undefined ? 'window' : `${timing.window.earliest}–${timing.window.latest}`
  return timing.leadTimeDays === undefined ? 'open' : `${timing.leadTimeDays}d`
}

function formatCost(node: WorkNode): string {
  const cost = node.cost
  if (cost === undefined) return 'open'
  const amount = cost.committedMinor ?? cost.estimateMinor ?? cost.envelopeMinor
  if (amount === undefined) return 'open'
  return `${formatMoney(cost.currency, amount)}${cost.envelopeMinor === undefined ? '' : `/${formatMoney(cost.currency, cost.envelopeMinor)}`}`
}

function formatScope(node: WorkNode): string {
  const scope = node.scope
  if (scope === undefined) return 'open'
  if (scope.criteria === undefined) return scope.acceptance
  const accepted = scope.criteria.filter((criterion) => criterion.accepted).length
  return `${accepted}/${scope.criteria.length}`
}

