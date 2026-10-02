import { Link } from '@tanstack/react-router'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/arc/button/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'

import type { ConsentToolAccessFieldsetProps } from '../authorize-form.contracts'
import '../ConsentComposition.css'

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
  onContinueSearch,
  onAddApprovedTool,
  onRemoveApprovedTool,
}: ConsentToolAccessFieldsetProps) {
  const emptySelection = approvedToolRefs.length === 0
  const searchFailed = toolSearch.error !== undefined
  const searchDescribedBy = [
    emptySelection ? 'tool-selection-empty' : undefined,
    searchFailed ? 'tool-search-error' : undefined,
  ].filter((value): value is string => value !== undefined).join(' ')

  return (
    <fieldset className="arc-market arc-consent-fieldset" disabled={pending}>
      <legend className="arc-consent-fieldset-title">Tools</legend>
      {toolAccess === 'all_admitted' ? (
        <RadioGroup
          value={approvedToolAccess}
          onValueChange={(value) => onApprovedToolAccessChange(value as 'all_admitted' | 'selected_tools')}
          className="arc-consent-choice-grid"
        >
          <Label htmlFor="tools-all" className="arc-consent-choice">
            <RadioGroupItem id="tools-all" value="all_admitted" className="mt-1" />
            <span className="arc-consent-choice-copy"><span className="arc-consent-choice-title">All admitted Tools</span><span className="arc-consent-choice-description">Includes Tools admitted later.</span></span>
          </Label>
          <Label htmlFor="tools-selected" className="arc-consent-choice">
            <RadioGroupItem id="tools-selected" value="selected_tools" className="mt-1" />
            <span className="arc-consent-choice-copy"><span className="arc-consent-choice-title">Selected Tools</span><span className="arc-consent-choice-description">Limit this Agent to exact current Tool references.</span></span>
          </Label>
        </RadioGroup>
      ) : (
        <p className="arc-consent-description">The caller requested selected Tools. You may approve a non-empty subset, but cannot broaden it.</p>
      )}
      {approvedToolAccess === 'selected_tools' ? (
        <div className="arc-consent-field-group">
          {emptySelection ? (
            <Alert id="tool-selection-empty" tabIndex={-1} variant="destructive">
              <AlertTitle>Select at least one Tool</AlertTitle>
              <AlertDescription>Selected access cannot be empty.</AlertDescription>
            </Alert>
          ) : (
            <ul className="arc-consent-records" aria-label="Approved Tools">
              {approvedToolRefs.map((toolRef) => (
                <li key={toolRef} className="arc-consent-record">
                  <Link
                    to="/tools/$toolRef"
                    params={{ toolRef }}
                    title={toolRef}
                    className="arc-consent-record-link"
                  >
                    {toolRef}
                  </Link>
                  <Button type="button" variant="secondary" onClick={() => onRemoveApprovedTool(toolRef)}>Remove</Button>
                </li>
              ))}
            </ul>
          )}
          {toolAccess === 'all_admitted' ? (
            <div className="arc-consent-field-group">
              <Label htmlFor="tool-search">Find an admitted Tool</Label>
              <div className="arc-consent-search-row">
                <Input
                  id="tool-search"
                  className="arc-consent-input"
                  value={toolQuery}
                  onChange={(event) => onToolQueryChange(event.target.value)}
                  aria-invalid={emptySelection || searchFailed || undefined}
                  {...(searchDescribedBy.length === 0 ? {} : { 'aria-describedby': searchDescribedBy })}
                  onKeyDown={(event) => {
                    if (event.key !== 'Enter') return
                    event.preventDefault()
                    void onFindTools()
                  }}
                />
                <Button type="button" variant="secondary" disabled={toolSearch.pending || toolQuery.trim().length === 0} onClick={() => void onFindTools()}>
                  {toolSearch.pending ? 'Searching…' : 'Search Tools'}
                </Button>
              </div>
              {toolSearch.error === undefined ? null : <p id="tool-search-error" role="alert" className="arc-consent-search-error">{toolSearch.error}</p>}
              {toolSearch.noMatchMessage === undefined ? null : <p role="status" className="arc-consent-description">{toolSearch.noMatchMessage}</p>}
              {toolSearch.continuation === undefined ? null : (
                <Button type="button" variant="secondary" disabled={toolSearch.pending || toolQuery.trim() !== toolSearch.continuation.query} onClick={onContinueSearch}>
                  Next page
                </Button>
              )}
              {toolSearch.results === undefined ? null : (
                <ul className="arc-consent-records" aria-label="Tool search results">
                  {toolSearch.results.map((item) => (
                      <li key={item.toolRef} className="arc-consent-record">
                        <span className="arc-consent-record-copy">
                          <span className="arc-consent-choice-title">{item.title}</span>
                          <span className="arc-consent-reference" title={item.toolRef}>{item.toolRef}</span>
                        </span>
                        <Button type="button" variant="secondary" disabled={approvedToolRefSet.has(item.toolRef)} onClick={() => onAddApprovedTool(item.toolRef)}>
                          {approvedToolRefSet.has(item.toolRef) ? 'Added' : 'Add'}
                        </Button>
                      </li>
                    ))}
                </ul>
              )}
            </div>
          ) : null}
        </div>
      ) : null}
    </fieldset>
  )
}
