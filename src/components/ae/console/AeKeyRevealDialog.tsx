'use client'

import { useEffect, useState } from 'react'
import { AlertTriangleIcon, CheckIcon, CopyIcon } from 'lucide-react'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
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
import {
  AGENT_ACCESS_SNIPPET_COPY_HINTS,
  AGENT_ACCESS_SNIPPET_DESTINATIONS,
  buildAgentAccessConfigSnippets,
} from '@/modules/agent-access/config-snippets'
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

  const environmentLabel = reveal.environment === 'sandbox' ? 'Sandbox' : 'Production'
  const environmentBadgeVariant = reveal.environment === 'sandbox' ? 'secondary' : 'warning'

  const handleCopySecret = async () => {
    try {
      await navigator.clipboard.writeText(reveal.secret)
      setCopiedSecret(true)
      setTimeout(() => setCopiedSecret(false), 2000)
      toast.success('Copied to clipboard — save this secret; it will not be shown again.')
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
            Step 2 of 2 · Save & install
          </DialogDescription>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <span className="text-sm text-muted-foreground">{reveal.displayName}</span>
            <Badge variant={environmentBadgeVariant}>{environmentLabel}</Badge>
          </div>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <Alert className="border-warning-ring bg-warning-subtle text-warning-foreground">
            <AlertTriangleIcon className="size-4" />
            <AlertTitle>Save this secret key securely</AlertTitle>
            <AlertDescription>
              Save this secret key securely. You will not be able to view it again.
            </AlertDescription>
          </Alert>

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
                  {AGENT_ACCESS_SNIPPET_DESTINATIONS.cursor}
                </p>
                <AeCopyCommand
                  label="Cursor configuration"
                  code={snippets.cursor}
                  comfortable
                  prompt={false}
                  copiedHint={AGENT_ACCESS_SNIPPET_COPY_HINTS.cursor}
                />
              </TabsContent>

              <TabsContent value="claude" className="pt-2">
                <p className="text-xs text-muted-foreground mb-2">
                  {AGENT_ACCESS_SNIPPET_DESTINATIONS.claude}
                </p>
                <AeCopyCommand
                  label="Claude Code command"
                  code={snippets.claude}
                  comfortable
                  copiedHint={AGENT_ACCESS_SNIPPET_COPY_HINTS.claude}
                />
              </TabsContent>

              <TabsContent value="python" className="pt-2">
                <p className="text-xs text-muted-foreground mb-2">
                  {AGENT_ACCESS_SNIPPET_DESTINATIONS.python}
                </p>
                <AeCopyCommand
                  label="Python snippet"
                  code={snippets.python}
                  comfortable
                  prompt={false}
                  copiedHint={AGENT_ACCESS_SNIPPET_COPY_HINTS.python}
                />
              </TabsContent>

              <TabsContent value="curl" className="pt-2">
                <p className="text-xs text-muted-foreground mb-2">
                  {AGENT_ACCESS_SNIPPET_DESTINATIONS.curl}
                </p>
                <AeCopyCommand
                  label="cURL request"
                  code={snippets.curl}
                  comfortable
                  copiedHint={AGENT_ACCESS_SNIPPET_COPY_HINTS.curl}
                />
              </TabsContent>
            </Tabs>
          </div>

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
