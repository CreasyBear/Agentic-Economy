import { useServerFn } from '@tanstack/react-start'

import { AeAgentSecurityHistory } from '@/components/ae/agent-access/AeAgentSecurityHistory'
import { AeAgentOperatorConsole } from '@/components/ae/console/agent-operator-console/AeAgentOperatorConsole'
import { AeAssistantInstallFunnel } from '@/components/ae/console/AeAssistantInstallFunnel'
import { AeConnectAgentWizardDialog } from '@/components/ae/console/connect-agent-wizard/AeConnectAgentWizardDialog'
import { AeKeyRevealDialog } from '@/components/ae/console/AeKeyRevealDialog'
import { AeOperatorPage } from '@/components/ae/layout/AeOperatorPage'
import { issueAgentAccessKeyServer } from '@/modules/agent-access/agent-access.functions'

import type { AeAgentAccessHomeProps } from './agent-access-home.contracts'
import { HomeAddAnotherAgent } from './components/HomeAddAnotherAgent'
import { HomeDirectoryPagination } from './components/HomeDirectoryPagination'
import { HomeDirectoryRecoveryAlert } from './components/HomeDirectoryRecoveryAlert'
import { HomeEmptyInstallPanel } from './components/HomeEmptyInstallPanel'
import { HomeLifecycleIssueAlert } from './components/HomeLifecycleIssueAlert'
import { HomeResumeToolSection } from './components/HomeResumeToolSection'
import { useAeAgentAccessHome } from './useAeAgentAccessHome'

export function AeAgentAccessHome(props: AeAgentAccessHomeProps) {
  const vm = useAeAgentAccessHome(props)
  const issueAgentAccessKey = useServerFn(issueAgentAccessKeyServer)

  const { directory, search } = vm

  return (
    <AeOperatorPage
      operatorRole="owner"
      title="Agents"
      description="Connect Agents, review requests, and control what each Agent can do."
      currentPath="/agent-access"
    >
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
      {directory.items.length === 0 && search.caller === undefined ? (
        <HomeEmptyInstallPanel
          canonicalBaseUrl={vm.canonicalBaseUrl}
          checkingConnection={vm.loading}
          {...(search.resumeTool === undefined ? {} : { resumeToolRef: search.resumeTool })}
          onCheckConnection={vm.onDirectoryRetry}
          onConnectNewAgent={vm.onConnectNewAgent}
        />
      ) : directory.items.length === 0 || search.resumeTool === undefined ? null : (
        <HomeResumeToolSection
          title={vm.resumeSectionTitle}
          description={vm.resumeSectionDescription}
          resumeTool={search.resumeTool}
          showReturnLink={vm.hasConnectedAgent}
        />
      )}
      {directory.items.length === 0 && search.caller === undefined ? null : (
        <AeAgentOperatorConsole
          directory={directory}
          loading={vm.loading}
          {...(search.caller === undefined ? {} : { selectedPrincipalId: search.caller })}
          getAgentHref={vm.getAgentHref}
          onClearSelectedPrincipal={vm.clearSelectedPrincipal}
          onRevokeCredential={vm.onRevokeCredential}
          onDisconnectAgent={vm.onDisconnectAgent}
          onDisconnectConnection={vm.onDisconnectConnection}
          onRenameAgent={vm.onRenameAgent}
          onUpdateSpendingLimits={vm.onUpdateSpendingLimits}
          onReadSpendingLimits={vm.onReadSpendingLimits}
          onConnectNewAgent={vm.onConnectNewAgent}
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
          showSetup={vm.showSetup}
          toggleLabel={vm.addAnotherToggleLabel}
          onToggle={vm.onToggleShowSetup}
          installPanel={(
            <AeAssistantInstallFunnel
              canonicalBaseUrl={vm.canonicalBaseUrl}
              checkingConnection={vm.loading}
              onCheckConnection={vm.onDirectoryRetry}
              hideSelfLinks
              {...(search.resumeTool === undefined ? {} : { resumeToolRef: search.resumeTool })}
            />
          )}
        />
      )}
      <AeConnectAgentWizardDialog
        open={vm.wizardOpen}
        onOpenChange={vm.setWizardOpen}
        onIssue={issueAgentAccessKey}
        onSuccess={vm.onRevealSuccess}
      />
      <AeKeyRevealDialog
        reveal={vm.reveal}
        open={vm.reveal !== undefined}
        onOpenChange={vm.onRevealOpenChange}
        canonicalBaseUrl={vm.canonicalBaseUrl}
      />
    </AeOperatorPage>
  )
}
