import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Shield, Eye, Server, Lock, Cookie, Clock, Globe } from 'lucide-react';
import { Footer } from '../components/Footer';
import backgroundImage from '../assets/images/background.png';
import appLogo from '../assets/images/app-logo2.png';

export const PrivacyPolicy: React.FC = () => {
  return (
    <div className="min-h-screen bg-branding-dark text-white pt-8 pb-2 flex flex-col px-4 sm:px-8">
      {/* Background Image */}
      <img
        src={backgroundImage}
        alt=""
        className="fixed inset-0 -z-50 w-full h-lvh object-cover opacity-40 blur-[2px] brightness-75 scale-105"
      />

      {/* Header */}
      <header className="relative z-50 w-full mx-auto mb-10 h-16 flex items-center justify-between px-4 sm:px-6 lg:px-8 transition-all duration-500 max-w-7xl">
        {/* Left: Logo */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl shadow-lg shadow-blue-500/20 hover:shadow-blue-500/40 transition-all duration-500 hover:scale-105">
            <img src={appLogo} alt="Logo" className="w-full h-full object-cover rounded-xl" />
          </div>
          <h1 className="hidden sm:block text-2xl sm:text-3xl font-black tracking-tighter uppercase italic text-transparent bg-clip-text bg-linear-to-r from-cyan-400 via-blue-500 to-purple-600 drop-shadow-sm">
            Origami
          </h1>
        </div>

        {/* Right: Back Button */}
        <Link
          to="/"
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-white/60 hover:text-white hover:bg-white/10 transition-all text-sm font-bold"
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="hidden sm:inline">Back to App</span>
        </Link>
      </header>

      {/* Main Content */}
      <main className="mx-auto max-w-4xl w-full mb-8 animate-slide-up">
        {/* Hero Card */}
        <div className="glass rounded-3xl border border-white/10 p-8 sm:p-12 mb-8 neon-border">
          <div className="flex items-start gap-4 mb-6">
            <div className="p-3 rounded-2xl bg-branding-primary/10 border border-branding-primary/20 shrink-0">
              <Shield className="w-8 h-8 text-branding-primary" />
            </div>
            <div>
              <h1 className="text-4xl sm:text-5xl font-black tracking-tighter mb-2">
                <span className="text-transparent bg-clip-text bg-linear-to-r from-cyan-400 via-blue-500 to-purple-600">
                  Privacy Policy
                </span>
              </h1>
              <p className="text-branding-primary font-bold text-sm uppercase tracking-wider">Origami by IslandApps</p>
            </div>
          </div>

          {/* Info Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-6 bg-white/5 rounded-2xl border border-white/5">
            <div className="flex items-center gap-3">
              <Clock className="w-5 h-5 text-branding-accent shrink-0" />
              <div>
                <span className="text-white/40 text-xs font-bold uppercase tracking-wider">Effective Date</span>
                <p className="text-white font-bold">February 17, 2026</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Globe className="w-5 h-5 text-branding-accent shrink-0" />
              <div>
                <span className="text-white/40 text-xs font-bold uppercase tracking-wider">Website</span>
                <p className="text-white font-bold">origami.islandapps.dev</p>
              </div>
            </div>
          </div>
        </div>

        {/* Sections */}
        <div className="space-y-6">
          {/* Section 1: Summary */}
          <section className="glass rounded-2xl border border-white/10 p-6 sm:p-8 hover:border-branding-primary/30 transition-all duration-300">
            <div className="flex items-center gap-3 mb-4">
              <Eye className="w-6 h-6 text-branding-primary" />
              <h2 className="text-xl font-black text-white">1) How Origami Works</h2>
            </div>
            <div className="space-y-3 text-white/70 text-sm leading-relaxed">
              <p>
                Origami is designed so that the PDF documents you upload and the content Origami generates from them (such as slide content and narration) are processed and stored <strong className="text-branding-primary">locally in your browser</strong>.
              </p>
              <p>
                Origami uses in-browser AI components (including WebLLM and the Kokoro browser version) to generate narration scripts and narration audio on your device.
              </p>
              <div className="mt-4 p-4 bg-branding-primary/5 border border-branding-primary/20 rounded-xl">
                <p className="text-white/60 text-xs">
                  Even though content processing happens on your device, some information may still be collected through standard website operations (like analytics, hosting logs, and third-party assets), as described below.
                </p>
              </div>
            </div>
          </section>

          {/* Section 2: Information We Collect */}
          <section className="glass rounded-2xl border border-white/10 p-6 sm:p-8 hover:border-branding-primary/30 transition-all duration-300">
            <div className="flex items-center gap-3 mb-4">
              <Server className="w-6 h-6 text-branding-secondary" />
              <h2 className="text-xl font-black text-white">2) Information We Collect</h2>
            </div>

            <div className="space-y-6 text-white/70 text-sm leading-relaxed">
              <div>
                <h3 className="text-base font-bold text-white mb-3">A. Content You Provide (Processed Locally)</h3>
                <p className="mb-3">When you use the Service, you may upload a PDF and generate outputs such as narrated slides:</p>
                <ul className="space-y-2 ml-4">
                  {['PDFs you upload', 'Content extracted from PDFs (text/images)', 'Generated slide content and slide decks', 'Generated narration scripts', 'Generated narration audio'].map((item, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="text-branding-primary mt-1">•</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-4 p-4 bg-branding-accent/10 border border-branding-accent/30 rounded-xl">
                  <p className="font-semibold text-branding-accent text-xs uppercase tracking-wider mb-1">Where this data lives</p>
                  <p className="text-white/80 text-xs">This content is processed and stored in your browser, including via <strong>localStorage</strong>. We do not intentionally collect or store this document content on our servers.</p>
                </div>
              </div>

              <div>
                <h3 className="text-base font-bold text-white mb-3">B. Analytics Data</h3>
                <p className="mb-3">We use analytics tools (including <strong>Google Analytics</strong> and <strong>Umami</strong>) to understand how the Service is used:</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                  {['Pages viewed and actions', 'Device and browser info', 'Referring/exit pages', 'General usage metrics'].map((item, i) => (
                    <div key={i} className="flex items-center gap-2 p-2 bg-white/5 rounded-lg">
                      <span className="text-branding-secondary">→</span>
                      <span className="text-xs">{item}</span>
                    </div>
                  ))}
                </div>
                <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl">
                  <p className="text-red-400 font-bold text-xs uppercase tracking-wider mb-2">Analytics DO NOT collect:</p>
                  <ul className="space-y-1 text-xs">
                    <li>• Full IP addresses</li>
                    <li>• Precise geolocation</li>
                    <li>• Session replay or screen recording</li>
                  </ul>
                </div>
              </div>

              <div>
                <h3 className="text-base font-bold text-white mb-3">C. Hosting and Server Logs</h3>
                <p className="mb-3">The Service is hosted on self-hosted infrastructure (Dokploy). Server logs may include:</p>
                <div className="flex flex-wrap gap-2">
                  {['IP address', 'User agent', 'Timestamps', 'Requested URLs'].map((item, i) => (
                    <span key={i} className="px-3 py-1 bg-white/5 rounded-full text-xs border border-white/10">{item}</span>
                  ))}
                </div>
              </div>

              <div>
                <h3 className="text-base font-bold text-white mb-3">D. Third-Party Resources</h3>
                <p className="mb-3">We use third-party resources that may receive device/network information:</p>
                <ul className="space-y-2 ml-4">
                  <li className="flex items-start gap-2">
                    <span className="text-branding-accent mt-1">•</span>
                    <span><strong className="text-white">Google Fonts</strong></span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-branding-accent mt-1">•</span>
                    <span><strong className="text-white">CDN for ffmpeg</strong> (client-side media processing)</span>
                  </li>
                </ul>
                <p className="mt-3 text-xs text-white/50 italic">Their handling of information is governed by their own privacy policies.</p>
              </div>

              <div>
                <h3 className="text-base font-bold text-white mb-3">E. Information You Send Us</h3>
                <p>If you contact us (e.g., by email), we will receive the contents of your message and contact information, and we'll use it to respond.</p>
              </div>
            </div>
          </section>

          {/* Section 3: How We Use Information */}
          <section className="glass rounded-2xl border border-white/10 p-6 sm:p-8 hover:border-branding-primary/30 transition-all duration-300">
            <div className="flex items-center gap-3 mb-4">
              <svg className="w-6 h-6 text-branding-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <h2 className="text-xl font-black text-white">3) How We Use Information</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[
                'Provide and maintain the Service',
                'Monitor performance, fix bugs, improve features',
                'Understand usage trends (analytics)',
                'Secure the Service, prevent abuse',
                'Comply with legal obligations'
              ].map((item, i) => (
                <div key={i} className="flex items-start gap-2 p-3 bg-white/5 rounded-xl">
                  <span className="text-branding-primary shrink-0">{i + 1}.</span>
                  <span className="text-xs text-white/70">{item}</span>
                </div>
              ))}
            </div>
          </section>

          {/* Section 4: Data Sharing */}
          <section className="glass rounded-2xl border border-white/10 p-6 sm:p-8 hover:border-branding-primary/30 transition-all duration-300">
            <div className="flex items-center gap-3 mb-4">
              <svg className="w-6 h-6 text-branding-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
              </svg>
              <h2 className="text-xl font-black text-white">4) How We Share Information</h2>
            </div>
            <div className="space-y-4 text-white/70 text-sm leading-relaxed">
              <div>
                <h3 className="text-base font-bold text-white mb-2">A. Service Providers</h3>
                <ul className="space-y-2 ml-4">
                  <li className="flex items-start gap-2">
                    <span className="text-branding-secondary mt-1">•</span>
                    <span>Analytics providers (e.g., Google Analytics, Umami)</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-branding-secondary mt-1">•</span>
                    <span>Infrastructure providers (hosting, monitoring, CDNs)</span>
                  </li>
                </ul>
              </div>
              <div>
                <h3 className="text-base font-bold text-white mb-2">B. Legal and Safety</h3>
                <ul className="space-y-2 ml-4">
                  <li className="flex items-start gap-2">
                    <span className="text-branding-secondary mt-1">•</span>
                    <span>Comply with law, regulation, legal process</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-branding-secondary mt-1">•</span>
                    <span>Protect rights, safety, and security</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-branding-secondary mt-1">•</span>
                    <span>Investigate or prevent fraud, abuse, or security issues</span>
                  </li>
                </ul>
              </div>
              <div className="mt-4 p-4 bg-branding-primary/5 border border-branding-primary/20 rounded-xl">
                <p className="font-semibold text-branding-primary text-xs uppercase tracking-wider mb-2">Important Note</p>
                <p className="text-white/80 text-xs">Because Origami processes and stores content in your browser, we typically do not have access to uploaded documents. If we receive a legal request, we can only provide analytics data, server logs, and information you send us directly.</p>
              </div>
            </div>
          </section>

          {/* Section 5: Cookies */}
          <section className="glass rounded-2xl border border-white/10 p-6 sm:p-8 hover:border-branding-primary/30 transition-all duration-300">
            <div className="flex items-center gap-3 mb-4">
              <Cookie className="w-6 h-6 text-branding-accent" />
              <h2 className="text-xl font-black text-white">5) Cookies and Similar Technologies</h2>
            </div>
            <p className="text-white/70 text-sm leading-relaxed">
              We use cookies for analytics. Cookies are small text files placed on your device. You can control cookies through your browser settings, including blocking or deleting cookies. If you disable cookies, some analytics functionality may not work as intended (the Service itself should still function).
            </p>
          </section>

          {/* Section 6: Data Retention */}
          <section className="glass rounded-2xl border border-white/10 p-6 sm:p-8 hover:border-branding-primary/30 transition-all duration-300">
            <div className="flex items-center gap-3 mb-4">
              <Clock className="w-6 h-6 text-branding-secondary" />
              <h2 className="text-xl font-black text-white">6) Data Retention</h2>
            </div>
            <div className="space-y-3">
              <div className="p-4 bg-white/5 rounded-xl border border-white/10">
                <p className="text-branding-primary font-bold text-xs uppercase tracking-wider mb-2">In-browser content</p>
                <p className="text-white/70 text-xs">Uploaded PDFs and generated outputs may persist in your browser via <strong>localStorage</strong> until you clear it.</p>
              </div>
              <div className="p-4 bg-white/5 rounded-xl border border-white/10">
                <p className="text-branding-primary font-bold text-xs uppercase tracking-wider mb-2">Analytics and logs</p>
                <p className="text-white/70 text-xs">We retain analytics and server logs for as long as reasonably necessary for improving the Service, maintaining security, and complying with legal obligations.</p>
              </div>
            </div>
          </section>

          {/* Section 7: Your Choices */}
          <section className="glass rounded-2xl border border-white/10 p-6 sm:p-8 hover:border-branding-primary/30 transition-all duration-300">
            <div className="flex items-center gap-3 mb-4">
              <svg className="w-6 h-6 text-branding-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <h2 className="text-xl font-black text-white">7) Your Choices and Controls</h2>
            </div>
            <div className="space-y-4 text-white/70 text-sm leading-relaxed">
              <div>
                <h3 className="text-base font-bold text-white mb-2">A. Clearing Your Origami Data</h3>
                <p>Origami does not currently provide an in-app "clear data" button. To remove Origami content stored in localStorage, you can clear the site's storage via your browser settings (often listed as "site data," "cookies and site data," or "storage").</p>
              </div>
              <div>
                <h3 className="text-base font-bold text-white mb-2">B. Cookie Controls</h3>
                <p>You can manage or disable cookies through your browser settings. Some browsers also let you block third-party requests.</p>
              </div>
              <div>
                <h3 className="text-base font-bold text-white mb-2">C. Do Not Track</h3>
                <p>Some browsers send "Do Not Track" signals. Because there is no consistent industry standard for interpreting these signals, we do not respond to them in a uniform way.</p>
              </div>
            </div>
          </section>

          {/* Sections 8-12 Compact */}
          <div className="grid grid-cols-1 gap-4">
            {[
              {
                icon: <Lock className="w-5 h-5" />,
                title: "8) Children's Privacy",
                content: "Origami is NOT intended for children under 13. We do not knowingly collect personal information from children under 13.",
                color: "text-branding-accent"
              },
              {
                icon: <Shield className="w-5 h-5" />,
                title: "9) Security",
                content: "We take reasonable steps to help protect information. However, no website or system is 100% secure. You are responsible for maintaining the security of your device and browser environment.",
                color: "text-branding-primary"
              },
              {
                icon: <Globe className="w-5 h-5" />,
                title: "10) International Visitors",
                content: "We operate in the United States. If you access the Service from outside the U.S., information may be processed in the United States and other locations where our service providers operate.",
                color: "text-branding-secondary"
              },
              {
                icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>,
                title: "11) Changes to This Policy",
                content: "We may update this Privacy Policy from time to time. When we do, we will revise the 'Effective date' at the top. Your continued use of Origami after changes means you accept the updated policy.",
                color: "text-white/60"
              }
            ].map((section, i) => (
              <section key={i} className="glass rounded-2xl border border-white/10 p-5 hover:border-branding-primary/30 transition-all duration-300">
                <div className="flex items-start gap-3">
                  <div className={`${section.color} shrink-0 mt-0.5`}>{section.icon}</div>
                  <div>
                    <h3 className="text-base font-black text-white mb-2">{section.title}</h3>
                    <p className="text-white/70 text-xs leading-relaxed">{section.content}</p>
                  </div>
                </div>
              </section>
            ))}
          </div>

          {/* Contact Section */}
          <section className="glass rounded-2xl border border-white/10 p-6 sm:p-8 neon-border">
            <div className="text-center">
              <h2 className="text-2xl font-black text-white mb-3">12) Contact Us</h2>
              <p className="text-white/70 text-sm mb-6">If you have questions about this Privacy Policy or our privacy practices:</p>
              <a
                href="mailto:privacy@islandapps.dev"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-linear-to-r from-branding-primary to-branding-secondary text-white font-bold shadow-lg shadow-branding-primary/30 border border-white/20"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                privacy@islandapps.dev
              </a>
            </div>
          </section>
        </div>
      </main>

      <Footer />
    </div>
  );
};
