import { v } from 'convex/values'
import { planWorkflowManager, runPlanWorkflow } from './lib/capabilityExecution/plans/runWorkflow'

export const run = planWorkflowManager.define({ args: { planRef: v.string() }, returns: v.null() }).handler(runPlanWorkflow)
