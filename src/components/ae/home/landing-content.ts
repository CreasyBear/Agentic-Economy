import { AE_SITE_FOOTER } from '@/components/ae/website/AeSiteFooter.contracts'

/**
 * Landing copy and the searches behind each section. Headline and subhead live in
 * `PUBLIC_SURFACE` (brand-copy). Every tool, price and count on the page comes from
 * the directory at request time; nothing here is a tool name, a price or a number.
 */

/**
 * Hero chips, Airbnb's category bar: each is a link to a /market search, so it works before
 * hydration and never promises a filter the index can't answer. Topics the rows don't show come first.
 */
export const LANDING_CHIPS = [
  { value: 'weather', label: 'Weather' },
  { value: 'crypto price', label: 'Crypto prices' },
  { value: 'news', label: 'News' },
  { value: 'email', label: 'Email' },
  { value: 'pdf', label: 'Documents' },
  { value: 'domain', label: 'Domains' },
  { value: 'scrape', label: 'Web pages' },
  { value: 'company profile', label: 'Companies' },
  { value: 'exchange rate', label: 'Exchange rates' },
] as const

/**
 * Airbnb-style rows: real listing cards, "Show all" opens the row's search. A row keeps a card only
 * when one of its terms is in what the card shows, so a heading never sits over unrelated cards. Candidates in order of preference; a row shows only
 * when three providers pass, and the page keeps the first `ROW_COUNT` that do.
 */
export const LANDING_ROWS = [
  { id: 'web', title: 'Web pages and search', query: 'scrape', terms: ['scrape', 'web page', 'webpage', 'crawl', 'web search'] },
  { id: 'companies', title: 'Companies and domains', query: 'company profile', terms: ['company', 'companies', 'domain', 'business'] },
  { id: 'ai', title: 'Images, video and audio', query: 'image generation', terms: ['image', 'video', 'audio', 'speech'] },
  { id: 'money', title: 'Currencies and exchange rates', query: 'exchange rate', terms: ['exchange rate', 'currency', 'currencies', 'forex'] },
  { id: 'news', title: 'News', query: 'news', terms: ['news', 'headline'] },
  { id: 'stocks', title: 'Stocks and markets', query: 'stock price', terms: ['stock', 'equity', 'equities', 'ticker', 'share price'] },
  { id: 'crypto', title: 'Crypto prices', query: 'token price', terms: ['crypto', 'coin', 'bitcoin', 'ethereum'] },
  { id: 'predictions', title: 'Prediction markets', query: 'prediction market', terms: ['prediction', 'polymarket', 'kalshi', 'odds'] },
] as const
export const ROW_COUNT = 4
/** The always-on grid under the hero: two rows of four on a laptop. */
export const POPULAR_COUNT = 8

/**
 * "Things you can now do": a plain job, the search that finds its tool, and the terms its card must
 * show. Everyday jobs first. A top match fills the cell; the page shows six, or three.
 */
export const LANDING_TASKS = [
  { id: 'weather', title: 'Get tomorrow’s weather for a city', query: 'weather forecast', terms: ['weather', 'forecast'] },
  { id: 'fx', title: 'Convert 100 AUD to USD', query: 'exchange rate', terms: ['exchange rate', 'currency', 'currencies', 'convert'] },
  { id: 'translate', title: 'Translate a paragraph', query: 'translate', terms: ['translat'] },
  { id: 'stock', title: 'Get a stock quote', query: 'stock quote', terms: ['stock', 'ticker', 'equity', 'share price'] },
  { id: 'email', title: 'Check an email address before you send', query: 'validate email', terms: ['email'] },
  { id: 'company', title: 'Profile a company from its domain', query: 'company profile', terms: ['company', 'companies', 'business'] },
  { id: 'scrape', title: 'Turn a web page into clean text', query: 'scrape', terms: ['scrape', 'web page', 'webpage', 'markdown', 'crawl'] },
  { id: 'wikipedia', title: 'Search Wikipedia', query: 'wikipedia search', terms: ['wikipedia'] },
  { id: 'whois', title: 'See who registered a domain', query: 'domain whois', terms: ['whois', 'domain'] },
  { id: 'ip', title: 'Find the country behind an IP address', query: 'ip geolocation', terms: ['ip', 'geolocat'] },
  { id: 'predictions', title: 'Read a prediction market', query: 'prediction market', terms: ['prediction', 'polymarket', 'kalshi'] },
] as const

