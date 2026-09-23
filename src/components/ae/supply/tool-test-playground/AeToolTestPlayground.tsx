import { AeSection } from '@/components/ae/layout/AeSection'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

import { JsonPayloadEditor } from './components/JsonPayloadEditor'
import { PlaygroundResponsePane } from './components/PlaygroundResponsePane'
import type { AeToolTestPlaygroundProps } from './tool-test-playground.contracts'
import { TACTILE } from './tool-test-playground.contracts'
import { mapHttpStatus } from './tool-test-payload'
import { useToolTestPlayground } from './useToolTestPlayground'

export { TACTILE } from './tool-test-playground.contracts'
export type { AeToolTestPlaygroundProps } from './tool-test-playground.contracts'

export function AeToolTestPlayground({
  toolName,
  inputSchema,
  onSendTestRequest,
}: AeToolTestPlaygroundProps) {
  const {
    inputJson,
    setInputJson,
    diagnostic,
    parseError,
    isRunning,
    response,
    hasCopied,
    handleCopy,
    handleLoadExamples,
    handleResetDefaults,
    handleSend,
  } = useToolTestPlayground({
    ...(inputSchema !== undefined ? { inputSchema } : {}),
    ...(onSendTestRequest !== undefined ? { onSendTestRequest } : {}),
  })

  return (
    <AeSection
      title="Interactive test playground"
      description={`Zero-cost sandbox probe for ${toolName}. Validates input against the declared schema, calls the provider endpoint in simulation mode, and never creates Quotes, Charges, or buyer balance movements.`}
    >
      <div className="grid gap-4 rounded-xl border border-border bg-card p-4">
        <div
          role="status"
          className="flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-foreground"
        >
          Simulation mode: Zero credit deducted. Sandbox dry-run probes never create Quotes, Charges,
          or debits.
        </div>

        <JsonPayloadEditor
          inputJson={inputJson}
          onInputJsonChange={setInputJson}
          parseError={parseError}
          {...(diagnostic !== undefined ? { diagnostic } : {})}
          isRunning={isRunning}
          onLoadExamples={handleLoadExamples}
          onResetDefaults={handleResetDefaults}
        />

        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={handleSend}
            disabled={isRunning}
            className={cn('min-h-touch', TACTILE)}
          >
            {isRunning ? 'Rechecking…' : 'Recheck source'}
          </Button>
          <div className="min-h-[1.75rem] flex items-center gap-2 text-xs">
            {response ? (
              <>
                {response.status >= 200 && response.status < 300 ? (
                  <Badge variant="success">{response.status} OK</Badge>
                ) : (
                  <Badge variant="destructive">{mapHttpStatus(response.status)}</Badge>
                )}
                <Badge variant="outline" className="font-mono tabular-nums">
                  ⚡ {response.latencyMs}ms
                </Badge>
              </>
            ) : null}
          </div>
        </div>

        <PlaygroundResponsePane
          {...(response !== undefined ? { response } : {})}
          hasCopied={hasCopied}
          onCopy={() => {
            void handleCopy()
          }}
        />
      </div>
    </AeSection>
  )
}
