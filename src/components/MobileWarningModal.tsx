import React, { useEffect, useState } from 'react';
import { Smartphone, Monitor, X, AlertTriangle, Mail } from 'lucide-react';

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

    const handleEmailReminder = () => {
        const subject = encodeURIComponent('Note to self - Check out Origami');
        const body = encodeURIComponent(
            `Check out Origami, an AI-powered tool that transforms PDF presentations into cinematic narrated videos.\n\n` +
            `Website: https://origami.techmitten.com\n\n` +
            `Note: This works best on a desktop or laptop browser.`
        );
        window.location.href = `mailto:?subject=${subject}&body=${body}`;
        handleDismiss();
    };

    if (!isVisible) return null;

    return (
        <div
            className="fixed inset-0 z-9999 flex items-end sm:items-center justify-center sm:px-6"
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
                className="relative rounded-t-2xl sm:rounded-2xl overflow-hidden shadow-2xl w-full sm:w-auto"
                style={{
                    maxWidth: 'min(100%, 24rem)',
                    background: '#1f2937',
                    border: '1px solid rgba(255,255,255,0.1)',
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
                        height: '1px',
                        background: 'rgba(59, 130, 246, 0.5)',
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
                            className="w-16 h-16 rounded-xl flex items-center justify-center"
                            style={{
                                background: 'rgba(255,255,255,0.05)',
                                border: '1px solid rgba(255,255,255,0.1)',
                            }}
                        >
                            <Smartphone className="w-8 h-8 text-gray-300" strokeWidth={1.5} />
                        </div>
                        <div
                            className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full flex items-center justify-center"
                            style={{ background: '#1f2937', border: '1px solid rgba(255,255,255,0.1)' }}
                        >
                            <AlertTriangle className="w-3.5 h-3.5 text-gray-400" strokeWidth={2} />
                        </div>
                    </div>

                    <div>
                        <h2 className="text-lg font-semibold text-white tracking-tight mb-1">
                            Mobile Device Detected
                        </h2>
                        <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Compatibility Notice
                        </p>
                    </div>
                </div>

                {/* Body */}
                <div className="px-6 pb-5">
                    <p className="text-sm text-gray-300 leading-relaxed text-center mb-4">
                        Origami has <span className="text-white font-medium">not been tested</span> on mobile
                        devices. Some features — including PDF processing, video rendering, and AI tools — may
                        not work correctly or at all.
                    </p>

                    {/* Recommendation card */}
                    <div
                        className="flex items-center gap-3 rounded-lg px-4 py-3 mb-5"
                        style={{
                            background: 'rgba(255,255,255,0.03)',
                            border: '1px solid rgba(255,255,255,0.06)',
                        }}
                    >
                        <Monitor className="w-5 h-5 text-gray-400 shrink-0" strokeWidth={1.5} />
                        <p className="text-xs text-gray-400 leading-snug">
                            For the best experience, please use a{' '}
                            <span className="text-gray-200 font-medium">desktop or laptop</span> browser.
                        </p>
                    </div>

                    {/* Actions */}
                    <div className="flex flex-col gap-2">
                        <button
                            onClick={handleDismiss}
                            className="w-full py-2.5 rounded-lg text-sm font-medium text-white transition-all active:scale-95 hover:bg-blue-600"
                            style={{
                                background: '#3b82f6',
                            }}
                        >
                            I Understand, Continue Anyway
                        </button>
                        <button
                            onClick={handleEmailReminder}
                            className="w-full py-2.5 rounded-lg text-sm font-medium text-gray-300 transition-all active:scale-95 hover:bg-white/5 hover:text-white flex items-center justify-center gap-2"
                            style={{
                                border: '1px solid rgba(255,255,255,0.1)',
                            }}
                        >
                            <Mail className="w-4 h-4" />
                            Email Myself a Reminder
                        </button>
                        <button
                            onClick={handleDismissForever}
                            className="w-full py-2 rounded-lg text-xs font-medium text-gray-500 hover:text-gray-400 transition-colors"
                        >
                            Don't show this again
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
