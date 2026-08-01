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
  /**
   * The v1 service model forbids an empty string here, so an unpublished-hours
   * fixture must spell absence with a sentinel the public projection drops.
   */
  hoursOrUnknown: string
  /** Only the Offering projection can carry this; v1 has no price field at all. */
  pricingSummary?: string
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
    hoursOrUnknown: 'Hours unknown',
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
    hoursOrUnknown: 'Mon–Fri 7am–5pm, Sat 8am–12pm',
    pricingSummary: 'Demo price — $180 call-out, quoted before work starts',
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
    pricingSummary: 'Demo price — $140 first hour, then $95 per hour',
    responseTimeMinutes: 25,
  },
  {
    requestedSlug: 'adelaide-dental-clinic',
    businessName: 'Adelaide Dental Clinic',
    category: 'Dental clinic',
    suburb: 'Adelaide',
    stateTerritory: 'SA',
    publishedPhone: '(08) 5550 1300',
    serviceName: 'General dental care',
    serviceCategory: 'Dental clinic',
    serviceSummary: 'Dentist check-ups, tooth pain triage, and routine dental care information.',
    serviceArea: 'Adelaide and nearby suburbs',
    hoursOrUnknown: 'Mon–Fri 8:30am–5pm',
    pricingSummary: 'Demo price — $95 check-up and clean',
    responseTimeMinutes: 20,
    inquiryAdmission: 'admitted',
  },
]
