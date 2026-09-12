import type { SidebarsConfig } from '@docusaurus/plugin-content-docs'

const sidebars: SidebarsConfig = {
  docs: [
    {
      type: 'category',
      label: 'Getting started',
      collapsed: false,
      items: [
        'getting-started/quick-start',
        'getting-started/connect-wallet',
        'getting-started/get-test-nim',
      ],
    },
    {
      type: 'category',
      label: 'Concepts',
      collapsed: false,
      items: ['concepts/how-it-works', 'concepts/why-nimiq-pay', 'concepts/trust-model'],
    },
    {
      type: 'category',
      label: 'Guides',
      collapsed: false,
      items: ['guides/for-customers', 'guides/for-merchants', 'guides/sharing-a-card'],
    },
    {
      type: 'category',
      label: 'Developers',
      collapsed: false,
      items: [
        'developers/architecture',
        'developers/api',
        'developers/running-locally',
        'developers/the-prove-it-command',
      ],
    },
    {
      type: 'category',
      label: 'Security',
      collapsed: false,
      items: ['security/overview', 'security/threat-model', 'security/audits'],
    },
    'faq',
  ],
}

export default sidebars
