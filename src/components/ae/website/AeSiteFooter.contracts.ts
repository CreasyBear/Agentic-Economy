export const FOOTER_NAVIGATION = [
  {
    id: 'footer-resources',
    title: 'Resources',
    links: [
      { to: '/developers/api', label: 'API reference', reloadDocument: false },
    ],
  },
  {
    id: 'footer-help',
    title: 'Help',
    links: [
      { to: '/support', label: 'Support', reloadDocument: false },
      { to: '/status', label: 'Status', reloadDocument: false },
    ],
  },
  {
    id: 'footer-legal',
    title: 'Legal',
    links: [
      { to: '/trust', label: 'Trust centre', reloadDocument: false },
      { to: '/privacy', label: 'Privacy', reloadDocument: false },
      { to: '/terms', label: 'Terms', reloadDocument: false },
      { to: '/privacy/remove-business', label: 'Remove a listing', reloadDocument: false },
    ],
  },
  {
    id: 'footer-machines',
    title: 'Machines',
    links: [
      { to: '/llms.txt', label: 'llms.txt', reloadDocument: true },
      { to: '/SKILL.md', label: 'SKILL.md', reloadDocument: true },
      { to: '/.well-known/ucp', label: '.well-known/ucp', reloadDocument: true },
      { to: '/glossary.md', label: 'glossary.md', reloadDocument: true },
    ],
  },
] as const

export const AE_SITE_FOOTER = {
  closer: {
    heading: 'Take control of your Agentic future',
    description:
      'Find Tools, pay per Call in AUD, and control Agent spending for your Business.',
    primaryAction: 'Browse Tools',
    secondaryAction: 'System status',
  },
  images: {
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