export const LANDING_COPY = {
  metaTitle: 'aecon: every paid API, one call at a time',
  metaDescription:
    'Search thousands of paid APIs, data feeds and services, each priced per call. Compare them in one place, with no subscription.',
  showAll: 'Show all',
  showAllLabel: (row: string) => `Show all ${row.toLowerCase()} tools`,
  popularTitle: 'Popular tools',
  popularLink: 'Browse all tools',
  loadingTools: 'Loading tools',
  rowsUnavailableTitle: 'Tools are catching up',
  rowsUnavailableBody: 'The directory didn’t answer in time. Search still works, and every tool is in the full list.',
  rowsUnavailableAction: 'Browse all tools',
  retry: 'Try again',
  tasksTitle: 'Things you can now do',
  tasksDescription: 'Each is one call to a real API. The preview is the provider’s own published example.',
  taskDescription: (provider: string, price: string) => `From ${provider}. ${price} per call.`,
  sampleLabel: 'Sample response',
  sampleIoLabel: 'Sample input and response',
  requestLabel: 'Request',
  statsTitle: 'On aecon today',
  statTools: 'Paid APIs listed',
  statToolsDetail: 'From providers who charge by the call',
  statMedian: 'Median price per call',
  statMedianDetail: 'Half of all tools cost this or less. Bars run from cheapest to priciest.',
  connectTitle: 'Add aecon to your agent',
  connectDescription: 'One line connects Claude Code, Cursor or Codex. Your agent can then search every tool here and call the ones marked Ready now.',
  providerTitle: 'Sell your API per call to agents',
  providerDescription: 'List an endpoint, set a price per call, and let people and their agents find it here.',
  providerAction: 'List an API',
  providerSecondary: 'Read the docs',
  buyerTitle: 'Find a tool in under a minute',
  buyerDescription: 'Search by the job you need done, compare prices per call, and run the ones marked Ready now once you sign in.',
  buyerAction: 'Browse all tools',
  buyerSecondary: 'Sign in',
  faqDescription: 'Plain answers about tools, accounts and who runs aecon.',
  faqContact: { label: 'Still have a question?', description: 'Our support team answers', href: '/support' },
} as const

/** Plain product questions only. Money custody and trust live inside the product, not here. */
export const LANDING_FAQ = [
  {
    question: 'What is a tool?',
    answer: 'A tool is one paid API that does one job, such as checking the weather, validating an email address or reading a web page. Every tool shows its price per call, so you know the cost before it runs.',
  },
  {
    question: 'Where do the tools come from?',
    answer: 'Providers publish them to the x402 Bazaar, an open directory of APIs that charge per call. aecon indexes that directory so you can search, compare and use them in one place.',
  },
  {
    question: 'Can I run every tool here?',
    answer: 'Not yet. Tools marked Ready now run through aecon: you sign in once and each call is paid from your aecon credit, with no account at the provider. Every other listing is a preview, so you can see what it takes, returns and costs before aecon can run it.',
  },
  {
    question: 'Do I need crypto?',
    answer: 'Not for tools marked Ready now. You top up in Australian dollars and aecon pays the provider for each call.',
  },
  {
    question: 'Can my agent use aecon?',
    answer: 'Yes. Add aecon to Claude Code, Cursor or Codex with one line. Your agent can search every tool here and call the ones marked Ready now.',
  },
  {
    question: 'Who runs aecon?',
    answer: `aecon is built by Agentic Economy, an Australian company, ${AE_SITE_FOOTER.abn.label}.`,
  },
] as const
