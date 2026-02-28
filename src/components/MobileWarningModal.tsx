import React, { useEffect, useState } from 'react';
import { Smartphone, Monitor, X, AlertTriangle } from 'lucide-react';

const DISMISSED_KEY = 'mobile_warning_dismissed';

function isMobileDevice(): boolean {
    // Check via user agent
    const uaCheck = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
        navigator.userAgent
    );
    // Also check via pointer/touch capability as a secondary signal
    const touchCheck = navigator.maxTouchPoints > 1;
    // Check screen width — treat < 1024px as "mobile/tablet"
    const widthCheck = window.innerWidth < 1024;

    return uaCheck || (touchCheck && widthCheck);
}

export const MobileWarningModal: React.FC = () => {
    const [isVisible, setIsVisible] = useState(false);
    const [isAnimating, setIsAnimating] = useState(false);

    useEffect(() => {
        const alreadyDismissed = localStorage.getItem(DISMISSED_KEY) === 'true';
        if (!alreadyDismissed && isMobileDevice()) {
            // Small delay so the rest of the app loads first
            const timer = setTimeout(() => {
                setIsVisible(true);
                requestAnimationFrame(() => setIsAnimating(true));
            }, 400);
            return () => clearTimeout(timer);
        }
    }, []);

    const handleDismiss = () => {
        setIsAnimating(false);
        setTimeout(() => setIsVisible(false), 300);
    };

    const handleDismissForever = () => {
        localStorage.setItem(DISMISSED_KEY, 'true');
        handleDismiss();
    };

    if (!isVisible) return null;

    return (
        <div
            className="fixed inset-0 z-9999 flex items-end sm:items-center justify-center p-4 sm:p-6"
            style={{
                background: `rgba(0,0,0,${isAnimating ? 0.75 : 0})`,
                backdropFilter: `blur(${isAnimating ? 8 : 0}px)`,
                transition: 'background 0.3s ease, backdrop-filter 0.3s ease',
            }}
        >
            {/* Backdrop tap-to-close */}
            <div className="absolute inset-0" onClick={handleDismiss} />

            {/* Modal card */}
            <div
                className="relative rounded-2xl overflow-hidden shadow-2xl"
                style={{
                    width: 'min(100%, clamp(280px, 85vw, 24rem))',
                    background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
                    border: '1px solid rgba(255,255,255,0.12)',
                    transform: isAnimating ? 'translateY(0) scale(1)' : 'translateY(40px) scale(0.96)',
                    opacity: isAnimating ? 1 : 0,
                    transition: 'transform 0.35s cubic-bezier(0.34,1.56,0.64,1), opacity 0.3s ease',
                }}
            >
                {/* Accent glow strip */}
                <div
                    style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        right: 0,
                        height: '2px',
                        background: 'linear-gradient(90deg, #f59e0b, #ef4444, #f59e0b)',
                        backgroundSize: '200% 100%',
                        animation: 'shimmer 2s linear infinite',
                    }}
                />

                {/* Close button */}
                <button
                    onClick={handleDismiss}
                    className="absolute top-3 right-3 p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-colors z-10"
                    aria-label="Close"
                >
                    <X className="w-4 h-4" />
                </button>

                {/* Header */}
                <div className="px-6 pt-7 pb-5 flex flex-col items-center text-center gap-4">
                    {/* Icon stack */}
                    <div className="relative">
                        <div
                            className="w-16 h-16 rounded-2xl flex items-center justify-center"
                            style={{
                                background: 'linear-gradient(135deg, rgba(245,158,11,0.2), rgba(239,68,68,0.2))',
                                border: '1px solid rgba(245,158,11,0.3)',
                                boxShadow: '0 0 32px rgba(245,158,11,0.15)',
                            }}
                        >
                            <Smartphone className="w-8 h-8 text-amber-400" />
                        </div>
                        <div
                            className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full flex items-center justify-center"
                            style={{ background: '#1a1a2e', border: '1px solid rgba(239,68,68,0.4)' }}
                        >
                            <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
                        </div>
                    </div>

                    <div>
                        <h2 className="text-lg font-extrabold text-white tracking-tight mb-1">
                            Mobile Device Detected
                        </h2>
                        <p className="text-xs font-semibold text-amber-400/80 uppercase tracking-widest">
                            Compatibility Notice
                        </p>
                    </div>
                </div>

                {/* Body */}
                <div className="px-6 pb-5">
                    <p className="text-sm text-white/70 leading-relaxed text-center mb-4">
                        Origami has <span className="text-white font-semibold">not been tested</span> on mobile
                        devices. Some features — including PDF processing, video rendering, and AI tools — may
                        not work correctly or at all.
                    </p>

                    {/* Recommendation card */}
                    <div
                        className="flex items-center gap-3 rounded-xl px-4 py-3 mb-5"
                        style={{
                            background: 'rgba(255,255,255,0.05)',
                            border: '1px solid rgba(255,255,255,0.08)',
                        }}
                    >
                        <Monitor className="w-5 h-5 text-cyan-400 shrink-0" />
                        <p className="text-xs text-white/60 leading-snug">
                            For the best experience, please use a{' '}
                            <span className="text-white font-semibold">desktop or laptop</span> browser.
                        </p>
                    </div>

                    {/* Actions */}
                    <div className="flex flex-col gap-2">
                        <button
                            onClick={handleDismiss}
                            className="w-full py-2.5 rounded-xl text-sm font-bold text-white transition-all active:scale-95"
                            style={{
                                background: 'linear-gradient(135deg, #f59e0b, #ef4444)',
                                boxShadow: '0 4px 16px rgba(245,158,11,0.25)',
                            }}
                        >
                            I Understand, Continue Anyway
                        </button>
                        <button
                            onClick={handleDismissForever}
                            className="w-full py-2 rounded-xl text-xs font-semibold text-white/40 hover:text-white/60 transition-colors"
                        >
                            Don't show this again
                        </button>
                    </div>
                </div>
            </div>

            {/* Shimmer keyframe injected inline */}
            <style>{`
        @keyframes shimmer {
          0%   { background-position: 200% center; }
          100% { background-position: -200% center; }
        }
      `}</style>
        </div>
    );
};
