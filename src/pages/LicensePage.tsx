import React, { useState } from 'react';
import { Scale, Check, Copy, ExternalLink, ShieldCheck, AlertCircle, FileText, Github, Heart, Cpu, Code2, Sparkles, BookOpen } from 'lucide-react';
import { Footer } from '../components/Footer';
import backgroundImage from '../assets/images/background.jpg';
import { PageHeader } from '../components/PageHeader';
import { TransitionLink } from '../components/TransitionLink';
import { usePageMeta } from '../hooks/usePageMeta';

const MIT_LICENSE_TEXT = `MIT License

Copyright (c) 2026 Raymond Busuttil

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`;

const OPEN_SOURCE_ECOSYSTEM = [
  {
    name: 'Kokoro-JS',
    description: 'High-quality client-side text-to-speech engine running locally in WebAssembly and ONNX Runtime.',
    url: 'https://github.com/hexgrad/kokoro',
    license: 'Apache 2.0',
  },
  {
    name: 'WebLLM & MLC-LLM',
    description: 'Hardware-accelerated in-browser LLM inference engine powered by WebGPU.',
    url: 'https://github.com/mlc-ai/web-llm',
    license: 'Apache 2.0',
  },
  {
    name: 'PDF.js',
    description: 'General-purpose, web standards-compliant PDF parsing and rendering platform by Mozilla.',
    url: 'https://github.com/mozilla/pdf.js',
    license: 'Apache 2.0',
  },
  {
    name: 'Transformers.js',
    description: 'State-of-the-art machine learning in the browser by Hugging Face.',
    url: 'https://github.com/huggingface/transformers.js',
    license: 'Apache 2.0',
  },
  {
    name: 'FFmpeg.wasm',
    description: 'Pure WebAssembly / JavaScript port of FFmpeg for browser video encoding and muxing.',
    url: 'https://github.com/ffmpegwasm/ffmpeg.wasm',
    license: 'MIT',
  },
  {
    name: 'Lucide Icons',
    description: 'Beautiful, consistent, and lightweight open source icon library.',
    url: 'https://github.com/lucide-icons/lucide',
    license: 'ISC',
  },
];

