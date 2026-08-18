#!/usr/bin/env node
import { existsSync, globSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

import {
  PRODUCT_FRONTIER_MANIFEST_VERSION,
  productFrontierManifest,
} from './product-frontier-manifest.mjs'

/**
 * Structural positive frontier floor. Live action/MCP identity is asserted in
 * tests/imports/product-frontier-manifest.test.ts so hollow deletions cannot
 * green this verifier alone.
 */
export function verifyProductFrontier(root = process.cwd()) {
  const errors = []
  const manifest = productFrontierManifest

  const requiredActionIds = asStringArray(manifest.requiredActionIds, 'requiredActionIds', errors)

  const expectedTargetProduct = {
    marketAuthority: [
      'operation-contract',
      'authorization',
      'durable-invocation',
      'delivery-evidence',
      'brokered-money',
    ],
    agentAuthority: ['planning', 'orchestration'],
    answerLoop: 'bounded-shared-market-tool-loop',
    livePaymentLane: 'ae-brokered',
    providerDirectX402: 'discovery-metadata-only',
  }
  if (JSON.stringify(manifest.targetProduct) !== JSON.stringify(expectedTargetProduct)) {
    errors.push('target_product_mismatch')
  }

  const expectedQuarantineFamilies = [
    {
      id: 'customer-request',
      status: 'tombstoned-pending-unlist',
      evidenceDisposition: 'exported-then-unlisted',
      successor: 'registry.operations.* + operation.invoke/status/cancel/reconcile for atomic market work; no replacement for legacy planning/problem/repeat/assistant orchestration',
      actionIds: [
        'customerRequest.confirm',
        'customerRequest.run',
        'customerRequest.cancel',
        'customerRequest.reportProblem',
        'customerRequest.replyProblem',
        'customerRequest.inspectEvidence',
        'customerRequest.allowRepeatPermission',
        'customerRequest.useRepeatPermission',
        'customerRequest.inspectRepeatPermission',
        'customerRequest.planPreview',
        'customerRequest.listConnectedAssistants',
        'customerRequest.withdrawRepeatPermission',
      ],
    },
    {
      id: 'inquiries',
      status: 'approved-pending-deprecation',
      evidenceDisposition: 'retain-read-only',
      successor: 'published provider contact channels',
      actionIds: ['inquiry.submit', 'inquiry.readCustomerRecord'],
    },
    {
      id: 'study',
      status: 'tombstoned-pending-unlist',
      evidenceDisposition: 'exported-then-unlisted',
      successor: 'consuming-agent planning and orchestration',
      actionIds: ['study.start', 'study.inspect'],
    },
    {
      id: 'work-tree',
      status: 'tombstoned-pending-unlist',
      evidenceDisposition: 'exported-then-unlisted',
      successor: 'consuming-agent planning and orchestration',
      actionIds: [
        'workTree.create',
        'workTree.inspect',
        'workTree.apply',
        'workTree.decide',
        'workTree.reserveRepeatUse',
        'workTree.finalizeRepeatUse',
        'workTree.reconcileRepeatUse',
        'workTree.inspectRepeatUse',
      ],
    },
  ]
  const quarantineFamilies = Array.isArray(manifest.quarantineFamilies)
    ? manifest.quarantineFamilies
    : []
  if (JSON.stringify(quarantineFamilies) !== JSON.stringify(expectedQuarantineFamilies)) {
    errors.push('quarantine_family_contract_mismatch')
  }
  const familyIds = quarantineFamilies.map((family) =>
    typeof family === 'object' && family !== null ? Reflect.get(family, 'id') : undefined,
  )
  const quarantineActionIds = quarantineFamilies.flatMap((family) =>
    typeof family === 'object' && family !== null && Array.isArray(Reflect.get(family, 'actionIds'))
      ? Reflect.get(family, 'actionIds')
      : [],
  )
  if (familyIds.length !== 4 || new Set(familyIds).size !== 4) {
    errors.push('quarantine_family_ids_invalid')
  }
  if (new Set(quarantineActionIds).size !== quarantineActionIds.length) {
    errors.push('quarantine_action_ids_not_unique')
  }
  for (const actionId of quarantineActionIds) {
    if (typeof actionId !== 'string' || requiredActionIds.includes(actionId)) {
      errors.push(`quarantine_action_still_required:${String(actionId)}`)
    }
  }

  const expectedBusinessServicesPolicy = {
    expansion: 'frozen',
    publicUrls: 'retain-measured',
    trafficInstrumentation: 'retain',
  }
  if (
    JSON.stringify(manifest.businessServicesPolicy) !==
    JSON.stringify(expectedBusinessServicesPolicy)
  ) {
    errors.push('business_services_policy_mismatch')
  }

  if (manifest.schemaVersion !== PRODUCT_FRONTIER_MANIFEST_VERSION) {
    errors.push(`schema_version_mismatch:${String(manifest.schemaVersion)}`)
  }


  const protectedActionIds = asStringArray(manifest.protectedActionIds, 'protectedActionIds', errors)
  const protectedModules = asStringArray(manifest.protectedModules, 'protectedModules', errors)
  const requiredE2eSpecs = asStringArray(manifest.requiredE2eSpecs, 'requiredE2eSpecs', errors)
  const requiredConformancePaths = asStringArray(
    manifest.requiredConformancePaths,
    'requiredConformancePaths',
    errors,
  )
  const evalCoverageTags = asStringArray(manifest.evalCoverageTags, 'evalCoverageTags', errors)
  const activeFrontierTables = asStringArray(
    manifest.activeFrontierTables,
    'activeFrontierTables',
    errors,
  )
  const protectedVisionPrimitives = asStringArray(
    manifest.protectedVisionPrimitives,
    'protectedVisionPrimitives',
    errors,
  )

  if (requiredActionIds.length < 20) {
    errors.push(`required_action_floor_too_low:${requiredActionIds.length}`)
  }
  if (protectedActionIds.length < 10) {
    errors.push(`protected_action_floor_too_low:${protectedActionIds.length}`)
  }
  if (evalCoverageTags.length < 10) {
    errors.push(`eval_tag_floor_too_low:${evalCoverageTags.length}`)
  }
  if (requiredE2eSpecs.length < 5) {
    errors.push(`e2e_floor_too_low:${requiredE2eSpecs.length}`)
  }
  if (requiredConformancePaths.length < 10) {
    errors.push(`conformance_floor_too_low:${requiredConformancePaths.length}`)
  }
  for (const primitive of ['external-run-kill-gate']) {
    if (!protectedVisionPrimitives.includes(primitive)) {
      errors.push(`protected_vision_missing:${primitive}`)
    }
  }

  for (const id of protectedActionIds) {
    if (!requiredActionIds.includes(id)) {
      errors.push(`protected_action_not_required:${id}`)
    }
  }

  for (const modulePath of protectedModules) {
    if (!existsSync(join(root, modulePath))) {
      errors.push(`protected_module_missing:${modulePath}`)
    }
  }

  for (const path of requiredE2eSpecs) {
    if (!existsSync(join(root, path))) {
      errors.push(`required_e2e_missing:${path}`)
    }
  }

  for (const path of requiredConformancePaths) {
    if (!existsSync(join(root, path))) {
      errors.push(`required_conformance_missing:${path}`)
    }
  }

  const schemaSources = schemaSourceText(root)
  for (const table of activeFrontierTables) {
    const declared = schemaSources.some((source) =>
      new RegExp(`\\b${escapeRegExp(table)}\\s*:\\s*defineTable\\b`).test(source),
    )
    if (!declared) {
      errors.push(`frontier_table_undeclared:${table}`)
    }
  }

  const mcpTools = Array.isArray(manifest.requiredMcpTools) ? manifest.requiredMcpTools : []
  if (mcpTools.length < 8) {
    errors.push(`mcp_tool_floor_too_low:${mcpTools.length}`)
  }
  for (const tool of mcpTools) {
    if (typeof tool !== 'object' || tool === null) {
      errors.push('mcp_tool_invalid_entry')
      continue
    }
    const id = Reflect.get(tool, 'id')
    const toolName = Reflect.get(tool, 'toolName')
    if (typeof id !== 'string' || !requiredActionIds.includes(id)) {
      errors.push(`mcp_tool_action_missing:${String(id)}`)
    }
    if (typeof toolName !== 'string' || !toolName.startsWith('ae_')) {
      errors.push(`mcp_tool_name_invalid:${String(toolName)}`)
    }
  }

  const retirements = Array.isArray(manifest.intentionalRetirements)
    ? manifest.intentionalRetirements
    : []
  for (const retirement of retirements) {
    if (typeof retirement !== 'object' || retirement === null) {
      errors.push('intentional_retirement_invalid')
      continue
    }
    const successor = Reflect.get(retirement, 'successor')
    const disposition = Reflect.get(retirement, 'evidenceDisposition')
    if (typeof successor !== 'string' || successor.trim().length === 0) {
      errors.push(`intentional_retirement_missing_successor:${JSON.stringify(retirement)}`)
    }
    if (typeof disposition !== 'string' || disposition.trim().length === 0) {
      errors.push(`intentional_retirement_missing_disposition:${JSON.stringify(retirement)}`)
    }
    const paths = Reflect.get(retirement, 'paths')
    if (Array.isArray(paths)) {
      for (const path of paths) {
        if (typeof path === 'string' && existsSync(join(root, path))) {
          errors.push(`intentional_retirement_still_present:${path}`)
        }
      }
    }
  }

  const golden = manifest.goldenJourneys
  if (typeof golden !== 'object' || golden === null) {
    errors.push('golden_journeys_missing')
  } else {
    const machine = Reflect.get(golden, 'machine')
    const person = Reflect.get(golden, 'person')
    if (!Array.isArray(machine) || machine.length < 5) errors.push('golden_machine_floor_too_low')
    if (!Array.isArray(person) || person.length < 4) errors.push('golden_person_floor_too_low')
  }

  return { ok: errors.length === 0, errors: [...new Set(errors)].sort() }
}

function asStringArray(value, label, errors) {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string')) {
    errors.push(`manifest_field_invalid:${label}`)
    return []
  }
  return value
}

function schemaSourceText(root) {
  return globSync([
    join(root, 'src/modules/**/convex-schema.ts'),
    join(root, 'src/modules/**/schema.ts'),
  ])
    .sort()
    .map((file) => readFileSync(file, 'utf8'))
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = verifyProductFrontier()
  if (!result.ok) {
    console.error(JSON.stringify(result, null, 2))
    process.exit(1)
  }
  console.log(JSON.stringify(result))
}
