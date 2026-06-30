import { feature, item, plan } from 'atmn'

export const paidActivation = feature({
  id: 'paid_activation',
  name: 'Paid Activation',
  type: 'boolean',
})

export const paidActivationMonthly = plan({
  id: 'paid_activation_monthly',
  name: 'Paid Activation Monthly',
  price: { amount: 29, interval: 'month' },
  items: [
    item({
      featureId: paidActivation.id,
    }),
  ],
})
