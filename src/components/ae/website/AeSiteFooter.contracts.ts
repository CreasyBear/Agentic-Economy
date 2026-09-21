export type AeSiteFooterLinkItem = Readonly<{
  to: string
  label: string
  order: number
  reloadDocument: boolean
}>

export const AE_SITE_FOOTER = {
  closer: {
    eyebrow: 'Agentic Economy',
    heading: 'Take Control of Your Agentic Future',
    description:
      'Paid service discovery with Bazaar, x402 settlement, and AUD spending controls built for Australian businesses.',
    primaryAction: 'Browse Tools',
    secondaryAction: 'System status',
  },
  images: {
    atmosphere: {
      src: '/website/basalt-coast-full.webp',
      srcSet:
        '/website/basalt-coast-small.webp 640w, /website/basalt-coast-medium.webp 1280w, /website/basalt-coast-full.webp 1920w',
    },
    closer: {
      src: '/website/mountain-viaduct-full.webp',
      srcSet:
        '/website/mountain-viaduct-small.webp 640w, /website/mountain-viaduct-medium.webp 1280w, /website/mountain-viaduct-full.webp 1920w',
    },
  },
  socialLinks: [
    { label: 'LinkedIn', href: 'https://www.linkedin.com/company/aecon-ai/' },
    { label: 'X', href: 'https://x.com/Aeconai' },
    { label: 'Facebook', href: 'https://www.facebook.com/profile.php?id=61594070258261' },
  ],
  abn: {
    label: 'ABN 98 700 838 115',
    href: 'https://abr.business.gov.au/ABN/View?abn=98700838115',
  },
} as const
