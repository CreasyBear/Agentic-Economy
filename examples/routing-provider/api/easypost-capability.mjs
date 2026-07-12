import { createEasyPostGateway } from '../lib/easypost-gateway.mjs'
import { createLiveCapabilityHandler } from '../lib/live-capability-handler.mjs'
import { loadEasyPostConfiguration } from '../lib/provider-configuration.mjs'

export default createLiveCapabilityHandler(createEasyPostGateway, loadEasyPostConfiguration)
