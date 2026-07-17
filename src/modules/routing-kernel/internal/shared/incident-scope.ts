import type {
  CandidateGraphQuote,
  CapabilityBindingAdapter,
  KernelCaller,
  RootRunSnapshot,
} from '../model'
import type { IncidentScope } from '../../incident-control'

export function sameCaller(left: KernelCaller, right: KernelCaller): boolean {
  return left.agentId === right.agentId && left.principalId === right.principalId
}

export function callerScope(networkId: string, caller: KernelCaller): IncidentScope {
  return { networkId, principalId: caller.principalId, agentId: caller.agentId }
}

export function bindingScope(binding: CapabilityBindingAdapter['binding'], caller: KernelCaller): IncidentScope {
  return {
    ...callerScope(binding.networkId, caller), bindingId: binding.bindingId,
    capabilityContractId: binding.capabilityContractId,
  }
}

export function graphScope(networkId: string, caller: KernelCaller, graph: CandidateGraphQuote): IncidentScope {
  return {
    ...callerScope(networkId, caller), bindingId: graph.bindingId,
    capabilityContractId: graph.capabilityContractId,
  }
}

export function runIncidentScope(run: RootRunSnapshot, selectedLeaf = run.leaves.at(0)): IncidentScope {
  return {
    ...callerScope(run.networkId, run.caller),
    ...(selectedLeaf === undefined ? {} : {
      bindingId: selectedLeaf.bindingId,
      capabilityContractId: selectedLeaf.capabilityContractId,
    }),
  }
}
