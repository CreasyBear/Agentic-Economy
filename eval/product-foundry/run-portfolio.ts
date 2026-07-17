import { PRODUCT_FOUNDRY_PORTFOLIO } from './portfolio'
import {
  evaluateFoundryPortfolio,
  evaluateWedgeExecutionPack,
} from './public'

const packResults = PRODUCT_FOUNDRY_PORTFOLIO.map((pack) => ({
  wedgeId: pack.wedgeId,
  workflowFamily: pack.workflowFamily,
  role: pack.role,
  evidenceMaturity: pack.evidenceMaturity,
  evaluation: evaluateWedgeExecutionPack(pack),
}))

const portfolio = evaluateFoundryPortfolio({
  packs: PRODUCT_FOUNDRY_PORTFOLIO,
  marginalWedgeCost: {
    unit: 'not_measured',
    direction: 'lower_is_better',
    baseline: 0,
    assisted: 0,
    requiredImprovementRatio: 0,
    baselineEvidenceRefs: [],
    assistedEvidenceRefs: [],
  },
  repeatedKernelGapObserved: { passed: false, evidenceRefs: [] },
  humanOperationsEconomicallyViable: { passed: false, evidenceRefs: [] },
})

process.stdout.write(`${JSON.stringify({
  generatedFrom: 'simulated_starting_portfolio_not_customer_evidence',
  packs: packResults,
  portfolio,
}, null, 2)}\n`)
