import { Link } from '@tanstack/react-router'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'

import { AUTHORIZE_RADIO_CARD_CLASS, type ConsentToolAccessFieldsetProps } from '../authorize-form.contracts'

export function ConsentToolAccessFieldset({
  pending,
  toolAccess,
  approvedToolAccess,
  approvedToolRefs,
  toolQuery,
  toolSearch,
  approvedToolRefSet,
  onApprovedToolAccessChange,
  onToolQueryChange,
  onFindTools,
  onAddApprovedTool,
  onRemoveApprovedTool,
}: ConsentToolAccessFieldsetProps) {
  return (
    <fieldset className="grid gap-3" disabled={pending}>
      <legend className="text-sm font-medium text-foreground">Tools</legend>
      {toolAccess === 'all_admitted' ? (
        <RadioGroup
          value={approvedToolAccess}
          onValueChange={(value) => onApprovedToolAccessChange(value as 'all_admitted' | 'selected_tools')}
          className="grid gap-2 sm:grid-cols-2"
        >
          <Label htmlFor="tools-all" className={AUTHORIZE_RADIO_CARD_CLASS}>
            <RadioGroupItem id="tools-all" value="all_admitted" className="mt-1" />
            <span><span className="block font-medium">All admitted Tools</span><span className="text-sm font-normal text-muted-foreground">Includes Tools admitted later.</span></span>
          </Label>
          <Label htmlFor="tools-selected" className={AUTHORIZE_RADIO_CARD_CLASS}>
            <RadioGroupItem id="tools-selected" value="selected_tools" className="mt-1" />
            <span><span className="block font-medium">Selected Tools</span><span className="text-sm font-normal text-muted-foreground">Limit this Agent to exact current Tool references.</span></span>
          </Label>
        </RadioGroup>
      ) : (
        <p className="text-sm text-muted-foreground">The caller requested selected Tools. You may approve a non-empty subset, but cannot broaden it.</p>
      )}
      {approvedToolAccess === 'selected_tools' ? (
        <div className="grid gap-3">
          {approvedToolRefs.length === 0 ? (
            <Alert variant="destructive"><AlertTitle>Select at least one Tool</AlertTitle><AlertDescription>Selected access cannot be empty.</AlertDescription></Alert>
          ) : (
            <ul className="grid gap-2" aria-label="Approved Tools">
              {approvedToolRefs.map((toolRef) => (
                <li key={toolRef} className="flex min-w-0 items-center justify-between gap-3 rounded-md border px-3 py-2">
                  <Link
                    to="/tools/$toolRef"
                    params={{ toolRef }}
                    className="truncate font-mono text-sm underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {toolRef}
                  </Link>
                  <Button type="button" variant="secondary" onClick={() => onRemoveApprovedTool(toolRef)}>Remove</Button>
                </li>
              ))}
            </ul>
          )}
          {toolAccess === 'all_admitted' ? (
            <div className="grid gap-2">
              <Label htmlFor="tool-search">Find an admitted Tool</Label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input id="tool-search" value={toolQuery} onChange={(event) => onToolQueryChange(event.target.value)} />
                <Button type="button" variant="secondary" disabled={toolSearch.pending || toolQuery.trim().length === 0} onClick={() => void onFindTools()}>
                  {toolSearch.pending ? 'Searching…' : 'Search Tools'}
                </Button>
              </div>
              {toolSearch.error === undefined ? null : <p role="alert" className="text-sm text-destructive">{toolSearch.error}</p>}
              {toolSearch.result?.kind === 'ok' ? (
                <ul className="grid gap-2" aria-label="Tool search results">
                  {toolSearch.result.items.map((item) => (
                    <li key={item.toolRef} className="flex min-w-0 items-center justify-between gap-3 rounded-md border px-3 py-2">
                      <span className="min-w-0"><span className="block truncate font-medium">{item.title}</span><span className="block truncate font-mono text-xs text-muted-foreground">{item.toolRef}</span></span>
                      <Button type="button" variant="secondary" disabled={approvedToolRefSet.has(item.toolRef)} onClick={() => onAddApprovedTool(item.toolRef)}>
                        {approvedToolRefSet.has(item.toolRef) ? 'Added' : 'Add'}
                      </Button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </fieldset>
  )
}
