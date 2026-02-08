import { useState, useEffect } from 'react';
import { X, Chrome, ExternalLink, AlertTriangle } from 'lucide-react';

type BrowserType = 'chrome' | 'edge' | 'firefox' | 'safari' | 'other';

interface BrowserInstructions {
  title: string;
  icon: React.ReactNode;
  instructions: React.ReactNode;
  docsLink?: string;
}

const detectBrowser = (): BrowserType => {
  const ua = navigator.userAgent;
  if (ua.includes('Edg/') || ua.includes('Edge/')) return 'edge';
  if (ua.includes('Chrome/') && !ua.includes('Edg/')) return 'chrome';
  if (ua.includes('Firefox/')) return 'firefox';
  if (ua.includes('Safari/') && !ua.includes('Chrome/')) return 'safari';
  return 'other';
};

const getBrowserInstructions = (browser: BrowserType): BrowserInstructions => {
  switch (browser) {
    case 'chrome':
      return {
        title: 'Enable WebGPU in Google Chrome',
        icon: <Chrome className="w-6 h-6" />,
        instructions: (
          <div className="space-y-4">
            <p className="text-gray-800">WebGPU requires Chrome 113 or later with hardware acceleration enabled.</p>
            <ol className="space-y-3 text-gray-700 text-sm">
              <li className="flex gap-3">
                <span className="shrink-0 w-6 h-6 rounded-full bg-orange-500 text-white flex items-center justify-center text-xs font-bold shadow-md">1</span>
                <span>Open Chrome settings: <code className="px-2 py-1 rounded bg-gray-100 text-orange-600 font-mono text-xs border border-gray-200">chrome://settings/system</code></span>
              </li>
              <li className="flex gap-3">
                <span className="shrink-0 w-6 h-6 rounded-full bg-orange-500 text-white flex items-center justify-center text-xs font-bold shadow-md">2</span>
                <span>Ensure <strong className="text-gray-900">"Use graphics acceleration when available"</strong> is turned ON</span>
              </li>
              <li className="flex gap-3">
                <span className="shrink-0 w-6 h-6 rounded-full bg-orange-500 text-white flex items-center justify-center text-xs font-bold shadow-md">3</span>
                <span>Relaunch Chrome and return to this page</span>
              </li>
            </ol>
            <div className="mt-4 p-4 rounded-xl bg-blue-50 border-2 border-blue-200">
              <p className="text-sm text-gray-700">
                <strong className="text-blue-900">Still not working?</strong> Your GPU might not support WebGPU. Check if your browser supports it at: <a href="https://webgpureport.org/" target="_blank" rel="noopener noreferrer" className="text-blue-600 font-semibold hover:underline">webgpureport.org</a>
              </p>
            </div>
          </div>
        ),
        docsLink: 'https://www.google.com/chrome/',
      };

    case 'edge':
      return {
        title: 'Enable WebGPU in Microsoft Edge',
        icon: <Chrome className="w-6 h-6" />,
        instructions: (
          <div className="space-y-4">
            <p className="text-gray-800">WebGPU requires Edge 113 or later with hardware acceleration enabled.</p>
            <ol className="space-y-3 text-gray-700 text-sm">
              <li className="flex gap-3">
                <span className="shrink-0 w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-bold shadow-md">1</span>
                <span>Open Edge settings: <code className="px-2 py-1 rounded bg-gray-100 text-blue-600 font-mono text-xs border border-gray-200">edge://settings/system</code></span>
              </li>
              <li className="flex gap-3">
                <span className="shrink-0 w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-bold shadow-md">2</span>
                <span>Ensure <strong className="text-gray-900">"Use graphics acceleration when available"</strong> is turned ON</span>
              </li>
              <li className="flex gap-3">
                <span className="shrink-0 w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-bold shadow-md">3</span>
                <span>Relaunch Edge and return to this page</span>
              </li>
            </ol>
            <div className="mt-4 p-4 rounded-xl bg-blue-50 border-2 border-blue-200">
              <p className="text-sm text-gray-700">
                <strong className="text-blue-900">Still not working?</strong> Your GPU might not support WebGPU. Check if your browser supports it at: <a href="https://webgpureport.org/" target="_blank" rel="noopener noreferrer" className="text-blue-600 font-semibold hover:underline">webgpureport.org</a>
              </p>
            </div>
          </div>
        ),
        docsLink: 'https://www.microsoft.com/edge',
      };

    case 'firefox':
      return {
        title: 'Enable WebGPU in Firefox',
        icon: <Chrome className="w-6 h-6" />,
        instructions: (
          <div className="space-y-4">
            <p className="text-gray-800">WebGPU in Firefox is currently behind a feature flag and requires Firefox 100 or later.</p>
            <ol className="space-y-3 text-gray-700 text-sm">
              <li className="flex gap-3">
                <span className="shrink-0 w-6 h-6 rounded-full bg-orange-600 text-white flex items-center justify-center text-xs font-bold shadow-md">1</span>
                <span>Open Firefox config: <code className="px-2 py-1 rounded bg-gray-100 text-orange-600 font-mono text-xs border border-gray-200">about:config</code></span>
              </li>
              <li className="flex gap-3">
                <span className="shrink-0 w-6 h-6 rounded-full bg-orange-600 text-white flex items-center justify-center text-xs font-bold shadow-md">2</span>
                <span>Search for <code className="px-2 py-1 rounded bg-gray-100 text-orange-600 font-mono text-xs border border-gray-200">dom.webgpu.enabled</code> and set it to <code className="px-2 py-1 rounded bg-gray-100 text-green-600 font-mono text-xs border border-gray-200">true</code></span>
              </li>
              <li className="flex gap-3">
                <span className="shrink-0 w-6 h-6 rounded-full bg-orange-600 text-white flex items-center justify-center text-xs font-bold shadow-md">3</span>
                <span>Restart Firefox and return to this page</span>
              </li>
            </ol>
            <div className="mt-4 p-4 rounded-xl bg-amber-50 border-2 border-amber-300">
              <p className="text-sm text-amber-900">
                <strong>Note:</strong> WebGPU support in Firefox is experimental and may not work on all systems. For best results, we recommend using Chrome or Edge.
              </p>
            </div>
          </div>
        ),
        docsLink: 'https://www.mozilla.org/firefox/',
      };

    case 'safari':
      return {
        title: 'WebGPU in Safari',
        icon: <Chrome className="w-6 h-6" />,
        instructions: (
          <div className="space-y-4">
            <p className="text-gray-800">WebGPU requires Safari 18.2 (macOS Sequoia 15.2 or newer) or later.</p>
            <ol className="space-y-3 text-gray-700 text-sm">
              <li className="flex gap-3">
                <span className="shrink-0 w-6 h-6 rounded-full bg-blue-500 text-white flex items-center justify-center text-xs font-bold shadow-md">1</span>
                <span>Ensure you're running macOS Sequoia 15.2 or later</span>
              </li>
              <li className="flex gap-3">
                <span className="shrink-0 w-6 h-6 rounded-full bg-blue-500 text-white flex items-center justify-center text-xs font-bold shadow-md">2</span>
                <span>Update Safari to version 18.2 or later via System Preferences</span>
              </li>
              <li className="flex gap-3">
                <span className="shrink-0 w-6 h-6 rounded-full bg-blue-500 text-white flex items-center justify-center text-xs font-bold shadow-md">3</span>
                <span>Enable Developer menu in Safari &gt; Settings &gt; Advanced</span>
              </li>
              <li className="flex gap-3">
                <span className="shrink-0 w-6 h-6 rounded-full bg-blue-500 text-white flex items-center justify-center text-xs font-bold shadow-md">4</span>
                <span>In Develop menu, ensure experimental features are enabled</span>
              </li>
            </ol>
            <div className="mt-4 p-4 rounded-xl bg-amber-50 border-2 border-amber-300">
              <p className="text-sm text-amber-900">
                <strong>Note:</strong> WebGPU in Safari requires very recent macOS and Safari versions. For broader compatibility, consider using Chrome or Edge.
              </p>
            </div>
          </div>
        ),
        docsLink: 'https://www.apple.com/safari/',
      };

    default:
      return {
        title: 'Enable WebGPU in Your Browser',
        icon: <Chrome className="w-6 h-6" />,
        instructions: (
          <div className="space-y-4">
            <p className="text-gray-800">WebGPU is not currently available in your browser. To use the Smart Writing Assistant, please switch to a supported browser.</p>
            <div className="grid grid-cols-1 gap-3 mt-4">
              <a href="https://www.google.com/chrome/" target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 p-4 rounded-xl bg-white hover:bg-gray-50 border-2 border-gray-200 hover:border-blue-300 transition-all shadow-sm hover:shadow-md">
                <Chrome className="w-6 h-6 text-gray-700" />
                <div className="flex-1">
                  <p className="text-sm font-bold text-gray-900">Google Chrome</p>
                  <p className="text-xs text-gray-600">Version 113 or later</p>
                </div>
                <ExternalLink className="w-5 h-5 text-blue-500" />
              </a>
              <a href="https://www.microsoft.com/edge" target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 p-4 rounded-xl bg-white hover:bg-gray-50 border-2 border-gray-200 hover:border-blue-300 transition-all shadow-sm hover:shadow-md">
                <Chrome className="w-6 h-6 text-gray-700" />
                <div className="flex-1">
                  <p className="text-sm font-bold text-gray-900">Microsoft Edge</p>
                  <p className="text-xs text-gray-600">Version 113 or later</p>
                </div>
                <ExternalLink className="w-5 h-5 text-blue-500" />
              </a>
            </div>
            <div className="mt-4 p-4 rounded-xl bg-blue-50 border-2 border-blue-200">
              <p className="text-sm text-gray-700">
                Check if your browser supports WebGPU at: <a href="https://webgpureport.org/" target="_blank" rel="noopener noreferrer" className="text-blue-600 font-semibold hover:underline">webgpureport.org</a>
              </p>
            </div>
          </div>
        ),
      };
  }
};

