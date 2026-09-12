import { themes as prismThemes } from 'prism-react-renderer'
import type { Config } from '@docusaurus/types'
import type * as Preset from '@docusaurus/preset-classic'

const config: Config = {
  title: 'Vango docs',
  tagline: 'The loyalty card that lives in your wallet',
  favicon: 'img/stamp.svg',

  future: {
    v4: true,
  },

  url: 'https://docs.vango.app',
  baseUrl: '/',

  onBrokenLinks: 'throw',

  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  markdown: {
    mermaid: true,
    hooks: {
      onBrokenMarkdownLinks: 'throw',
    },
  },

  themes: ['@docusaurus/theme-mermaid'],

  stylesheets: [
    'https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400..900;1,9..144,400..900&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap',
  ],

  presets: [
    [
      'classic',
      {
        docs: {
          sidebarPath: './sidebars.ts',
          breadcrumbs: false,
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    colorMode: {
      defaultMode: 'dark',
      disableSwitch: true,
      respectPrefersColorScheme: false,
    },
    mermaid: {
      theme: { light: 'dark', dark: 'dark' },
      options: {
        // Diagrams scale to the width of their frame, so the type starts larger than the
        // mermaid default to survive that shrink on the wide ones.
        fontSize: 18,
        themeVariables: {
          fontFamily: 'Inter, system-ui, sans-serif',
          fontSize: '18px',
          primaryColor: '#161d2e',
          primaryTextColor: '#f3efe6',
          primaryBorderColor: '#ff5a2c',
          lineColor: '#ff5a2c',
          edgeLabelBackground: '#0d1220',
          tertiaryTextColor: '#f3efe6',
          secondaryColor: '#11172a',
          tertiaryColor: '#0b0f1a',
          background: '#0b0f1a',
          mainBkg: '#161d2e',
          nodeBorder: '#ff5a2c',
          clusterBkg: 'rgba(243, 239, 230, 0.04)',
          clusterBorder: 'rgba(243, 239, 230, 0.18)',
          actorBkg: '#161d2e',
          actorBorder: '#ff5a2c',
          actorTextColor: '#f3efe6',
          signalColor: '#f3efe6',
          signalTextColor: '#f3efe6',
          labelBoxBkgColor: '#161d2e',
          labelBoxBorderColor: '#ff5a2c',
          labelTextColor: '#f3efe6',
          noteBkgColor: 'rgba(255, 90, 44, 0.12)',
          noteBorderColor: '#ff5a2c',
          noteTextColor: '#f3efe6',
        },
      },
    },
    navbar: {
      title: 'Vango docs',
      logo: {
        alt: 'The Vango stamp',
        src: 'img/stamp.svg',
      },
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'docs',
          position: 'left',
          label: 'Docs',
        },
        {
          href: '#',
          label: 'GitHub',
          position: 'right',
        },
        {
          href: 'https://nimpay.app/miniapps/open/vango.app',
          label: 'Open in Nimiq Pay',
          position: 'right',
          className: 'navbar-open-in-pay',
        },
      ],
    },
    footer: {
      style: 'dark',
      copyright: 'Built on Nimiq Pay. Open source, MIT.',
    },
    prism: {
      theme: prismThemes.vsDark,
      darkTheme: prismThemes.vsDark,
      additionalLanguages: ['bash', 'json', 'ini'],
    },
  } satisfies Preset.ThemeConfig,
}

export default config
