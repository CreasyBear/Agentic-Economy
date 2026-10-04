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
import { HomeLifecycleIssueAlert } from './components/HomeLifecycleIssueAlert'
import { HomeResumeToolSection } from './components/HomeResumeToolSection'
import { HomeOnboardingRequestSection } from './components/HomeOnboardingRequestSection'
import { useAeAgentAccessHome, type AgentConnectionStep } from './useAeAgentAccessHome'
import './AgentHomeComposition.css'

export function AeAgentAccessHome(props: AeAgentAccessHomeProps) {
  const vm = useAeAgentAccessHome(props)
  const { directory, search } = vm
  const [connectMode, setConnectMode] = useState<AgentConnectionStep>(search.setup ?? 'closed')
  const setupRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setConnectMode(search.setup ?? 'closed')
  }, [search.setup])

  useEffect(() => {
    if (connectMode !== 'closed') setupRef.current?.focus()
  }, [connectMode])

  const moveSetup = (step: AgentConnectionStep) => {
    setConnectMode(step)
    vm.onSetupStep(step)
  }
  const chooseConnection = () => moveSetup('oauth')
  const hasRequest = search.grantRef !== undefined || search.userCode !== undefined || search.requestInvalid === true
  const callBlocked = search.callInvalid === true
  const requestBlocked = callBlocked || search.requestInvalid === true || vm.onboarding?.kind === 'refused' && vm.onboarding.reason !== 'not_found'
  const requestAgent = vm.onboarding?.kind === 'request' ? vm.onboarding.principalRef : search.caller
  const requestFinished = vm.onboarding?.kind === 'request' && (vm.onboarding.phase === 'expired' || vm.onboarding.phase === 'denied')
  const showProgress = !requestBlocked && (!hasRequest || requestAgent !== undefined) && (!requestFinished || 'call' in vm.firstUse)
  const showInstall = !callBlocked && (connectMode !== 'closed' || (!hasRequest && directory.items.length === 0 && search.caller === undefined))

  return (
    <AeOperatorPage
      operatorRole="owner"
      title="Agents"
      description="Connect Agents, review requests, and control what each Agent can do."
      currentPath="/agent-access"
    >
      <div className="arc-market arc-agent-home">
        <p className="arc-agent-live-status" role="status" data-delayed={vm.liveUpdates === 'delayed' || undefined}>
          {vm.liveUpdates === 'delayed' ? 'Updates are delayed. Last confirmed progress is retained; checking again automatically.' : 'Live service updates every few seconds. Keep working in your Agent; this page follows recorded access and Calls.'}
        </p>
        {callBlocked ? <p className="arc-agent-first-use-fact" role="status">This Call link is incomplete or invalid. Open the original link from your Agent. Another Call will not be selected.</p> : null}
        {directory.details.some(detail => detail.usageUnavailable) ? <p className="arc-agent-first-use-fact">Monthly usage is unavailable for this reporting window. Access and the selected Call continue to update.</p> : null}
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
        {hasRequest && !callBlocked ? <HomeOnboardingRequestSection search={search} onCheck={vm.onDirectoryRetry} checking={vm.loading}
          {...(vm.onboarding === undefined ? {} : { request: vm.onboarding })} /> : null}
        {showInstall ? (
          <div ref={setupRef} tabIndex={-1} className="arc-market arc-agent-install-region" aria-label="OAuth and MCP connection steps">
            <AeAssistantInstallFunnel
              canonicalBaseUrl={vm.canonicalBaseUrl}
              checkingConnection={vm.loading}
              onCheckConnection={vm.onDirectoryRetry}
              {...(search.resumeTool === undefined ? {} : { resumeToolRef: search.resumeTool })}
            />
            {directory.items.length === 0 ? null : (
              <div className="arc-agent-known-connections">
                <p>Already approved access? Select the Agent you connected to continue.</p>
                {directory.items.map(agent => <Link key={agent.principalRef} to="/agent-access"
                  search={{ caller: agent.principalRef, ...(search.resumeTool === undefined ? {} : { resumeTool: search.resumeTool }) }}
                  title={agent.principalRef} className={`${arcButton.button} ${arcButton.secondary} ${arcButton.md} arc-agent-choice-link`}>
                  <span>{agent.displayName}</span><span>{agent.environment === 'production' ? 'Production' : 'Sandbox'} · {agent.connectorDisplayNames.join(', ') || 'Client not recorded'} · {agent.principalRef.slice(-8)}</span>
                </Link>)}
                <Button type="button" variant="ghost" onClick={() => moveSetup('closed')}>Close setup</Button>
              </div>
            )}
          </div>
        ) : showProgress ? (
          <HomeResumeToolSection search={search} firstUse={vm.firstUse} liveUpdates={vm.liveUpdates} onConnect={chooseConnection}
            onCheck={vm.onDirectoryRetry} checking={vm.loading}
            {...(search.resumeTool === undefined ? {} : { resumeTool: search.resumeTool })} />
        ) : null}
        {requestBlocked || directory.items.length === 0 && search.caller === undefined ? null : (
          <AeAgentOperatorConsole
            directory={directory}
            loading={vm.loading}
            {...(requestAgent === undefined ? {} : { selectedPrincipalId: requestAgent })}
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
        {callBlocked || directory.items.length === 0 || showInstall ? null : (
          <HomeAddAnotherAgent showSetup={false} toggleLabel="Connect an Agent" onToggle={chooseConnection} installPanel={null} />
        )}
        <div className="arc-agent-home-actions"><Link to="/owner/settings/agent-keys" className="arc-agent-install-help-link">Manage Agent keys</Link></div>
      </div>
    </AeOperatorPage>
  )
}
