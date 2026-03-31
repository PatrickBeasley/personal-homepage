import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy | Patrick Beasley",
  description: "Privacy policy for patrickbeasley.com outlining data collection, retention, and handling practices.",
};

export default function PrivacyPage() {
  return (
    <div className="flex flex-col min-h-screen bg-white dark:bg-black">
      {/* Navigation */}
      <nav className="border-b border-zinc-200 dark:border-zinc-800 sticky top-0 bg-white/95 dark:bg-black/95 backdrop-blur">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="text-lg font-semibold text-black dark:text-white">
            Patrick Beasley
          </Link>
          <ul className="flex gap-8 text-sm font-medium">
            <li><Link href="/#about" className="text-zinc-600 dark:text-zinc-400 hover:text-black dark:hover:text-white">About</Link></li>
            <li><Link href="/resume" className="text-zinc-600 dark:text-zinc-400 hover:text-black dark:hover:text-white">Resume</Link></li>
            <li><Link href="/projects" className="text-zinc-600 dark:text-zinc-400 hover:text-black dark:hover:text-white">Projects</Link></li>
            <li><Link href="/blog" className="text-zinc-600 dark:text-zinc-400 hover:text-black dark:hover:text-white">Blog</Link></li>
            <li><Link href="/#contact" className="text-zinc-600 dark:text-zinc-400 hover:text-black dark:hover:text-white">Contact</Link></li>
          </ul>
        </div>
      </nav>

      <main className="flex-1 max-w-4xl mx-auto w-full px-6 py-16">
        <h1 className="text-4xl font-bold text-black dark:text-white mb-8">Privacy Policy</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-8">Last updated: March 2026</p>

        <article className="prose dark:prose-invert max-w-none">
          <h2 className="text-2xl font-bold text-black dark:text-white mt-8 mb-4">Overview</h2>
          <p className="text-zinc-700 dark:text-zinc-300 leading-relaxed mb-4">
            This Privacy Policy explains how I collect, use, and protect your information when you visit
            <strong> patrickbeasley.com</strong> (the &ldquo;Site&rdquo;). By accessing this Site, you consent to this policy.
          </p>

          <h2 className="text-2xl font-bold text-black dark:text-white mt-8 mb-4">1. Information We Collect</h2>
          <h3 className="text-lg font-semibold text-black dark:text-white mt-4 mb-2">Contact Form Data</h3>
          <p className="text-zinc-700 dark:text-zinc-300 leading-relaxed mb-4">
            When you submit a contact form, I collect:
          </p>
          <ul className="list-disc list-inside text-zinc-700 dark:text-zinc-300 mb-4">
            <li>Name</li>
            <li>Email address</li>
            <li>Message content</li>
            <li>Timestamp of submission</li>
          </ul>

          <h3 className="text-lg font-semibold text-black dark:text-white mt-4 mb-2">Automatically Collected Data</h3>
          <p className="text-zinc-700 dark:text-zinc-300 leading-relaxed mb-4">
            When you visit the Site, I may automatically collect:
          </p>
          <ul className="list-disc list-inside text-zinc-700 dark:text-zinc-300 mb-4">
            <li>IP address</li>
            <li>Browser type and version</li>
            <li>Pages visited and time spent</li>
            <li>Referring URL</li>
          </ul>
          <p className="text-zinc-700 dark:text-zinc-300 leading-relaxed mb-4 text-sm italic">
            This is handled by Vercel Analytics and Supabase logging.
          </p>

          <h2 className="text-2xl font-bold text-black dark:text-white mt-8 mb-4">2. Data Usage</h2>
          <p className="text-zinc-700 dark:text-zinc-300 leading-relaxed mb-4">
            I use the information collected for:
          </p>
          <ul className="list-disc list-inside text-zinc-700 dark:text-zinc-300 mb-4">
            <li>Responding to your contact form submissions</li>
            <li>Improving Site performance and user experience</li>
            <li>Analyzing trends and traffic patterns</li>
            <li>Complying with legal obligations</li>
          </ul>

          <h2 className="text-2xl font-bold text-black dark:text-white mt-8 mb-4">3. Data Retention</h2>
          <p className="text-zinc-700 dark:text-zinc-300 leading-relaxed mb-4">
            Contact form submissions are retained for <strong>12 months</strong> from the date of submission.
            After this period, data is automatically deleted. You may request deletion at any time.
          </p>
          <p className="text-zinc-700 dark:text-zinc-300 leading-relaxed mb-4">
            Analytics data follows Vercel and Supabase standard retention policies.
          </p>

          <h2 className="text-2xl font-bold text-black dark:text-white mt-8 mb-4">4. File Downloads</h2>
          <p className="text-zinc-700 dark:text-zinc-300 leading-relaxed mb-4">
            Files available for download (resume, portfolios, etc.) are public unless otherwise marked as private.
            Downloaded files are your responsibility to handle securely. Do not redistribute proprietary or confidential materials.
          </p>

          <h2 className="text-2xl font-bold text-black dark:text-white mt-8 mb-4">5. Third-Party Services</h2>
          <p className="text-zinc-700 dark:text-zinc-300 leading-relaxed mb-4">
            This Site uses the following third-party services:
          </p>
          <ul className="list-disc list-inside text-zinc-700 dark:text-zinc-300 mb-4">
            <li><strong>Vercel</strong> — Hosting and analytics</li>
            <li><strong>Supabase</strong> — Database and authentication</li>
            <li><strong>Google OAuth</strong> — Optional authentication</li>
          </ul>
          <p className="text-zinc-700 dark:text-zinc-300 leading-relaxed mb-4 text-sm">
            Each service has its own privacy policy. I encourage you to review them.
          </p>

          <h2 className="text-2xl font-bold text-black dark:text-white mt-8 mb-4">6. Your Rights</h2>
          <p className="text-zinc-700 dark:text-zinc-300 leading-relaxed mb-4">
            You have the right to:
          </p>
          <ul className="list-disc list-inside text-zinc-700 dark:text-zinc-300 mb-4">
            <li>Access your personal data</li>
            <li>Request correction or deletion</li>
            <li>Opt-out of analytics</li>
            <li>Withdraw consent at any time</li>
          </ul>

          <h2 className="text-2xl font-bold text-black dark:text-white mt-8 mb-4">7. Security</h2>
          <p className="text-zinc-700 dark:text-zinc-300 leading-relaxed mb-4">
            All data is transmitted over HTTPS and stored securely in Supabase. However, no method of transmission
            or storage is 100% secure. I am committed to protecting your information but cannot guarantee absolute security.
          </p>

          <h2 className="text-2xl font-bold text-black dark:text-white mt-8 mb-4">8. Contact</h2>
          <p className="text-zinc-700 dark:text-zinc-300 leading-relaxed mb-4">
            If you have questions about this Privacy Policy or wish to exercise your rights, please
            <Link href="/#contact" className="font-medium text-black dark:text-white hover:underline"> contact me</Link>.
          </p>

          <h2 className="text-2xl font-bold text-black dark:text-white mt-8 mb-4">9. Changes to This Policy</h2>
          <p className="text-zinc-700 dark:text-zinc-300 leading-relaxed">
            I may update this Privacy Policy periodically. Changes will be reflected with an updated &ldquo;Last updated&rdquo; date.
          </p>
        </article>
      </main>

      {/* Footer */}
      <footer className="border-t border-zinc-200 dark:border-zinc-800 mt-16 py-8 bg-zinc-50 dark:bg-zinc-900/50">
        <div className="max-w-4xl mx-auto px-6 text-center text-sm text-zinc-600 dark:text-zinc-400">
          <p>© {new Date().getFullYear()} Patrick Beasley. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