export const LicensePage: React.FC = () => {
  usePageMeta({
    title: 'License — Origami AI',
    description:
      'Origami AI is free and open-source under the MIT License. Review the license and the open-source projects that power it.',
    path: '/license',
  });

  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(MIT_LICENSE_TEXT);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Fallback if clipboard API is restricted
      const textarea = document.createElement('textarea');
      textarea.value = MIT_LICENSE_TEXT;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  return (
    <div className="min-h-screen bg-branding-dark text-white pt-8 pb-2 flex flex-col px-4 sm:px-8">
      {/* Background Image */}
      <img
        src={backgroundImage}
        alt=""
        className="fixed inset-0 -z-50 w-full h-lvh object-cover opacity-40 blur-[2px] brightness-75 scale-105"
      />

      <PageHeader
        title="Origami"
        showBack
        showGithub={false}
        showHelp={false}
        showSettings={false}
      />

      {/* Main Content */}
      <main className="mx-auto max-w-4xl w-full mb-8 animate-slide-up">
        {/* Hero Card */}
        <div className="glass rounded-3xl border border-white/10 p-8 sm:p-12 mb-8 neon-border">
          <div className="flex items-start gap-4 mb-6">
            <div className="p-3 rounded-2xl border border-cyan-500/20 shrink-0">
              <Scale className="w-8 h-8 text-cyan-400" />
            </div>
            <div>
              <h1 className="text-4xl sm:text-5xl font-black tracking-tighter mb-2">
                <span className="text-transparent bg-clip-text bg-linear-to-r from-cyan-400 via-blue-500 to-purple-600">
                  Open Source License
                </span>
              </h1>
              <p className="text-cyan-400 font-bold text-sm uppercase tracking-wider">
                MIT License &bull; Free and Open Source Software (FOSS)
              </p>
            </div>
          </div>

          {/* Info Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-6 bg-white/5 rounded-2xl border border-white/5">
            <div className="flex items-center gap-3">
              <Code2 className="w-5 h-5 text-branding-accent shrink-0" />
              <div>
                <span className="text-white/40 text-xs font-bold uppercase tracking-wider">License Type</span>
                <p className="text-white font-bold">MIT License (SPDX: MIT)</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Heart className="w-5 h-5 text-pink-400 shrink-0" />
              <div>
                <span className="text-white/40 text-xs font-bold uppercase tracking-wider">Copyright</span>
                <p className="text-white font-bold">&copy; 2026 Raymond Busuttil</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Github className="w-5 h-5 text-branding-secondary shrink-0" />
              <div>
                <span className="text-white/40 text-xs font-bold uppercase tracking-wider">Repository</span>
                <a
                  href="https://github.com/TechMitten/Origami-AI"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-cyan-400 hover:text-cyan-300 font-bold flex items-center gap-1 transition-colors"
                >
                  TechMitten/Origami-AI
                  <ExternalLink className="w-3 h-3 inline" />
                </a>
              </div>
            </div>
          </div>

          <div className="mt-6 p-6 bg-branding-surface/50 rounded-2xl border border-white/10">
            <p className="text-white/80 text-sm leading-relaxed">
              Origami AI is open-source software licensed under the permissive <strong className="text-white font-bold">MIT License</strong>. You are free to use, modify, distribute, and integrate this software in private, educational, or commercial projects with minimal restrictions.
            </p>
          </div>
        </div>

        {/* Permissions & Conditions Breakdown */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          {/* Permissions */}
          <div className="glass rounded-2xl border border-emerald-500/20 p-6 bg-emerald-500/5">
            <div className="flex items-center gap-2 mb-4">
              <div className="p-1.5 rounded-lg text-emerald-400">
                <Check className="w-4 h-4" />
              </div>
              <h3 className="text-base font-bold text-white">Permissions</h3>
            </div>
            <ul className="space-y-2 text-xs text-white/70">
              <li className="flex items-start gap-2">
                <span className="text-emerald-400 font-bold shrink-0">✓</span>
                <span><strong className="text-white">Commercial Use:</strong> Use freely in commercial applications.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-emerald-400 font-bold shrink-0">✓</span>
                <span><strong className="text-white">Modification:</strong> Modify and create derivative works.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-emerald-400 font-bold shrink-0">✓</span>
                <span><strong className="text-white">Distribution:</strong> Distribute copies or forks of the code.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-emerald-400 font-bold shrink-0">✓</span>
                <span><strong className="text-white">Private Use:</strong> Run and customize privately or internally.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-emerald-400 font-bold shrink-0">✓</span>
                <span><strong className="text-white">Sublicensing:</strong> Grant sublicenses to modified software.</span>
              </li>
            </ul>
          </div>

          {/* Conditions */}
          <div className="glass rounded-2xl border border-blue-500/20 p-6 bg-blue-500/5">
            <div className="flex items-center gap-2 mb-4">
              <div className="p-1.5 rounded-lg text-blue-400">
                <ShieldCheck className="w-4 h-4" />
              </div>
              <h3 className="text-base font-bold text-white">Conditions</h3>
            </div>
            <ul className="space-y-2 text-xs text-white/70">
              <li className="flex items-start gap-2">
                <span className="text-blue-400 font-bold shrink-0">&bull;</span>
                <span><strong className="text-white">License Notice:</strong> A copy of the copyright and license notice must be included in all copies or substantial portions of the software.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-400 font-bold shrink-0">&bull;</span>
                <span><strong className="text-white">Preserve Attribution:</strong> Maintain original author copyright notices in source files.</span>
              </li>
            </ul>
          </div>

          {/* Limitations */}
          <div className="glass rounded-2xl border border-amber-500/20 p-6 bg-amber-500/5">
            <div className="flex items-center gap-2 mb-4">
              <div className="p-1.5 rounded-lg text-amber-400">
                <AlertCircle className="w-4 h-4" />
              </div>
              <h3 className="text-base font-bold text-white">Limitations</h3>
            </div>
            <ul className="space-y-2 text-xs text-white/70">
              <li className="flex items-start gap-2">
                <span className="text-amber-400 font-bold shrink-0">&times;</span>
                <span><strong className="text-white">No Liability:</strong> Authors and copyright holders are not liable for any damages or claims.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-amber-400 font-bold shrink-0">&times;</span>
                <span><strong className="text-white">No Warranty:</strong> The software is provided "as is", without warranty of any kind.</span>
              </li>
            </ul>
          </div>
        </div>

        {/* License Text Section */}
        <section className="glass rounded-2xl border border-white/10 p-6 sm:p-8 mb-8 hover:border-cyan-500/30 transition-all duration-300">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
            <div className="flex items-center gap-3">
              <FileText className="w-6 h-6 text-cyan-400" />
              <div>
                <h2 className="text-xl font-black text-white">Full License Text</h2>
                <p className="text-white/40 text-xs font-semibold">Official MIT License terms for Origami AI</p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleCopy}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/10 text-white text-xs font-bold transition-all active:scale-95 cursor-pointer"
                title="Copy license text to clipboard"
              >
                {copied ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-emerald-400">Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 text-white/70" />
                    <span>Copy Text</span>
                  </>
                )}
              </button>
              <a
                href="https://github.com/TechMitten/Origami-AI/blob/main/LICENSE"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white/80 hover:text-white text-xs font-bold transition-all"
              >
                <Github className="w-3.5 h-3.5" />
                <span>Raw on GitHub</span>
              </a>
            </div>
          </div>

          <div className="relative rounded-2xl bg-black/60 border border-white/10 p-6 overflow-x-auto">
            <pre className="font-mono text-xs sm:text-sm text-cyan-100/90 leading-relaxed whitespace-pre-wrap selection:bg-cyan-500/30 selection:text-white">
              {MIT_LICENSE_TEXT}
            </pre>
          </div>
        </section>

        {/* Why Open Source Section */}
        <section className="glass rounded-2xl border border-white/10 p-6 sm:p-8 mb-8 hover:border-branding-primary/30 transition-all duration-300">
          <div className="flex items-center gap-3 mb-6">
            <Sparkles className="w-6 h-6 text-branding-primary" />
            <div>
              <h2 className="text-xl font-black text-white">Why Open Source?</h2>
              <p className="text-white/40 text-xs font-semibold">Our commitment to privacy, transparency, and freedom</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-4 rounded-xl bg-white/5 border border-white/5 space-y-2">
              <div className="flex items-center gap-2 text-cyan-400 font-bold text-sm">
                <Cpu className="w-4 h-4" />
                <span>Local &amp; Private</span>
              </div>
              <p className="text-white/70 text-xs leading-relaxed">
                By making Origami open-source, you can verify that PDF parsing, video rendering, and local AI synthesis (via WebLLM and Kokoro) happen directly on your own device.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-white/5 border border-white/5 space-y-2">
              <div className="flex items-center gap-2 text-pink-400 font-bold text-sm">
                <BookOpen className="w-4 h-4" />
                <span>Fully Auditable</span>
              </div>
              <p className="text-white/70 text-xs leading-relaxed">
                Every line of code is open to community inspection. There are no hidden tracking scripts, proprietary vendor lock-ins, or opaque data collection pipelines.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-white/5 border border-white/5 space-y-2">
              <div className="flex items-center gap-2 text-purple-400 font-bold text-sm">
                <Code2 className="w-4 h-4" />
                <span>Extensible &amp; Forkable</span>
              </div>
              <p className="text-white/70 text-xs leading-relaxed">
                Build your own features, integrate custom LLM endpoints, or adapt Origami for your educational institution or enterprise workflows without licensing friction.
              </p>
            </div>
          </div>
        </section>

        {/* Third-Party Open Source Software Acknowledgements */}
        <section className="glass rounded-2xl border border-white/10 p-6 sm:p-8 mb-8 hover:border-branding-secondary/30 transition-all duration-300">
          <div className="flex items-center gap-3 mb-6">
            <Cpu className="w-6 h-6 text-branding-secondary" />
            <div>
              <h2 className="text-xl font-black text-white">Third-Party Open Source Technologies</h2>
              <p className="text-white/40 text-xs font-semibold">Origami is built on the shoulders of these incredible open-source projects</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {OPEN_SOURCE_ECOSYSTEM.map((project) => (
              <a
                key={project.name}
                href={project.url}
                target="_blank"
                rel="noopener noreferrer"
                className="group p-4 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 hover:border-white/20 transition-all duration-200 block"
              >
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <span className="font-bold text-sm text-white group-hover:text-cyan-400 transition-colors flex items-center gap-1.5">
                    {project.name}
                    <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </span>
                  <span className="px-2 py-0.5 rounded-md bg-white/10 text-[10px] font-mono font-bold text-white/70">
                    {project.license}
                  </span>
                </div>
                <p className="text-xs text-white/60 leading-relaxed">
                  {project.description}
                </p>
              </a>
            ))}
          </div>
        </section>

        {/* Community & Contributing Section */}
        <section className="glass rounded-2xl border border-white/10 p-6 sm:p-8 neon-border">
          <div className="text-center max-w-xl mx-auto">
            <div className="w-12 h-12 rounded-2xl border border-cyan-500/20 flex items-center justify-center mx-auto mb-4">
              <Github className="w-6 h-6 text-cyan-400" />
            </div>
            <h2 className="text-2xl font-black text-white mb-2">Contribute to Origami</h2>
            <p className="text-white/70 text-sm mb-6 leading-relaxed">
              Origami is actively developed and maintained by TechMitten LLC and passionate community contributors. Bug reports, feature suggestions, and pull requests are warmly welcomed!
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <a
                href="https://github.com/TechMitten/Origami-AI"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-linear-to-r from-cyan-500 to-blue-600 text-white font-bold text-sm shadow-lg shadow-cyan-500/25 border border-white/20 hover:scale-105 active:scale-95 transition-all"
              >
                <Github className="w-4 h-4" />
                GitHub Repository
              </a>
              <a
                href="https://github.com/TechMitten/Origami-AI/blob/main/CONTRIBUTING.md"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-white font-bold text-sm hover:scale-105 active:scale-95 transition-all"
              >
                <BookOpen className="w-4 h-4" />
                Contributing Guide
              </a>
              <TransitionLink
                to="/terms"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white/80 hover:text-white font-bold text-sm transition-all"
              >
                Terms of Service
              </TransitionLink>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
};

export default LicensePage;
