import { createShippoGateway } from '../lib/shippo-gateway.mjs'
import { createLiveCapabilityHandler } from '../lib/live-capability-handler.mjs'
import { loadShippoConfiguration } from '../lib/provider-configuration.mjs'

export default createLiveCapabilityHandler(createShippoGateway, loadShippoConfiguration)
