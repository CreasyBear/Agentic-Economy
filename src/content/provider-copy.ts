export const PROVIDER_SETUP_STEPS = [
  {
    title: 'Connect your endpoint',
    detail: 'Paste its HTTPS URL. Aecon reads the payment challenge for the price, network and contract. If GET and POST both return a challenge, choose the method you intend to offer.',
  },
  {
    title: 'Prove the payment recipient',
    detail: 'Sign a claim that your business controls the payment recipient. This confirms control of the recipient address. It does not authorise a payment.',
  },
  {
    title: 'Review and publish',
    detail: 'Review the terms and authorise the Tool. The Tool becomes callable when admission and readiness checks pass. If something is missing, setup shows what needs attention.',
  },
] as const

export const PROVIDER_FAQ = {
  heading: 'Before you publish',
  questions: [
    {
      question: 'What kinds of Tools are supported first?',
      answer: 'This setup supports public HTTPS x402 v2 endpoints with a Base USDC exact payment challenge. Base Sepolia is sandbox; Base mainnet is production. The challenge must describe the input, output, price and payment recipient. MCP and OpenAPI connections are not options in this setup flow.',
    },
    {
      question: 'What happens when I choose Add Tool?',
      answer: 'You sign in and use an Account you own. If you have not created a Provider profile, you do that first. Then you connect the endpoint, prove control of its payment recipient and review the listing. Starting setup does not buy a Tool.',
    },
    {
      question: 'Does a directory listing make my Tool callable?',
      answer: 'No. An external directory listing helps people discover a service. Admission, publication and current readiness are separate requirements before a Tool can be called through Aecon.',
    },
    {
      question: 'Can setup checks reach my service?',
      answer: 'Yes. A check may reach the configured endpoint, consume Provider quota or incur cost. Use an example that is safe to run there. A successful check does not publish the Tool, create earnings or guarantee delivery.',
    },
    {
      question: 'Does publication guarantee purchases or payouts?',
      answer: 'No. Publication makes a qualifying Tool available for discovery and use; it does not guarantee demand, payment, delivery or payout. Setup checks are not settled earnings. You retain control of the service and its listing.',
    },
  ],
} as const
