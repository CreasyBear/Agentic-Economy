'use client'

import { useEffect, useRef, useState } from 'react'
import type { ComponentProps } from 'react'
import {
  CheckIcon,
  CopyIcon,
  DownloadIcon,
  EyeIcon,
  EyeOffIcon,
} from 'lucide-react'

import { Button } from '@/components/arc/button/button'
import { Drawer, DrawerContent } from '@/components/ae/shared/base-ui/drawer/drawer'
import { AeAlert } from '@/components/ae/shared/alert/AeAlert'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ae/shared/base-ui/tabs/tabs'
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
import type { IssuedAgentAccessReveal } from '@/modules/agent-access/issue-key.contracts'

import './KeyRevealComposition.css'

const MASKED_SECRET_DISPLAY = '••••••••••••••••'

const DOWNLOAD_ERROR_WHAT = 'Could not save the file to your computer.'
const DOWNLOAD_ERROR_FINANCIAL = 'Downloading a setup file makes no purchase. Your Balance is unaffected.'
const DOWNLOAD_ERROR_NEXT = 'Copy the snippet instead, or try Download again.'

export type AeKeyRevealDialogProps = Readonly<{
  reveal: IssuedAgentAccessReveal | undefined
  open: boolean
  onOpenChange: (open: boolean) => void
  canonicalBaseUrl?: string
  onContinueSetup?: () => void
}>

