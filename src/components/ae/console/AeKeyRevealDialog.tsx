'use client'

import { useEffect, useState } from 'react'
import { AlertTriangleIcon, CheckIcon, CopyIcon } from 'lucide-react'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { AeCopyCommand } from '@/components/ae/data/AeCopyCommand'
import { degrade } from '@/lib/observability/degrade'
import { toast } from '@/lib/ui/toast'
import { buildAgentAccessConfigSnippets } from '@/modules/agent-access/config-snippets'
import type { IssuedAgentAccessReveal } from './AeConnectAgentWizardDialog'

export type AeKeyRevealDialogProps = Readonly<{
  reveal: IssuedAgentAccessReveal | undefined
  open: boolean
  onOpenChange: (open: boolean) => void
  canonicalBaseUrl?: string
}>

export function AeKeyRevealDialog({
  reveal,
  open,
  onOpenChange,
  canonicalBaseUrl,
}: AeKeyRevealDialogProps) {
  const [acknowledged, setAcknowledged] = useState(false)
  const [copiedSecret, setCopiedSecret] = useState(false)

  // Reset acknowledgement when a different key is revealed
  useEffect(() => {
    setAcknowledged(false)
    setCopiedSecret(false)
  }, [reveal?.keyId])

  if (!open || reveal === undefined) {
    return null
  }

  const effectiveOrigin = canonicalBaseUrl && canonicalBaseUrl.length > 0
    ? canonicalBaseUrl
    : typeof window !== 'undefined'
      ? window.location.origin
      : 'https://market.agenticeconomy.com'

  const snippets = buildAgentAccessConfigSnippets({
    secret: reveal.secret,
    canonicalBaseUrl: effectiveOrigin,
  })

  const handleCopySecret = async () => {
    try {
      await navigator.clipboard.writeText(reveal.secret)
      setCopiedSecret(true)
      setTimeout(() => setCopiedSecret(false), 2000)
      toast.success('Secret key copied')
    } catch (cause) {
      degrade(cause, undefined, { site: 'AeKeyRevealDialog.copySecret', reason: 'source_unavailable' })
      toast.error('Copy failed')
    }
  }

  const handleOpenChange = (next: boolean) => {
    if (!next && !acknowledged) {
      return
    }
    onOpenChange(next)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="sm:max-w-[620px] max-h-[90vh] overflow-y-auto"
        data-slot="dialog-content"
      >
        <DialogHeader>
          <DialogTitle>Save your secret key</DialogTitle>
          <DialogDescription>
            {reveal.displayName} · {reveal.environment}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          {/* Warning Alert */}
          <Alert className="border-warning-ring bg-warning-subtle text-warning-foreground">
            <AlertTriangleIcon className="size-4" />
            <AlertTitle>Save this secret key securely</AlertTitle>
            <AlertDescription>
              Save this secret key securely. You will not be able to view it again.
            </AlertDescription>
          </Alert>

          {/* Monospace Plaintext Key Display */}
          <div className="grid gap-1.5">
            <Label className="text-xs text-muted-foreground">Secret key</Label>
            <div className="flex items-center justify-between gap-2 rounded-md border bg-muted/40 p-3">
              <code className="min-w-0 flex-1 break-all font-mono text-xs select-all text-foreground">
                {reveal.secret}
              </code>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="shrink-0 gap-1.5 min-h-touch"
                aria-label="Copy secret key"
                onClick={() => void handleCopySecret()}
              >
                {copiedSecret ? (
                  <>
                    <CheckIcon className="size-3.5 text-success" />
                    <span>Copied</span>
                  </>
                ) : (
                  <>
                    <CopyIcon className="size-3.5" />
                    <span>Copy</span>
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* Quick-Start Code Snippets */}
          <div className="grid gap-2 pt-2">
            <Label className="text-xs font-medium text-foreground">Quickstart configuration</Label>
            <Tabs defaultValue="cursor" className="w-full">
              <TabsList className="grid grid-cols-4 w-full">
                <TabsTrigger value="cursor">Cursor</TabsTrigger>
                <TabsTrigger value="claude">Claude Code</TabsTrigger>
                <TabsTrigger value="python">Python</TabsTrigger>
                <TabsTrigger value="curl">cURL</TabsTrigger>
              </TabsList>

              <TabsContent value="cursor" className="pt-2">
                <p className="text-xs text-muted-foreground mb-2">
                  Add to your <code className="font-mono text-[11px]">~/.cursor/mcp.json</code> file:
                </p>
                <AeCopyCommand
                  label="Cursor configuration"
                  code={snippets.cursor}
                  comfortable
                />
              </TabsContent>

              <TabsContent value="claude" className="pt-2">
                <p className="text-xs text-muted-foreground mb-2">
                  Run in your terminal to install the MCP tool:
                </p>
                <AeCopyCommand
                  label="Claude Code command"
                  code={snippets.claude}
                  comfortable
                />
              </TabsContent>

              <TabsContent value="python" className="pt-2">
                <p className="text-xs text-muted-foreground mb-2">
                  Initialize the Python client:
                </p>
                <AeCopyCommand
                  label="Python snippet"
                  code={snippets.python}
                  comfortable
                />
              </TabsContent>

              <TabsContent value="curl" className="pt-2">
                <p className="text-xs text-muted-foreground mb-2">
                  Verify credential with account whoami request:
                </p>
                <AeCopyCommand
                  label="cURL request"
                  code={snippets.curl}
                  comfortable
                />
              </TabsContent>
            </Tabs>
          </div>

          {/* Acknowledgement Checkbox */}
          <div className="flex items-center gap-2 pt-3 border-t">
            <Checkbox
              id="agent-access-key-saved"
              checked={acknowledged}
              onCheckedChange={(checked) => setAcknowledged(checked === true)}
            />
            <Label
              htmlFor="agent-access-key-saved"
              className="text-sm cursor-pointer font-medium leading-none"
            >
              I have saved my secret key securely
            </Label>
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            disabled={!acknowledged}
            onClick={() => onOpenChange(false)}
          >
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