export interface WebGPUInstructionsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function WebGPUInstructionsModal({ isOpen, onClose }: WebGPUInstructionsModalProps) {
  const [isRendered, setIsRendered] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const browser = detectBrowser();
  const instructions = getBrowserInstructions(browser);

  useEffect(() => {
    if (isOpen) {
      requestAnimationFrame(() => {
        setIsRendered(true);
        requestAnimationFrame(() => setIsVisible(true));
      });
    } else {
      requestAnimationFrame(() => setIsVisible(false));
      const timer = setTimeout(() => setIsRendered(false), 300);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  if (!isRendered) return null;

  return (
    <div className={`fixed inset-0 z-60 flex items-center justify-center p-4 transition-all duration-300 ${isVisible ? 'opacity-100' : 'opacity-0'}`}>
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-md transition-opacity duration-300"
        onClick={onClose}
      />

      {/* Modal Content */}
      <div className={`relative w-full max-w-lg bg-white rounded-3xl shadow-2xl border-4 border-gray-200 transform transition-all duration-300 ${isVisible ? 'scale-100 translate-y-0' : 'scale-95 translate-y-4'}`}>
        {/* Header */}
        <div className="px-8 py-6 flex items-start gap-4 rounded-t-3xl border-b-2 border-gray-100 bg-linear-to-r from-orange-50 to-red-50">
          <div className="p-3 rounded-xl bg-linear-to-br from-orange-500 to-red-500 text-white shrink-0 shadow-lg">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div className="flex-1">
            <h3 className="text-xl font-bold text-gray-900 tracking-tight">
              WebGPU Not Available
            </h3>
            <p className="text-sm text-gray-700 mt-2 leading-relaxed">
              The Smart Writing Assistant requires WebGPU to run in your browser.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-colors shrink-0"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Body */}
        <div className="p-8 bg-gray-50">
          <div className="mb-5 flex items-center gap-3">
            {instructions.icon}
            <h4 className="font-bold text-gray-900 text-lg">{instructions.title}</h4>
          </div>
          <div className="text-gray-800">
            {instructions.instructions}
          </div>
        </div>

        {/* Footer */}
        <div className="px-8 py-5 bg-white rounded-b-3xl border-t-2 border-gray-100 flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="px-6 py-3 rounded-xl text-sm font-bold text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-colors border border-gray-200"
          >
            Close
          </button>
          {instructions.docsLink && (
            <a
              href={instructions.docsLink}
              target="_blank"
              rel="noopener noreferrer"
              className="px-6 py-3 rounded-xl text-sm font-bold bg-linear-to-r from-blue-600 to-blue-700 text-white hover:from-blue-700 hover:to-blue-800 transition-all shadow-lg hover:shadow-xl flex items-center gap-2"
            >
              Download Browser
              <ExternalLink className="w-4 h-4" />
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
