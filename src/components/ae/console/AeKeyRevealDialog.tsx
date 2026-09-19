'use client'

import { useEffect, useRef, useState } from 'react'
import {
  AlertTriangleIcon,
  CheckIcon,
  CopyIcon,
  DownloadIcon,
  EyeIcon,
  EyeOffIcon,
} from 'lucide-react'

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
import { cn } from '@/lib/utils'
import { degrade } from '@/lib/observability/degrade'
import { toast } from '@/lib/ui/toast'
import {
  AGENT_ACCESS_SNIPPET_COPY_HINTS,
  AGENT_ACCESS_SNIPPET_DESTINATIONS,
  AGENT_ACCESS_SNIPPET_DOWNLOADS,
  buildAgentAccessConfigSnippets,
  buildAgentAccessEnvFile,
  type AgentAccessConfigSnippetId,
} from '@/modules/agent-access/config-snippets'
import type { IssuedAgentAccessReveal } from './AeConnectAgentWizardDialog'

const MASKED_SECRET_DISPLAY = '••••••••••••••••'

const DOWNLOAD_ERROR_WHAT = 'Could not save the file to your computer.'
const DOWNLOAD_ERROR_FINANCIAL = 'A$0.00 deducted — your balance is safe.'
const DOWNLOAD_ERROR_NEXT = 'Copy the snippet instead, or try Download again.'

export type AeKeyRevealDialogProps = Readonly<{
  reveal: IssuedAgentAccessReveal | undefined
  open: boolean
  onOpenChange: (open: boolean) => void
  canonicalBaseUrl?: string
  connectionStatus?: 'waiting' | 'verified'
}>

