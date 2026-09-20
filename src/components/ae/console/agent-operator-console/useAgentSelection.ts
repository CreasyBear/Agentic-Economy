import { useEffect, useRef, useState } from 'react'

import type { AgentDirectoryItem } from '@/modules/agent-access/agent-operator-view-model'

import type {
  UseAgentSelectionParams,
  UseAgentSelectionResult,
} from './agent-operator-console.contracts'

export function useAgentSelection({
  directoryItems,
  directoryDetails,
  selectedPrincipalId,
  getAgentHref,
  onClearSelectedPrincipal,
}: UseAgentSelectionParams): UseAgentSelectionResult {
  const [localSelected, setLocalSelected] = useState<AgentDirectoryItem>()
  const sheetDismissHandledRef = useRef(false)
  const routeControlled = getAgentHref !== undefined
  const selectedItem = routeControlled
    ? directoryItems.find((item) => item.principalRef === selectedPrincipalId)
    : localSelected
  const selected = selectedItem === undefined
    ? undefined
    : directoryDetails.find(({ agent }) => agent.principalRef === selectedItem.principalRef)

  useEffect(() => {
    if (selected !== undefined) {
      sheetDismissHandledRef.current = false
    }
  }, [selected])

  function handleSheetOpenChange(open: boolean) {
    if (open || selected === undefined) return
    if (sheetDismissHandledRef.current) return
    sheetDismissHandledRef.current = true
    if (routeControlled) onClearSelectedPrincipal?.()
    else setLocalSelected(undefined)
  }

  return {
    routeControlled,
    selected,
    selectedItem,
    setLocalSelected,
    handleSheetOpenChange,
  }
}
