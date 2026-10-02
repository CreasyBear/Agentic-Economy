import { useEffect, useRef, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { AeAgentSecurityHistory } from '@/components/ae/agent-access/AeAgentSecurityHistory'
import { AeAgentOperatorConsole } from '@/components/ae/console/agent-operator-console/AeAgentOperatorConsole'
import { AeAssistantInstallFunnel } from '@/components/ae/console/AeAssistantInstallFunnel'
import { AeOperatorPage } from '@/components/ae/layout/AeOperatorPage'
import { Button } from '@/components/arc/button/button'
import arcButton from '@/components/arc/button/button.module.css'

import type { AeAgentAccessHomeProps } from './agent-access-home.contracts'
import { HomeAddAnotherAgent } from './components/HomeAddAnotherAgent'
import { HomeDirectoryPagination } from './components/HomeDirectoryPagination'
import { HomeDirectoryRecoveryAlert } from './components/HomeDirectoryRecoveryAlert'
import { HomeEmptyInstallPanel } from './components/HomeEmptyInstallPanel'
import { HomeLifecycleIssueAlert } from './components/HomeLifecycleIssueAlert'
import { HomeResumeToolSection } from './components/HomeResumeToolSection'
import { useAeAgentAccessHome, type AgentConnectionStep } from './useAeAgentAccessHome'
import './AgentHomeComposition.css'

export function AeAgentAccessHome(props: AeAgentAccessHomeProps) {
  const vm = useAeAgentAccessHome(props)
  const { directory, search } = vm
  const [connectMode, setConnectMode] = useState<AgentConnectionStep>(search.setup ?? 'closed')
  const choiceRef = useRef<HTMLDivElement>(null)
  const setupRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setConnectMode(search.setup ?? 'closed')
  }, [search.setup])

  useEffect(() => {
    if (connectMode === 'choose') choiceRef.current?.focus()
    if (connectMode === 'oauth') setupRef.current?.focus()
  }, [connectMode])

  const moveSetup = (step: AgentConnectionStep) => {
    setConnectMode(step)
    vm.onSetupStep(step)
  }
  const chooseConnection = () => moveSetup('choose')
  const focusOauthSetup = () => moveSetup('oauth')

  return (
    <AeOperatorPage
      operatorRole="owner"
      title="Agents"
      description="Connect Agents, review requests, and control what each Agent can do."
      currentPath="/agent-access"
    >
      <div className="arc-market arc-agent-home">
        <div className="arc-agent-home-actions">
          <Link to="/owner/settings/agent-keys" className={`${arcButton.button} ${arcButton.secondary} ${arcButton.md}`}>Manage Agent keys</Link>
        </div>
        {vm.directoryError === undefined ? null : (
          <HomeDirectoryRecoveryAlert
            title={vm.directoryAlertTitle}
            message={vm.directoryError}
            retryLabel={vm.directoryRetryLabel}
            loading={vm.loading}
            onRetry={vm.onDirectoryRetry}
          />
        )}
        {vm.lifecycleIssue === undefined ? null : (
          <HomeLifecycleIssueAlert
            issue={vm.lifecycleIssue}
            retryLabel={vm.lifecycleRetryLabel}
            retryDisabled={vm.lifecyclePending !== undefined}
            onRetry={vm.onLifecycleRetry}
          />
        )}
        {connectMode === 'choose' ? (
          <div ref={choiceRef} tabIndex={-1} className="arc-market arc-agent-connect-choice" aria-label="Choose how to connect an Agent">
            <h2 className="arc-agent-connect-title">Connect an Agent</h2>
            <p className="arc-agent-connect-description">Choose the connection you will use. Both paths require your approval before an Agent can act.</p>
            <div className="arc-agent-connect-actions">
              <Button type="button" onClick={focusOauthSetup}>Connect with OAuth / MCP</Button>
              <Link to="/owner/settings/agent-keys" search={{ issue: 'manual' }} className={`${arcButton.button} ${arcButton.secondary} ${arcButton.md}`}>Issue a manual key</Link>
              <Button type="button" variant="ghost" onClick={() => moveSetup('closed')}>Cancel</Button>
            </div>
          </div>
        ) : null}
        {directory.items.length === 0 && (search.caller === undefined || connectMode === 'oauth') ? (
          <div ref={setupRef} tabIndex={-1} className="arc-market arc-agent-install-region" aria-label="OAuth and MCP connection steps">
            <HomeEmptyInstallPanel
              canonicalBaseUrl={vm.canonicalBaseUrl}
              checkingConnection={vm.loading}
              {...(search.resumeTool === undefined ? {} : { resumeToolRef: search.resumeTool })}
              onCheckConnection={vm.onDirectoryRetry}
              onConnectNewAgent={chooseConnection}
            />
          </div>
        ) : directory.items.length === 0 || search.resumeTool === undefined ? null : (
          <HomeResumeToolSection
            title={vm.resumeSectionTitle}
            description={vm.resumeSectionDescription}
            resumeTool={search.resumeTool}
            showReturnLink={vm.hasConnectedAgent}
          />
        )}
        {directory.items.length === 0 && (search.caller === undefined || connectMode === 'oauth') ? null : (
          <AeAgentOperatorConsole
            directory={directory}
            loading={vm.loading}
            {...(search.caller === undefined ? {} : { selectedPrincipalId: search.caller })}
            getAgentHref={vm.getAgentHref}
            onClearSelectedPrincipal={vm.clearSelectedPrincipal}
            onDisconnectAgent={vm.onDisconnectAgent}
            onDisconnectConnection={vm.onDisconnectConnection}
            onRenameAgent={vm.onRenameAgent}
            onUpdateSpendingLimits={vm.onUpdateSpendingLimits}
            onReadSpendingLimits={vm.onReadSpendingLimits}
            onConnectNewAgent={chooseConnection}
            {...(vm.agentHistoryPrincipalRef === undefined
              ? {}
              : { agentHistory: <AeAgentSecurityHistory key={vm.agentHistoryPrincipalRef} principalRef={vm.agentHistoryPrincipalRef} /> })}
            {...(vm.lifecyclePending === undefined ? {} : { lifecyclePending: vm.lifecyclePending })}
            accessUnavailable={vm.accessUnavailable}
            approvals={vm.approvals}
            approvalsLoading={vm.approvalsLoading}
            {...(vm.approvalsError === undefined ? {} : { approvalsError: vm.approvalsError })}
            {...(vm.approvalDecision === undefined ? {} : { approvalDecision: vm.approvalDecision })}
            {...(vm.approvalStatus === undefined ? {} : { approvalStatus: vm.approvalStatus })}
            onRetryApprovals={vm.onRetryApprovals}
            onDecideApproval={vm.onDecideApproval}
          />
        )}
        {directory.nextCursor === undefined ? null : (
          <HomeDirectoryPagination
            showIssueMessage={vm.currentPaginationIssue}
            buttonLabel={vm.paginationButtonLabel}
            loadingMore={vm.loadingMore}
            onLoadMore={vm.loadMore}
          />
        )}
        {directory.items.length === 0 ? null : (
          <HomeAddAnotherAgent
            showSetup={connectMode === 'oauth'}
            toggleLabel={connectMode === 'oauth' ? 'Hide setup' : 'Connect an Agent'}
            onToggle={connectMode === 'oauth' ? () => moveSetup('closed') : chooseConnection}
            installPanel={(
              <div ref={setupRef} tabIndex={-1} className="arc-market arc-agent-install-region" aria-label="OAuth and MCP connection steps">
                <AeAssistantInstallFunnel
                  canonicalBaseUrl={vm.canonicalBaseUrl}
                  checkingConnection={vm.loading}
                  onCheckConnection={vm.onDirectoryRetry}
                  hideSelfLinks
                  {...(search.resumeTool === undefined ? {} : { resumeToolRef: search.resumeTool })}
                />
              </div>
            )}
          />
        )}
      </div>
    </AeOperatorPage>
  )
}
