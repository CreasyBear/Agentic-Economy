import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

import type { JsonPayloadEditorProps } from '../tool-test-playground.contracts'
import { TACTILE } from '../tool-test-playground.contracts'

export function JsonPayloadEditor({
  inputJson,
  onInputJsonChange,
  parseError: _parseError,
  diagnostic,
  isRunning,
  onLoadExamples,
  onResetDefaults,
}: JsonPayloadEditorProps) {
  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Label htmlFor="test-input-json" className="text-sm font-semibold">
          Input parameters (JSON)
        </Label>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={cn('h-7 text-xs', TACTILE)}
            onClick={onLoadExamples}
            disabled={isRunning}
          >
            Load example arguments
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={cn('h-7 text-xs', TACTILE)}
            onClick={onResetDefaults}
            disabled={isRunning}
          >
            Reset to defaults
          </Button>
        </div>
      </div>
      <Textarea
        id="test-input-json"
        value={inputJson}
        onChange={(e) => onInputJsonChange(e.target.value)}
        rows={5}
        className="font-mono leading-relaxed"
        placeholder="{}"
        aria-label="Input parameters (JSON)"
      />
      <div className="min-h-[2.5rem]" aria-live="polite" role="status">
        {diagnostic ? (
          <Alert variant="destructive" className="py-2">
            <AlertTitle className="text-xs font-semibold">{diagnostic.whatHappened}</AlertTitle>
            <AlertDescription className="grid gap-0.5 text-xs">
              <span className="font-mono tabular-nums">{diagnostic.financialImpact}</span>
              <span>{diagnostic.nextStep}</span>
            </AlertDescription>
          </Alert>
        ) : null}
      </div>
    </div>
  )
}
