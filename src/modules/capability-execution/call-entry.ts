import { MARKET_TOOLS_CALL_SCOPE } from '@/modules/agent-access/contract'
import { CURRENT_TOOL_CALL_VIA } from '@/modules/capability-supply/tool-projection'

const callMedia = {
  request: 'application/json',
  response: 'application/json',
  problem: 'application/problem+json',
} as const

const callHeaders = {
  authorization: 'Authorization',
  contentType: 'Content-Type',
  accept: 'Accept',
} as const

export const CALL_ROUTE_CONTRACT = {
  scope: MARKET_TOOLS_CALL_SCOPE,
  media: callMedia,
  headers: callHeaders,
  call: {
    actionId: 'tool.call',
    contractVersion: 'tool.call:v1',
    method: 'POST',
    path: CURRENT_TOOL_CALL_VIA,
    routerPath: CURRENT_TOOL_CALL_VIA,
    requiredHeaders: ['Authorization', 'Content-Type'] as const,
  },
  list: {
    actionId: 'call.list',
    contractVersion: 'call.list:v1',
    method: 'GET',
    path: '/api/v1/calls',
    routerPath: '/api/v1/calls',
    requiredHeaders: ['Authorization'] as const,
  },
  status: {
    actionId: 'call.status',
    contractVersion: 'call.status:v1',
    method: 'GET',
    path: '/api/v1/calls/{callRef}',
    routerPath: '/api/v1/calls/$callRef',
    requiredHeaders: ['Authorization'] as const,
  },
  cancel: {
    actionId: 'call.cancel',
    contractVersion: 'call.cancel:v1',
    method: 'POST',
    path: '/api/v1/calls/{callRef}/cancel',
    routerPath: '/api/v1/calls/$callRef/cancel',
    requiredHeaders: ['Authorization', 'Content-Type'] as const,
  },
  reconcile: {
    actionId: 'call.reconcile',
    contractVersion: 'call.reconcile:v1',
    method: 'POST',
    path: '/api/v1/calls/{callRef}/reconcile',
    routerPath: '/api/v1/calls/$callRef/reconcile',
    requiredHeaders: ['Authorization', 'Content-Type'] as const,
  },
} as const

export const CALL_HTTP_PATH = CALL_ROUTE_CONTRACT.call.path
export const CALL_ACTION_ID = CALL_ROUTE_CONTRACT.call.actionId
export const CALL_SCOPE = CALL_ROUTE_CONTRACT.scope
