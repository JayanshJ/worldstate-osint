/**
 * DesignHub — landing page showing two redesign directions.
 *
 * Pixel-perfect implementation of worldstate/project/index.html from the
 * Claude Design handoff bundle (design file e2ux3bxs3XAoDho9oDhzvg).
 *
 * Direction A — "The Signal"  — editorial, serif, amber accent
 * Direction B — "The Console" — operator terminal, IBM Plex Mono, phosphor-green
 */

import { Link } from 'wouter'
import styles from './DesignHub.module.css'

export function DesignHub() {
  return (
    <div className={styles.root}>

      {/* ── Header ── */}
      <header className={styles.header}>
        <div className={styles.mark}>
          Worldstate <em className={styles.markEm}>/ redesign</em>
        </div>
        <div className={styles.sub}>
          <span className={styles.dot} />
          2 directions · both interactive
        </div>
      </header>

      {/* ── Main ── */}
      <main className={styles.main}>
        <h1 className={styles.h1}>
          Two directions<br />
          for an intelligence<br />
          platform, <em className={styles.h1Em}>fleshed out.</em>
        </h1>
        <p className={styles.lede}>
          The current product is a real-time OSINT dashboard — news clustering,
          supply-chain intelligence, alpha signals. We took two aesthetic positions
          and built each as a landing page plus a working dashboard. Same data,
          same features, two very different moods.
        </p>

        <div className={styles.grid}>

          {/* ── Direction A — The Signal ── */}
          <Link href="/login" className={styles.card}>
            <div className={styles.eyebrow}>
              <span>Direction A</span>
              <span>Editorial · Intel</span>
            </div>
            <h2 className={styles.cardTitle}>
              The <em className={styles.cardTitleEm}>Signal.</em>
            </h2>
            <p className={styles.cardBody}>
              Serif headlines over warm charcoal. A single amber accent. Volatility
              as a data-color system. Reads like a premium research publication that
              happens to be real-time.
            </p>
            <div className={styles.links}>
              <span className={styles.chip}>→ Landing</span>
              <span className={styles.chip}>→ Dashboard</span>
              <span className={styles.chip}>→ Map / SPLC / Alpha</span>
            </div>
            <span className={styles.preview} aria-hidden>A</span>
          </Link>

          {/* ── Direction B — The Console ── */}
          <Link href="/login" className={`${styles.card} ${styles.cardB}`}>
            <div className={`${styles.eyebrow} ${styles.eyebrowB}`}>
              <span>Direction B</span>
              <span>Operator · Terminal</span>
            </div>
            <h2 className={styles.cardTitleB}>
              THE <em className={styles.cardTitleEmB}>CONSOLE.</em>
            </h2>
            <p className={styles.cardBody}>
              Grid-ruled, phosphor-green. IBM Plex Mono top to bottom. Shimmer on
              update, scanlines, flashing indicators. A war-room console — grittier,
              louder, built for operators.
            </p>
            <div className={styles.links}>
              <span className={styles.chipB}>→ Landing</span>
              <span className={styles.chipB}>→ Dashboard</span>
              <span className={styles.chipB}>→ Map / SPLC / Alpha</span>
            </div>
            <span className={styles.bPreview} aria-hidden>B</span>
          </Link>

        </div>
      </main>

      {/* ── Footer ── */}
      <footer className={styles.footer}>
        <span>Synthetic data · illustrative only</span>
        <span>Tweaks: accent color · light / dark · dashboard</span>
      </footer>

    </div>
  )
}
