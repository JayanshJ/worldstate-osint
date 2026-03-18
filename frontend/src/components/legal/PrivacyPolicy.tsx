export function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-black text-gray-200 font-mono p-8 max-w-4xl mx-auto">
      <div className="mb-8">
        <a href="/" className="text-green-400 hover:text-green-300 text-sm">← Back</a>
      </div>
      <h1 className="text-2xl font-bold text-white mb-2">Privacy Policy</h1>
      <p className="text-gray-500 text-sm mb-8">Last updated: March 19, 2026</p>

      <section className="mb-8">
        <h2 className="text-lg font-semibold text-green-400 mb-3">1. Data We Collect</h2>
        <ul className="space-y-2 text-sm text-gray-300 list-disc list-inside">
          <li>Account information: email address and bcrypt-hashed password</li>
          <li>API usage: request paths, timestamps, and latency (for abuse prevention)</li>
          <li>Alert configurations you create (keywords, entities, thresholds)</li>
          <li>Supply-chain analyses you request (ticker symbols)</li>
        </ul>
        <p className="mt-3 text-sm text-gray-400">We do <strong className="text-white">not</strong> collect payment card data, government IDs, or biometric data.</p>
      </section>

      <section className="mb-8">
        <h2 className="text-lg font-semibold text-green-400 mb-3">2. How We Use Your Data</h2>
        <ul className="space-y-2 text-sm text-gray-300 list-disc list-inside">
          <li>Authenticate your session and scope your organisation's data</li>
          <li>Deliver intelligence alerts matching your configured watches</li>
          <li>Detect and prevent abuse (rate-limit violations, scraping)</li>
          <li>Improve system reliability via aggregate usage analytics</li>
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="text-lg font-semibold text-green-400 mb-3">3. Data Retention</h2>
        <ul className="space-y-2 text-sm text-gray-300 list-disc list-inside">
          <li>API audit logs: auto-purged after 90 days</li>
          <li>News articles and clusters: retained indefinitely for trend analysis</li>
          <li>Account data: retained until you delete your account</li>
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="text-lg font-semibold text-green-400 mb-3">4. Your Rights (GDPR / CCPA)</h2>
        <p className="text-sm text-gray-300 mb-3">You have the right to:</p>
        <ul className="space-y-2 text-sm text-gray-300 list-disc list-inside">
          <li><strong className="text-white">Access</strong> — request a copy of all data we hold about you</li>
          <li><strong className="text-white">Erasure</strong> — permanently delete your account and all associated data via <code className="text-green-400">DELETE /auth/me</code> or the account settings page</li>
          <li><strong className="text-white">Portability</strong> — export your alert configurations as JSON on request</li>
          <li><strong className="text-white">Correction</strong> — update your email by contacting support</li>
        </ul>
        <p className="mt-3 text-sm text-gray-400">To exercise any of these rights, email <span className="text-green-400">privacy@worldstate.ai</span></p>
      </section>

      <section className="mb-8">
        <h2 className="text-lg font-semibold text-green-400 mb-3">5. Third-Party Services</h2>
        <ul className="space-y-2 text-sm text-gray-300 list-disc list-inside">
          <li>OpenAI API — article embeddings and strategy generation (data not used for training per OpenAI API policy)</li>
          <li>Google Gemini API — cluster summarisation</li>
          <li>Finnhub API — financial data enrichment (anonymised ticker lookups)</li>
          <li>SEC EDGAR — public filing data (no personal data transmitted)</li>
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="text-lg font-semibold text-green-400 mb-3">6. Security</h2>
        <p className="text-sm text-gray-300">Passwords are hashed with bcrypt (cost factor 12). API tokens are signed JWTs with 24-hour expiry. All traffic is TLS-encrypted in production. Audit logs enable forensic review of all data access.</p>
      </section>

      <section className="mb-8">
        <h2 className="text-lg font-semibold text-green-400 mb-3">7. Contact</h2>
        <p className="text-sm text-gray-300">For privacy inquiries: <span className="text-green-400">privacy@worldstate.ai</span></p>
      </section>
    </div>
  )
}
