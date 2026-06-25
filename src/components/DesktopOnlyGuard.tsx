import React, { useState, useEffect } from 'react';

interface DesktopOnlyGuardProps {
  children: React.ReactNode;
}

const DesktopOnlyGuard: React.FC<DesktopOnlyGuardProps> = ({ children }) => {
  const [isDesktop, setIsDesktop] = useState<boolean | null>(null);

  useEffect(() => {
    const checkDevice = () => {
      const userAgent = navigator.userAgent || navigator.vendor || (window as any).opera;
      const isMobileUA = /android|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(userAgent.toLowerCase());
      const isSmallScreen = window.innerWidth < 1024; // Common threshold for tablets/desktops

      // If it's a mobile UA or a small screen, consider it non-desktop
      setIsDesktop(!isMobileUA && !isSmallScreen);
    };

    checkDevice();
    window.addEventListener('resize', checkDevice);
    return () => window.removeEventListener('resize', checkDevice);
  }, []);

  if (isDesktop === null) return null; // Or a loading spinner

  if (!isDesktop) {
    return (
      <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center desktop-only-overlay p-6 text-center overflow-hidden">
        {/* Animated Background Elements */}
        <div className="absolute top-[-20%] left-[-20%] w-[60%] h-[60%] bg-[#00d1ff] opacity-[0.07] blur-[150px] rounded-full"></div>
        <div className="absolute bottom-[-20%] right-[-20%] w-[60%] h-[60%] bg-[#7000ff] opacity-[0.07] blur-[150px] rounded-full" style={{ animationDelay: '1s' }}></div>
        
        {/* Grid pattern background */}
        <div className="absolute inset-0 bg-[url('data:image/svg+xml,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter%20id=%22n%22%3E%3CfeTurbulence%20type=%22fractalNoise%22%20baseFrequency=%220.8%22%20numOctaves=%224%22%20stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect%20width=%22100%25%22%20height=%22100%25%22%20filter=%22url(%23n)%22/%3E%3C/svg%3E')] opacity-20 brightness-100 contrast-150 pointer-events-none"></div>

        <div className="glass neon-border max-w-lg w-full p-10 rounded-[2rem] relative z-10 animate-fade-in shadow-2xl">
          <div className="mb-8 flex justify-center">
            <div className="relative group">
              <div className="absolute inset-0 bg-[#00d1ff] blur-2xl opacity-20 group-hover:opacity-40 transition-opacity"></div>
              <div className="relative glass p-6 rounded-2xl border border-white/10">
                <svg 
                  className="w-16 h-16 text-[#00d1ff] drop-shadow-[0_0_10px_rgba(0,209,255,0.5)]" 
                  fill="none" 
                  stroke="currentColor" 
                  viewBox="0 0 24 24"
                >
                  <path 
                    strokeLinecap="round" 
                    strokeLinejoin="round" 
                    strokeWidth={1} 
                    d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" 
                  />
                </svg>
                <div className="absolute -top-2 -right-2 bg-[#ff00c7] rounded-full p-1.5 border-4 border-[#0a0a0b] shadow-lg">
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </div>
              </div>
            </div>
          </div>

          <h1 className="text-3xl font-black mb-4 tracking-tighter bg-gradient-to-br from-white to-gray-500 bg-clip-text text-transparent">
            DESKTOP ONLY
          </h1>
          
          <p className="text-white/70 mb-10 text-lg leading-relaxed font-medium">
            Origami AI is a high-performance workspace designed for precision. 
            Mobile and tablet interfaces are currently restricted to maintain quality.
          </p>

          <div className="grid gap-4 mb-10">
            <div className="flex items-center gap-4 p-4 bg-white/5 rounded-2xl border border-white/10 text-left hover:bg-white/[0.08] transition-colors">
              <div className="w-12 h-12 rounded-xl bg-[#00d1ff]/10 flex items-center justify-center border border-[#00d1ff]/20">
                <svg className="w-6 h-6 text-[#00d1ff]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
              </div>
              <div>
                <div className="text-sm font-bold text-white uppercase tracking-wider">Device Blocked</div>
                <div className="text-xs text-white/50">Mobile and Tablet access disabled</div>
              </div>
            </div>
            
            <div className="flex items-center gap-4 p-4 bg-white/5 rounded-2xl border border-white/10 text-left hover:bg-white/[0.08] transition-colors">
              <div className="w-12 h-12 rounded-xl bg-[#7000ff]/10 flex items-center justify-center border border-[#7000ff]/20">
                <svg className="w-6 h-6 text-[#7000ff]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <div>
                <div className="text-sm font-bold text-white uppercase tracking-wider">Requirement</div>
                <div className="text-xs text-white/50">Please switch to a desktop or laptop</div>
              </div>
            </div>
          </div>

          <div className="pt-8 border-t border-white/10">
            <div className="flex items-center justify-center gap-2 opacity-50">
              <span className="w-2 h-2 rounded-full bg-[#ff00c7]"></span>
              <div className="text-[10px] uppercase tracking-[0.3em] text-white font-black">
                ORIGAMI AI • SYSTEM SECURE
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

export default DesktopOnlyGuard;
