import Layout from '@theme/Layout'
import Link from '@docusaurus/Link'
import clsx from 'clsx'
import styles from './index.module.css'

const paths = [
  {
    to: '/docs/getting-started/quick-start',
    label: 'Quick start',
    note: 'Open Vango inside Nimiq Pay and get your first stamp.',
  },
  {
    to: '/docs/concepts/how-it-works',
    label: 'How it works',
    note: 'The loop in five steps, with the sequence diagram.',
  },
  {
    to: '/docs/guides/for-merchants',
    label: 'For merchants',
    note: 'Open a card, share it, hand over the reward at the counter.',
  },
  {
    to: '/docs/developers/api',
    label: 'API reference',
    note: 'Every route, its auth, its body and its errors.',
  },
  {
    to: '/docs/security/threat-model',
    label: 'Threat model',
    note: 'Every attack we tried, and what refused it.',
  },
]

export default function Home() {
  return (
    <Layout title="Vango docs" description="The loyalty card that lives in your wallet">
      <main className={styles.page}>
        <div className={styles.glow} />
        <div className={styles.rule} />

        <div className={styles.inner}>
          <div>
            <div className={clsx(styles.kicker, styles.enter, styles.d1)}>
              <span />
              <span>Vango documentation</span>
            </div>

            <h1 className={clsx(styles.title, styles.enter, styles.d2)}>
              Stamps that
              <br />
              live on <em>chain</em>
            </h1>

            <p className={clsx(styles.lede, styles.enter, styles.d3)}>
              Vango is a loyalty card inside a Nimiq Pay wallet. You pay the shop in NIM, the
              payment carries a short memo, and the chain itself is the card. No plastic, no app
              to install, no fees.
            </p>

            <div className={clsx(styles.actions, styles.enter, styles.d4)}>
              <Link className={styles.primary} to="/docs/getting-started/quick-start">
                Start in ten minutes
              </Link>
              <Link className={styles.secondary} to="/docs/developers/architecture">
                Read the architecture
              </Link>
            </div>
          </div>

          <div className={clsx(styles.enter, styles.d5)}>
            <div className={styles.stampRow} aria-hidden="true">
              <i />
              <i />
              <i />
              <i />
              <i />
            </div>

            <nav className={styles.index}>
              {paths.map((path, index) => (
                <Link key={path.to} className={styles.row} to={path.to}>
                  <small>{String(index + 1).padStart(2, '0')}</small>
                  <span>
                    <b>{path.label}</b>
                    <p>{path.note}</p>
                  </span>
                </Link>
              ))}
            </nav>
          </div>
        </div>
      </main>
    </Layout>
  )
}