export function AeKeyRevealDialog({
  reveal,
  open,
  onOpenChange,
  canonicalBaseUrl,
  onContinueSetup,
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
  const handleCopySecret = async () => {
    try {
      await navigator.clipboard.writeText(reveal.secret)
      setCopiedSecret(true)
      setCopySecretFailed(false)
      setTimeout(() => setCopiedSecret(false), 2000)
      toast.success('Copied to clipboard. Save this secret; it will not be shown again.')
    } catch (cause) {
      setCopySecretFailed(true)
      setCopiedSecret(false)
      degrade(cause, undefined, { site: 'AeKeyRevealDialog.copySecret', reason: 'source_unavailable' })
      toast.error('Copy failed')
    }
  }

  const handleOpenChange: NonNullable<ComponentProps<typeof Drawer>['onOpenChange']> = (next, details) => {
    if (!next && !acknowledged) {
      details.cancel()
      triggerDismissBlocked()
      return
    }
    onOpenChange(next)
  }

  const secretCopyStatusMessage = copiedSecret
    ? 'Copied to clipboard. Save this secret; it will not be shown again.'
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
          ? 'Downloaded mcp.json. Save it as .cursor/mcp.json'
          : 'Downloaded .env. Add it to your project root'
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
    <Drawer open={open} onOpenChange={handleOpenChange}>
      <DrawerContent
        side="right"
        title="Save your secret key"
        description="Save the one-time secret and configure your client."
        className={cn(
          'arc-key-reveal-drawer',
          dismissBlocked && 'ring-2 ring-warning-ring',
        )}
        data-slot="dialog-content"
      >
        <div className="arc-key-environment-row">
          <span className="arc-key-display-name">{reveal.displayName}</span>
          <span className="arc-key-environment" data-environment={reveal.environment}>
            {environmentLabel}
          </span>
        </div>

        <div data-ae-key-reveal-scroll className="arc-key-reveal-scroll overflow-y-auto">
          <AeAlert role="alert" tone="warning" title="This secret will never be shown again.">
              Store it securely.
            </AeAlert>

          <div className="arc-key-secret-group">
            <Label className="arc-key-secret-label">Secret key</Label>
            <div className="arc-key-secret-actions">
              <div className="arc-key-secret-value">
                {secretVisible ? (
                  <code className="arc-key-secret-revealed">{reveal.secret}</code>
                ) : (
                  <span className="arc-key-secret-masked" aria-hidden="true">{MASKED_SECRET_DISPLAY}</span>
                )}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="md"
                className="arc-key-icon-button"
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
                size="md"
                className="arc-key-icon-button"
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
                'arc-key-status',
                copySecretFailed && 'arc-key-status-error',
              )}
            >
              {secretCopyStatusMessage}
            </p>
          </div>

          <div className="arc-key-quickstart">
            <Label className="arc-key-quickstart-label">Quickstart configuration</Label>
            <Tabs
              value={activeTab}
              onValueChange={(value) => {
                setActiveTab(value as AgentAccessConfigSnippetId)
                setDownloadStatus('')
                setDownloadFailed(false)
              }}
              animateContent={false}
              className="arc-key-tabs"
            >
              <TabsList className="arc-key-tab-list">
                <TabsTrigger
                  value="cursor"
                  className="arc-key-tab"
                >
                  Cursor
                </TabsTrigger>
                <TabsTrigger
                  value="claude"
                  className="arc-key-tab"
                >
                  Claude Code
                </TabsTrigger>
                <TabsTrigger
                  value="python"
                  className="arc-key-tab"
                >
                  Python
                </TabsTrigger>
                <TabsTrigger
                  value="curl"
                  className="arc-key-tab"
                >
                  cURL
                </TabsTrigger>
              </TabsList>

              <p className="arc-key-tab-destination">
                {AGENT_ACCESS_SNIPPET_DESTINATIONS[activeTab]}
              </p>

              <div className="arc-key-snippet-region min-h-72">
                <TabsContent value="cursor" className="arc-key-tab-content">
                  <AeCopyCommand
                    label="Cursor configuration"
                    {...snippetCopyProps(snippets.cursor)}
                    comfortable
                    prompt={false}
                    copiedHint={AGENT_ACCESS_SNIPPET_COPY_HINTS.cursor}
                  />
                </TabsContent>

                <TabsContent value="claude" className="arc-key-tab-content">
                  <AeCopyCommand
                    label="Claude Code command"
                    {...snippetCopyProps(snippets.claude)}
                    comfortable
                    copiedHint={AGENT_ACCESS_SNIPPET_COPY_HINTS.claude}
                  />
                </TabsContent>

                <TabsContent value="python" className="arc-key-tab-content">
                  <AeCopyCommand
                    label="Python account check"
                    {...snippetCopyProps(snippets.python)}
                    comfortable
                    prompt={false}
                    copiedHint={AGENT_ACCESS_SNIPPET_COPY_HINTS.python}
                  />
                </TabsContent>

                <TabsContent value="curl" className="arc-key-tab-content">
                  <AeCopyCommand
                    label="cURL request"
                    {...snippetCopyProps(snippets.curl)}
                    comfortable
                    copiedHint={AGENT_ACCESS_SNIPPET_COPY_HINTS.curl}
                  />
                </TabsContent>
              </div>

              <div className="arc-key-download-row">
                <Button
                  type="button"
                  variant="secondary"
                  size="md"
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
                  'arc-key-status',
                  downloadFailed && 'arc-key-status-error',
                )}
              >
                {downloadStatus}
              </p>
            </Tabs>
          </div>

          <div
            role="status"
            aria-live="polite"
            className="arc-key-connection-status"
          >
              <>
                <span className="arc-key-connection-dot arc-key-connection-dot-warning" />
                <div className="arc-key-connection-copy">
                  <p className="arc-key-connection-title">
                    Key issued for {reveal.displayName}.
                  </p>
                  <p className="arc-key-connection-description">
                    Configure your client securely. The cURL account check verifies authentication; it makes no Tool Call. Continue in Agents to check first-use progress.
                  </p>
                </div>
              </>
          </div>
        </div>

        <div
          className={cn(
            'arc-key-ack-row',
            dismissBlocked && 'rounded-sm ring-2 ring-warning-ring ring-offset-2 ring-offset-background',
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
            className="arc-key-ack-label"
          >
            I have saved my secret key securely
          </Label>
        </div>
        {dismissBlocked ? (
          <p role="alert" className="arc-key-dismiss-alert">
            Confirm you have saved the secret before closing.
          </p>
        ) : null}

        <div className="arc-key-footer">
          <Button
            type="button"
            variant="primary"
            size="md"
            disabled={!acknowledged}
            onClick={() => { onOpenChange(false); onContinueSetup?.() }}
          >
            {onContinueSetup === undefined ? 'Done' : 'Continue in Agents'}
          </Button>
        </div>
      </DrawerContent>
    </Drawer>
  )
}
