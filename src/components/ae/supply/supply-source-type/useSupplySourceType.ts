import { useState } from 'react'

import {
  INSECURE_URL_DIAGNOSTIC,
  inspectHttpsUrl,
  inspectJsonPayload,
  MALFORMED_JSON_DIAGNOSTIC,
  MCP_JSON_REQUIRED_KEYS,
  PLUGIN_JSON_REQUIRED_KEYS,
} from '../supply-source-native-start-presentation'
import type {
  DiscoverDiagnosticState,
  SupplySourceTypeSectionProps,
} from './supply-source-type.contracts'

export function useSupplySourceType(props: SupplySourceTypeSectionProps) {
  const [discoverDiagnostic, setDiscoverDiagnostic] = useState<DiscoverDiagnosticState>()

  function clearThen<T>(callback: (value: T) => void) {
    return (value: T) => {
      setDiscoverDiagnostic(undefined)
      callback(value)
    }
  }

  function handleDiscover() {
    setDiscoverDiagnostic(undefined)

    if (props.sourceKind === 'openapi') {
      const preflight = inspectHttpsUrl(props.definitionUrl)
      if (preflight === 'invalid' || preflight === 'insecure') {
        setDiscoverDiagnostic({ target: 'definitionUrl', diagnostic: INSECURE_URL_DIAGNOSTIC })
        return
      }
    }
    if (props.sourceKind === 'mcp' && props.mcpLocator === 'url') {
      const preflight = inspectHttpsUrl(props.serverUrl)
      if (preflight === 'invalid' || preflight === 'insecure') {
        setDiscoverDiagnostic({ target: 'serverUrl', diagnostic: INSECURE_URL_DIAGNOSTIC })
        return
      }
    }
    if (props.sourceKind === 'x402') {
      const preflight = inspectHttpsUrl(props.resourceUrl)
      if (preflight === 'invalid' || preflight === 'insecure') {
        setDiscoverDiagnostic({ target: 'resourceUrl', diagnostic: INSECURE_URL_DIAGNOSTIC })
        return
      }
    }
    if (props.sourceKind === 'agent_plugin') {
      const pluginPreflight = inspectJsonPayload(props.pluginJson, PLUGIN_JSON_REQUIRED_KEYS)
      if (pluginPreflight === 'invalid' || pluginPreflight === 'not_object' || pluginPreflight === 'missing_fields') {
        setDiscoverDiagnostic({ target: 'pluginJson', diagnostic: MALFORMED_JSON_DIAGNOSTIC })
        return
      }
      const mcpPreflight = inspectJsonPayload(props.mcpJson, MCP_JSON_REQUIRED_KEYS)
      if (mcpPreflight === 'invalid' || mcpPreflight === 'not_object' || mcpPreflight === 'missing_fields') {
        setDiscoverDiagnostic({ target: 'mcpJson', diagnostic: MALFORMED_JSON_DIAGNOSTIC })
        return
      }
    }

    props.onDiscover()
  }

  return {
    discoverDiagnostic,
    handleDiscover,
    onDefinitionUrlChange: clearThen(props.onDefinitionUrlChange),
    onMcpLocatorChange: clearThen(props.onMcpLocatorChange),
    onServerUrlChange: clearThen(props.onServerUrlChange),
    onRegistryNameChange: clearThen(props.onRegistryNameChange),
    onPluginJsonChange: clearThen(props.onPluginJsonChange),
    onMcpJsonChange: clearThen(props.onMcpJsonChange),
    onResourceUrlChange: clearThen(props.onResourceUrlChange),
    onX402MethodChange: clearThen(props.onX402MethodChange),
  }
}
