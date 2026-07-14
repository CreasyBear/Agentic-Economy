export type LocalE2eBusinessFixture = {
  requestedSlug: string
  businessName: string
  category: string
  suburb: string
  stateTerritory: string
  publishedPhone?: string
  serviceName: string
  serviceCategory: string
  serviceSummary: string
  serviceArea: string
  hoursOrUnknown: string
  responseTimeMinutes?: number
  inquiryAdmission?: 'admitted'
}

export const LOCAL_E2E_BUSINESS_FIXTURES: readonly LocalE2eBusinessFixture[] = [
  {
    requestedSlug: 'plumbing-demo',
    businessName: 'Demo Plumbing',
    category: 'Plumbing',
    suburb: 'Parramatta',
    stateTerritory: 'NSW',
    serviceName: 'Diagnostic plumbing',
    serviceCategory: 'Plumbing',
    serviceSummary: 'Diagnostic plumbing triage for first contact.',
    serviceArea: 'Parramatta',
    hoursOrUnknown: 'Hours supplied by owner',
    responseTimeMinutes: 22,
  },
  {
    requestedSlug: 'joondalup-rapid-plumbing',
    businessName: 'Joondalup Rapid Plumbing',
    category: 'Plumbing',
    suburb: 'Joondalup',
    stateTerritory: 'WA',
    publishedPhone: '0412 345 678',
    serviceName: 'Emergency plumbing',
    serviceCategory: 'Plumbing',
    serviceSummary: 'Burst pipe and blocked drain triage for urgent local plumbing issues.',
    serviceArea: 'Joondalup and nearby suburbs',
    hoursOrUnknown: 'Mon–Fri 7am–5pm',
    responseTimeMinutes: 20,
    inquiryAdmission: 'admitted',
  },
  {
    requestedSlug: 'fremantle-coastal-electrical',
    businessName: 'Fremantle Coastal Electrical',
    category: 'Electrical repairs',
    suburb: 'Fremantle',
    stateTerritory: 'WA',
    publishedPhone: '(08) 9430 1234',
    serviceName: 'Electrical fault repairs',
    serviceCategory: 'Electrical repairs',
    serviceSummary: 'Electrical fault checks and repair coordination for homes and small businesses.',
    serviceArea: 'Fremantle and nearby suburbs',
    hoursOrUnknown: 'Mon–Sat 8am–6pm',
    responseTimeMinutes: 25,
  },
]
