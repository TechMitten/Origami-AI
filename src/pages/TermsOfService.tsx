import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, FileText, User, Shield, AlertTriangle, Eye, Ban, Share2, Building2, Scale } from 'lucide-react';
import { Footer } from '../components/Footer';
import backgroundImage from '../assets/images/background.png';
import appLogo from '../assets/images/app-logo2.png';

export const TermsOfService: React.FC = () => {
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
            <div className="p-3 rounded-2xl bg-branding-secondary/10 border border-branding-secondary/20 shrink-0">
              <FileText className="w-8 h-8 text-branding-secondary" />
            </div>
            <div>
              <h1 className="text-4xl sm:text-5xl font-black tracking-tighter mb-2">
                <span className="text-transparent bg-clip-text bg-linear-to-r from-cyan-400 via-blue-500 to-purple-600">
                  Terms of Service
                </span>
              </h1>
              <p className="text-branding-secondary font-bold text-sm uppercase tracking-wider">Origami by IslandApps</p>
            </div>
          </div>

          {/* Info Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-6 bg-white/5 rounded-2xl border border-white/5">
            <div className="flex items-center gap-3">
              <Building2 className="w-5 h-5 text-branding-accent shrink-0" />
              <div>
                <span className="text-white/40 text-xs font-bold uppercase tracking-wider">Operated by</span>
                <p className="text-white font-bold">IslandApps</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <svg className="w-5 h-5 text-branding-accent shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <div>
                <span className="text-white/40 text-xs font-bold uppercase tracking-wider">Effective Date</span>
                <p className="text-white font-bold">February 17, 2026</p>
              </div>
            </div>
          </div>

          <div className="mt-6 p-6 bg-branding-surface/50 rounded-2xl border border-white/10">
            <p className="text-white/70 text-sm leading-relaxed">
              These Terms of Service ("Terms") govern your access to and use of Origami (the "Service"). By accessing or using the Service, you agree to these Terms. If you do not agree, do not use the Service.
            </p>
          </div>
        </div>

        {/* Sections */}
        <div className="space-y-6">
          {/* Section 1-3 */}
          <section className="glass rounded-2xl border border-white/10 p-6 sm:p-8 hover:border-branding-primary/30 transition-all duration-300">
            <div className="flex items-center gap-3 mb-4">
              <User className="w-6 h-6 text-branding-primary" />
              <h2 className="text-xl font-black text-white">Eligibility & Service Overview</h2>
            </div>
            <div className="space-y-4 text-white/70 text-sm leading-relaxed">
              <div>
                <h3 className="text-base font-bold text-white mb-2">1) Who We Are</h3>
                <p>The Service is operated by IslandApps ("IslandApps," "we," "us," or "our").</p>
              </div>
              <div>
                <h3 className="text-base font-bold text-white mb-2">2) Eligibility</h3>
                <p>The Service is not intended for children under 13. By using the Service, you represent that you are at least 13 years old (or the age of digital consent in your jurisdiction, if higher).</p>
              </div>
              <div>
                <h3 className="text-base font-bold text-white mb-2">3) The Service</h3>
                <p className="mb-3">Origami allows users to upload PDF documents and convert them into narrated slides using AI. You understand that:</p>
                <ul className="space-y-2 ml-4">
                  <li className="flex items-start gap-2">
                    <span className="text-branding-primary mt-1">•</span>
                    <span>Results may be inaccurate, incomplete, or inappropriate for your needs.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-branding-primary mt-1">•</span>
                    <span>You are responsible for how you use outputs from the Service.</span>
                  </li>
                </ul>
              </div>
            </div>
          </section>

          {/* Section 4: Accounts */}
          <section className="glass rounded-2xl border border-white/10 p-6 sm:p-8 hover:border-branding-primary/30 transition-all duration-300">
            <div className="flex items-center gap-3 mb-4">
              <Eye className="w-6 h-6 text-branding-secondary" />
              <h2 className="text-xl font-black text-white">4) Accounts</h2>
            </div>
            <p className="text-white/70 text-sm leading-relaxed">
              No account is required to use the Service.
            </p>
          </section>

          {/* Section 5: Content & Ownership */}
          <section className="glass rounded-2xl border border-white/10 p-6 sm:p-8 hover:border-branding-primary/30 transition-all duration-300">
            <div className="flex items-center gap-3 mb-4">
              <Shield className="w-6 h-6 text-branding-accent" />
              <h2 className="text-xl font-black text-white">5) Your Content and Ownership</h2>
            </div>
            <div className="space-y-4 text-white/70 text-sm leading-relaxed">
              <div className="p-4 bg-branding-primary/10 border border-branding-primary/30 rounded-xl">
                <p className="font-semibold text-branding-primary text-sm mb-2">You Retain Ownership</p>
                <p className="text-white/80 text-xs">You retain ownership of any PDFs you upload and any outputs you generate using the Service (including slide content, narration scripts, and narration audio), to the extent you have rights in that content. IslandApps does NOT claim ownership of your content.</p>
              </div>
              <div>
                <h3 className="text-base font-bold text-white mb-2">License to Operate the Service</h3>
                <p>To the extent a license is legally required to provide the Service (for example, to process content on your device at your request), you grant IslandApps a limited, non-exclusive, worldwide, royalty-free license to use your content <strong>solely to operate and provide the Service</strong>. This license is limited to what is necessary for the Service to function.</p>
              </div>
            </div>
          </section>

          {/* Section 6: Responsibilities */}
          <section className="glass rounded-2xl border border-white/10 p-6 sm:p-8 hover:border-branding-primary/30 transition-all duration-300">
            <div className="flex items-center gap-3 mb-4">
              <svg className="w-6 h-6 text-branding-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <h2 className="text-xl font-black text-white">6) Your Responsibilities</h2>
            </div>
            <p className="text-white/70 text-sm leading-relaxed mb-3">You agree that you will:</p>
            <ul className="space-y-2 ml-4 text-white/70 text-sm">
              <li className="flex items-start gap-2">
                <span className="text-branding-primary mt-1">•</span>
                <span>Use the Service only in compliance with applicable laws and regulations</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-branding-primary mt-1">•</span>
                <span>Ensure you have all rights, permissions, and consents needed to upload any PDF or other material</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-branding-primary mt-1">•</span>
                <span>Be responsible for all decisions made, actions taken, and outcomes resulting from your use</span>
              </li>
            </ul>
          </section>

          {/* Section 7: Prohibited Uses */}
          <section className="glass rounded-2xl border border-white/10 p-6 sm:p-8 hover:border-branding-primary/30 transition-all duration-300">
            <div className="flex items-center gap-3 mb-4">
              <Ban className="w-6 h-6 text-red-400" />
              <h2 className="text-xl font-black text-white">7) Prohibited Uses</h2>
            </div>
            <p className="text-white/70 text-sm leading-relaxed mb-3">You agree not to, and not to help others to:</p>
            <div className="grid grid-cols-1 gap-2">
              {[
                'Use the Service for any illegal purpose',
                'Upload or process content that infringes intellectual property rights',
                'Upload malware or attempt to disrupt, damage, or gain unauthorized access',
                'Reverse engineer or decompile the Service (except as permitted by law)',
                'Scrape, crawl, or use automated means to bypass access controls',
                'Interfere with or circumvent security or rate-limiting features',
                'Use the Service to harass, abuse, threaten, or harm others'
              ].map((item, i) => (
                <div key={i} className="flex items-start gap-2 p-3 bg-red-500/5 border border-red-500/20 rounded-lg">
                  <span className="text-red-400 shrink-0 mt-0.5">✕</span>
                  <span className="text-xs text-white/70">{item}</span>
                </div>
              ))}
            </div>
          </section>

          {/* Section 8-10 */}
          <div className="grid grid-cols-1 gap-4">
            <section className="glass rounded-2xl border border-white/10 p-6 sm:p-8 hover:border-branding-primary/30 transition-all duration-300">
              <div className="flex items-center gap-3 mb-4">
                <Share2 className="w-6 h-6 text-branding-accent" />
                <h2 className="text-xl font-black text-white">8) Publishing and Sharing Outputs</h2>
              </div>
              <div className="space-y-3 text-white/70 text-sm leading-relaxed">
                <p>You may publish, share, or use outputs generated by the Service, including for commercial purposes, <strong>as long as your use is lawful</strong> and you have the rights to do so.</p>
                <p className="font-semibold text-white">You are solely responsible for:</p>
                <ul className="space-y-1 ml-4 text-xs">
                  <li>• Reviewing outputs for accuracy and suitability</li>
                  <li>• Ensuring outputs do not violate laws or third-party rights</li>
                </ul>
              </div>
            </section>

            <section className="glass rounded-2xl border border-white/10 p-6 sm:p-8 hover:border-branding-primary/30 transition-all duration-300">
              <div className="flex items-center gap-3 mb-4">
                <Building2 className="w-6 h-6 text-branding-secondary" />
                <h2 className="text-xl font-black text-white">9) Third-Party Services</h2>
              </div>
              <p className="text-white/70 text-sm leading-relaxed">
                The Service may rely on or include third-party services or content (for example, analytics providers, fonts, CDNs, or other dependencies). We are not responsible for third-party services, and your use of them may be governed by their own terms and policies.
              </p>
            </section>

            <section className="glass rounded-2xl border border-white/10 p-6 sm:p-8 hover:border-branding-primary/30 transition-all duration-300">
              <div className="flex items-center gap-3 mb-4">
                <svg className="w-6 h-6 text-branding-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                <h2 className="text-xl font-black text-white">10) Privacy</h2>
              </div>
              <p className="text-white/70 text-sm leading-relaxed">
                Our collection and use of information is described in our <Link to="/privacy" className="text-branding-primary hover:text-branding-accent transition-colors font-bold underline">Privacy Policy</Link>. By using the Service, you agree that we can collect and use information as described there.
              </p>
            </section>
          </div>

          {/* Section 11-13: Legal */}
          <section className="glass rounded-2xl border border-white/10 p-6 sm:p-8 neon-border">
            <div className="flex items-center gap-3 mb-4">
              <Scale className="w-6 h-6 text-branding-accent" />
              <h2 className="text-xl font-black text-white">Legal Terms</h2>
            </div>
            <div className="space-y-4 text-white/70 text-sm leading-relaxed">
              <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl">
                <p className="font-bold text-red-400 text-xs uppercase tracking-wider mb-2">11) Disclaimers</p>
                <p className="text-white/80 text-xs mb-2"><strong>THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE."</strong></p>
                <p className="text-white/60 text-xs">TO THE MAXIMUM EXTENT PERMITTED BY LAW, ISLANDAPPS DISCLAIMS ALL WARRANTIES, EXPRESS OR IMPLIED. AI-generated outputs may contain errors, bias, or misleading information. You are responsible for verifying outputs before relying on them.</p>
              </div>

              <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl">
                <p className="font-bold text-amber-400 text-xs uppercase tracking-wider mb-2">12) Limitation of Liability</p>
                <p className="text-white/80 text-xs mb-2">TO THE MAXIMUM EXTENT PERMITTED BY LAW, ISLANDAPPS WILL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES.</p>
                <p className="text-white/60 text-xs"><strong>Maximum Liability:</strong> The greater of US $100 or the amount you paid in the 12 months before the claim.</p>
              </div>

              <div className="p-4 bg-white/5 rounded-xl border border-white/10">
                <p className="font-bold text-white text-xs uppercase tracking-wider mb-2">13) Indemnification</p>
                <p className="text-white/70 text-xs">You agree to defend, indemnify, and hold harmless IslandApps from claims arising from your use of the Service, your content, your violation of these Terms, or your violation of any rights of another person or entity.</p>
              </div>
            </div>
          </section>

          {/* Section 14-17 */}
          <div className="grid grid-cols-1 gap-4">
            {[
              {
                icon: <AlertTriangle className="w-5 h-5" />,
                title: "14) Suspension and Termination",
                content: "We may suspend or terminate your access to the Service at any time if we reasonably believe you have violated these Terms, your use creates risk or potential legal exposure, or your use could harm the Service, other users, or the public.",
                color: "text-amber-400"
              },
              {
                icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>,
                title: "15) Changes to the Service",
                content: "We may modify, suspend, or discontinue the Service (in whole or in part) at any time.",
                color: "text-branding-primary"
              },
              {
                icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>,
                title: "16) Changes to These Terms",
                content: "We may update these Terms from time to time. When we do, we will update the 'Effective date' above. By continuing to use the Service after changes become effective, you agree to the updated Terms.",
                color: "text-branding-secondary"
              },
              {
                icon: <Scale className="w-5 h-5" />,
                title: "17) Governing Law",
                content: "These Terms are governed by the laws of the State of Michigan, excluding its conflict of laws principles, except where applicable law requires otherwise.",
                color: "text-branding-accent"
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

          {/* Section 18: Arbitration */}
          <section className="glass rounded-2xl border border-white/10 p-6 sm:p-8 neon-border bg-branding-accent/5">
            <div className="flex items-center gap-3 mb-4">
              <Scale className="w-6 h-6 text-branding-accent" />
              <h2 className="text-xl font-black text-white">18) Arbitration Agreement</h2>
            </div>
            <div className="p-4 bg-branding-accent/10 border border-branding-accent/30 rounded-xl mb-4">
              <p className="font-bold text-branding-accent text-xs uppercase tracking-wider">
                PLEASE READ THIS SECTION CAREFULLY. IT AFFECTS YOUR LEGAL RIGHTS.
              </p>
            </div>
            <div className="space-y-4 text-white/70 text-xs leading-relaxed">
              <div>
                <h4 className="text-sm font-bold text-white mb-2">A. Agreement to Arbitrate</h4>
                <p>Disputes will be resolved by binding individual arbitration, rather than in court, except either party may bring claims in small claims court or seek injunctive relief for IP misuse or security breaches.</p>
              </div>
              <div>
                <h4 className="text-sm font-bold text-white mb-2">B. No Class Actions</h4>
                <p>Disputes must be brought only in an individual capacity. The arbitrator may not consolidate claims or preside over class or representative proceedings.</p>
              </div>
              <div>
                <h4 className="text-sm font-bold text-white mb-2">C. Arbitration Rules and Forum</h4>
                <p>Administered by the American Arbitration Association (AAA) under Consumer Arbitration Rules. Arbitration takes place in Michigan.</p>
              </div>
              <div>
                <h4 className="text-sm font-bold text-white mb-2">D. Costs</h4>
                <p>Payment governed by AAA rules. We will not seek to discourage arbitration through unreasonable fees.</p>
              </div>
              <div className="p-3 bg-branding-primary/10 border border-branding-primary/30 rounded-xl">
                <h4 className="text-sm font-bold text-branding-primary mb-1">E. Opt-Out</h4>
                <p className="text-white/80">You may opt out of this arbitration agreement by emailing <a href="mailto:terms@islandapps.dev" className="text-branding-primary hover:text-branding-accent underline font-bold">terms@islandapps.dev</a> within 30 days of first accepting these Terms, stating that you are opting out of arbitration.</p>
              </div>
            </div>
          </section>

          {/* Contact Section */}
          <section className="glass rounded-2xl border border-white/10 p-6 sm:p-8 neon-border">
            <div className="text-center">
              <h2 className="text-2xl font-black text-white mb-3">19) Contact Us</h2>
              <p className="text-white/70 text-sm mb-6">Questions about these Terms can be sent to:</p>
              <a
                href="mailto:terms@islandapps.dev"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-linear-to-r from-branding-primary to-branding-secondary text-white font-bold shadow-lg shadow-branding-primary/30 border border-white/20"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                terms@islandapps.dev
              </a>
            </div>
          </section>
        </div>
      </main>

      <Footer />
    </div>
  );
};
