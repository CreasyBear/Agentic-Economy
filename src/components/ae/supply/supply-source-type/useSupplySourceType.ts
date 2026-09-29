import { useState } from 'react'

import {
  inspectHttpsUrl,
  inspectJsonPayload,
  MCP_JSON_REQUIRED_KEYS,
  PLUGIN_JSON_REQUIRED_KEYS,
} from '../supply-source-native-start-presentation'
import {
  JSON_DISCOVER_DIAGNOSTICS,
  SUPPLY_SOURCE_TYPE_COPY,
  URL_DISCOVER_DIAGNOSTICS,
  httpsDiscoverNextStep,
  type DiscoverDiagnosticState,
  type SupplySourceTypeSectionProps,
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
        setDiscoverDiagnostic({ target: 'definitionUrl', diagnostic: urlDiagnostic(preflight, SUPPLY_SOURCE_TYPE_COPY.httpsExample.openapi) })
        return
      }
    }
    if (props.sourceKind === 'mcp' && props.mcpLocator === 'url') {
      const preflight = inspectHttpsUrl(props.serverUrl)
      if (preflight === 'invalid' || preflight === 'insecure') {
        setDiscoverDiagnostic({ target: 'serverUrl', diagnostic: urlDiagnostic(preflight, SUPPLY_SOURCE_TYPE_COPY.httpsExample.mcp) })
        return
      }
    }
    if (props.sourceKind === 'x402') {
      const preflight = inspectHttpsUrl(props.resourceUrl)
      if (preflight === 'invalid' || preflight === 'insecure') {
        setDiscoverDiagnostic({ target: 'resourceUrl', diagnostic: urlDiagnostic(preflight, SUPPLY_SOURCE_TYPE_COPY.httpsExample.x402) })
        return
      }
    }
    if (props.sourceKind === 'agent_plugin') {
      const pluginPreflight = inspectJsonPayload(props.pluginJson, PLUGIN_JSON_REQUIRED_KEYS)
      if (pluginPreflight === 'invalid' || pluginPreflight === 'not_object' || pluginPreflight === 'missing_fields') {
        setDiscoverDiagnostic({ target: 'pluginJson', diagnostic: pluginPreflight === 'invalid' ? JSON_DISCOVER_DIAGNOSTICS.syntax : JSON_DISCOVER_DIAGNOSTICS.schema })
        return
      }
      const mcpPreflight = inspectJsonPayload(props.mcpJson, MCP_JSON_REQUIRED_KEYS)
      if (mcpPreflight === 'invalid' || mcpPreflight === 'not_object' || mcpPreflight === 'missing_fields') {
        setDiscoverDiagnostic({ target: 'mcpJson', diagnostic: mcpPreflight === 'invalid' ? JSON_DISCOVER_DIAGNOSTICS.syntax : JSON_DISCOVER_DIAGNOSTICS.schema })
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

function urlDiagnostic(preflight: 'invalid' | 'insecure', example: string) {
  const diagnostic = URL_DISCOVER_DIAGNOSTICS[preflight]
  if (preflight === 'insecure') return diagnostic
  return { ...diagnostic, nextStep: httpsDiscoverNextStep(example) }
}