export function AeKeyRevealDialog({
  reveal,
  open,
  onOpenChange,
  canonicalBaseUrl,
  connectionStatus = 'waiting',
}: AeKeyRevealDialogProps) {
  const [acknowledged, setAcknowledged] = useState(false)
  const [copiedSecret, setCopiedSecret] = useState(false)
  const [copySecretFailed, setCopySecretFailed] = useState(false)
  const [secretVisible, setSecretVisible] = useState(false)
  const [dismissBlocked, setDismissBlocked] = useState(false)
  const [activeTab, setActiveTab] = useState<AgentAccessConfigSnippetId>('cursor')
  const [downloadStatus, setDownloadStatus] = useState('')
  const [downloadFailed, setDownloadFailed] = useState(false)
  const acknowledgeCheckboxRef = useRef<HTMLButtonElement>(null)
  const dismissBlockedTimeoutRef = useRef<number | undefined>(undefined)

  useEffect(() => {
    setAcknowledged(false)
    setCopiedSecret(false)
    setCopySecretFailed(false)
    setSecretVisible(false)
    setDismissBlocked(false)
    setActiveTab('cursor')
    setDownloadStatus('')
    setDownloadFailed(false)
  }, [reveal?.keyId])

  useEffect(() => {
    if (acknowledged) {
      setDismissBlocked(false)
    }
  }, [acknowledged])

  useEffect(
    () => () => {
      window.clearTimeout(dismissBlockedTimeoutRef.current)
    },
    [],
  )

  const triggerDismissBlocked = () => {
    setDismissBlocked(true)
    acknowledgeCheckboxRef.current?.focus()
    window.clearTimeout(dismissBlockedTimeoutRef.current)
    dismissBlockedTimeoutRef.current = window.setTimeout(() => {
      setDismissBlocked(false)
    }, 1500)
  }

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

  const redactSnippet = (snippet: string) => snippet.replaceAll(reveal.secret, MASKED_SECRET_DISPLAY)

  const environmentLabel = reveal.environment === 'sandbox' ? 'Sandbox' : 'Production'
  const environmentBadgeVariant = reveal.environment === 'sandbox' ? 'secondary' : 'warning'

  const handleCopySecret = async () => {
    try {
      await navigator.clipboard.writeText(reveal.secret)
      setCopiedSecret(true)
      setCopySecretFailed(false)
      setTimeout(() => setCopiedSecret(false), 2000)
      toast.success('Copied to clipboard — save this secret; it will not be shown again.')
    } catch (cause) {
      setCopySecretFailed(true)
      setCopiedSecret(false)
      degrade(cause, undefined, { site: 'AeKeyRevealDialog.copySecret', reason: 'source_unavailable' })
      toast.error('Copy failed')
    }
  }

  const handleOpenChange = (next: boolean) => {
    if (!next && !acknowledged) {
      triggerDismissBlocked()
      return
    }
    onOpenChange(next)
  }

  const blockDismissInteraction = (event: Event) => {
    if (!acknowledged) {
      event.preventDefault()
      triggerDismissBlocked()
    }
  }

  const secretCopyStatusMessage = copiedSecret
    ? 'Copied to clipboard — save this secret; it will not be shown again.'
    : copySecretFailed
      ? 'Copy failed. Select the secret and copy it manually.'
      : ''

  const snippetCopyProps = (snippet: string) =>
    secretVisible
      ? { code: snippet }
      : { code: redactSnippet(snippet), copyText: snippet }

  const handleDownloadSnippet = () => {
    const meta = AGENT_ACCESS_SNIPPET_DOWNLOADS[activeTab]
    const content =
      activeTab === 'cursor'
        ? snippets.cursor
        : buildAgentAccessEnvFile({
            secret: reveal.secret,
            canonicalBaseUrl: effectiveOrigin,
          })

    try {
      const blob = new Blob([content], { type: meta.mime })
      const objectUrl = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = objectUrl
      anchor.download = meta.filename
      anchor.style.display = 'none'
      document.body.append(anchor)
      anchor.click()
      anchor.remove()
      URL.revokeObjectURL(objectUrl)

      const successMessage =
        activeTab === 'cursor'
          ? 'Downloaded mcp.json — drop it into .cursor/mcp.json'
          : 'Downloaded .env — add it to your project root'
      setDownloadFailed(false)
      setDownloadStatus(successMessage)
      toast.success(successMessage)
    } catch (cause) {
      setDownloadFailed(true)
      setDownloadStatus(`${DOWNLOAD_ERROR_WHAT} ${DOWNLOAD_ERROR_FINANCIAL} ${DOWNLOAD_ERROR_NEXT}`)
      degrade(cause, undefined, { site: 'AeKeyRevealDialog.downloadSnippet', reason: 'source_unavailable' })
      toast.error(`${DOWNLOAD_ERROR_WHAT} ${DOWNLOAD_ERROR_FINANCIAL} ${DOWNLOAD_ERROR_NEXT}`)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className={cn(
          'sm:max-w-[620px] max-h-[90vh] overflow-y-auto',
          dismissBlocked && 'ring-2 ring-warning-ring',
        )}
        data-slot="dialog-content"
        onPointerDownOutside={blockDismissInteraction}
        onEscapeKeyDown={blockDismissInteraction}
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
            <AlertTitle>This secret will never be shown again.</AlertTitle>
            <AlertDescription>
              This secret will never be shown again. Store it securely.
            </AlertDescription>
          </Alert>

          <div className="grid gap-1.5">
            <Label className="text-xs text-muted-foreground">Secret key</Label>
            <div className="flex items-center gap-2">
              <div
                className="h-10 min-w-0 flex-1 overflow-x-auto whitespace-nowrap rounded-md border bg-muted/40 px-3 flex items-center font-mono text-xs tabular-nums text-foreground"
              >
                {secretVisible ? (
                  <code className="select-all">{reveal.secret}</code>
                ) : (
                  <span className="tracking-wide" aria-hidden="true">{MASKED_SECRET_DISPLAY}</span>
                )}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="shrink-0 min-h-touch min-w-touch enabled:active:scale-[0.98] transition-transform duration-100 ease-out"
                aria-label={secretVisible ? 'Hide secret' : 'Show secret'}
                aria-pressed={secretVisible}
                onClick={() => setSecretVisible((visible) => !visible)}
              >
                {secretVisible ? (
                  <EyeOffIcon className="size-4" aria-hidden="true" />
                ) : (
                  <EyeIcon className="size-4" aria-hidden="true" />
                )}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="shrink-0 min-h-touch min-w-touch enabled:active:scale-[0.98] transition-transform duration-100 ease-out motion-reduce:transition-none motion-reduce:active:scale-100"
                aria-label={copiedSecret ? 'Secret key copied' : 'Copy secret key'}
                onClick={() => void handleCopySecret()}
              >
                <span className="relative size-4">
                  <CopyIcon
                    aria-hidden="true"
                    className={cn(
                      'absolute inset-0 size-4 transition-[opacity,transform] duration-base ease-standard motion-reduce:transition-none',
                      copiedSecret ? 'scale-[0.25] opacity-0 blur-[4px]' : 'scale-100 opacity-100 blur-0',
                    )}
                  />
                  <CheckIcon
                    aria-hidden="true"
                    className={cn(
                      'absolute inset-0 size-4 text-success transition-[opacity,transform] duration-base ease-standard motion-reduce:transition-none',
                      copiedSecret ? 'scale-100 opacity-100 blur-0' : 'scale-[0.25] opacity-0 blur-[4px]',
                    )}
                  />
                </span>
              </Button>
            </div>
            <p
              role="status"
              aria-live="polite"
              className={cn(
                'min-h-4 text-xs',
                copySecretFailed ? 'text-destructive' : 'text-muted-foreground',
              )}
            >
              {secretCopyStatusMessage}
            </p>
          </div>

          <div className="grid gap-2 pt-2">
            <Label className="text-xs font-medium text-foreground">Quickstart configuration</Label>
            <Tabs
              value={activeTab}
              onValueChange={(value) => {
                setActiveTab(value as AgentAccessConfigSnippetId)
                setDownloadStatus('')
                setDownloadFailed(false)
              }}
              className="w-full"
            >
              <TabsList className="grid grid-cols-4 w-full">
                <TabsTrigger
                  value="cursor"
                  className="enabled:active:scale-[0.98] transition-transform duration-100 ease-out motion-reduce:transition-none"
                >
                  Cursor
                </TabsTrigger>
                <TabsTrigger
                  value="claude"
                  className="enabled:active:scale-[0.98] transition-transform duration-100 ease-out motion-reduce:transition-none"
                >
                  Claude Code
                </TabsTrigger>
                <TabsTrigger
                  value="python"
                  className="enabled:active:scale-[0.98] transition-transform duration-100 ease-out motion-reduce:transition-none"
                >
                  Python
                </TabsTrigger>
                <TabsTrigger
                  value="curl"
                  className="enabled:active:scale-[0.98] transition-transform duration-100 ease-out motion-reduce:transition-none"
                >
                  cURL
                </TabsTrigger>
              </TabsList>

              <p className="min-h-8 pt-2 text-xs text-muted-foreground">
                {AGENT_ACCESS_SNIPPET_DESTINATIONS[activeTab]}
              </p>

              <div className="min-h-72 overflow-y-auto rounded-md">
                <TabsContent value="cursor" className="mt-0">
                  <AeCopyCommand
                    label="Cursor configuration"
                    {...snippetCopyProps(snippets.cursor)}
                    comfortable
                    prompt={false}
                    copiedHint={AGENT_ACCESS_SNIPPET_COPY_HINTS.cursor}
                  />
                </TabsContent>

                <TabsContent value="claude" className="mt-0">
                  <AeCopyCommand
                    label="Claude Code command"
                    {...snippetCopyProps(snippets.claude)}
                    comfortable
                    copiedHint={AGENT_ACCESS_SNIPPET_COPY_HINTS.claude}
                  />
                </TabsContent>

                <TabsContent value="python" className="mt-0">
                  <AeCopyCommand
                    label="Python snippet"
                    {...snippetCopyProps(snippets.python)}
                    comfortable
                    prompt={false}
                    copiedHint={AGENT_ACCESS_SNIPPET_COPY_HINTS.python}
                  />
                </TabsContent>

                <TabsContent value="curl" className="mt-0">
                  <AeCopyCommand
                    label="cURL request"
                    {...snippetCopyProps(snippets.curl)}
                    comfortable
                    copiedHint={AGENT_ACCESS_SNIPPET_COPY_HINTS.curl}
                  />
                </TabsContent>
              </div>

              <div className="flex min-h-10 items-center justify-between pt-1">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="gap-1.5 min-h-touch enabled:active:scale-[0.98] transition-transform duration-100 ease-out motion-reduce:transition-none motion-reduce:active:scale-100"
                  onClick={handleDownloadSnippet}
                >
                  <DownloadIcon className="size-4" aria-hidden="true" />
                  {AGENT_ACCESS_SNIPPET_DOWNLOADS[activeTab].label}
                </Button>
              </div>

              <p
                role="status"
                aria-live="polite"
                className={cn(
                  'min-h-4 text-xs',
                  downloadFailed ? 'text-destructive' : 'text-muted-foreground',
                )}
              >
                {downloadStatus}
              </p>
            </Tabs>
          </div>

          <div
            role="status"
            aria-live="polite"
            className="flex min-h-14 items-start gap-2.5 rounded-md border border-border bg-muted/30 px-3 py-2.5"
          >
            {connectionStatus === 'waiting' ? (
              <>
                <span className="relative flex size-2 mt-1.5">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-warning-foreground opacity-75 motion-reduce:animate-none" />
                  <span className="relative inline-flex size-2 rounded-full bg-warning-foreground" />
                </span>
                <div className="grid gap-0.5">
                  <p className="text-sm font-medium text-foreground">
                    Waiting for first Call from {reveal.displayName}...
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Run the cURL command above or launch your agent to complete verification.
                  </p>
                </div>
              </>
            ) : (
              <>
                <span className="relative flex size-2 mt-1.5">
                  <span className="relative inline-flex size-2 rounded-full bg-success" />
                </span>
                <div className="grid gap-0.5">
                  <p className="text-sm font-medium text-foreground">
                    First request received from {reveal.displayName}.
                  </p>
                  <p className="text-xs text-muted-foreground">
                    You can save the secret and close this dialog.
                  </p>
                </div>
              </>
            )}
          </div>

          <div
            className={cn(
              'flex items-center gap-2 pt-3 border-t rounded-md',
              dismissBlocked && 'ring-2 ring-warning-ring ring-offset-2 ring-offset-background',
            )}
          >
            <Checkbox
              id="agent-access-key-saved"
              ref={acknowledgeCheckboxRef}
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
          {dismissBlocked ? (
            <p role="alert" className="text-xs text-warning-foreground">
              Confirm you have saved the secret before closing.
            </p>
          ) : null}
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
