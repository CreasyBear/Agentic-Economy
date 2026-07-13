export const ENGINE_LIFECYCLE = [
  { id: 'request', label: 'Request', description: 'Natural-language intent plus network and constraints.' },
  { id: 'clarify', label: 'Clarify', description: 'Only decision-changing information requested in context.' },
  { id: 'compare', label: 'Compare', description: 'Supported options from registered eligible businesses.' },
  { id: 'resume', label: 'Resume', description: 'One durable Request across waiting and interruption.' },
] as const

export const CUSTOMER_REQUEST_OPERATIONS = [
  { id: 'submit', method: 'POST', path: '/api/v1/requests' },
  { id: 'message', method: 'POST', path: '/api/v1/requests/:requestRef/messages' },
  { id: 'facts', method: 'POST', path: '/api/v1/requests/:requestRef/facts' },
  { id: 'options', method: 'POST', path: '/api/v1/requests/:requestRef/options' },
  { id: 'resume', method: 'GET', path: '/api/v1/requests/:requestRef' },
] as const
