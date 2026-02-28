import React, { useEffect, useState } from 'react';
import { Copy, ExternalLink } from 'lucide-react';

const CHANNEL_NAME = 'origami_tab_sync';
const HEARTBEAT_INTERVAL = 2000; // ms
const HEARTBEAT_TIMEOUT = 5000;  // ms — if no ping heard for this long, assume other tab is gone

export const DuplicateTabModal: React.FC = () => {
    const [isDuplicate, setIsDuplicate] = useState(false);
    const [isAnimating, setIsAnimating] = useState(false);

    useEffect(() => {
        // BroadcastChannel is supported in all modern browsers (Chrome, Firefox, Edge, Safari 15.4+)
        if (!('BroadcastChannel' in window)) return;

        const channel = new BroadcastChannel(CHANNEL_NAME);
        let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
        let timeoutTimer: ReturnType<typeof setTimeout> | null = null;
        let isDuplicateTab = false;

        // Step 1: Announce ourselves and listen for a response
        channel.postMessage({ type: 'ORIGAMI_TAB_OPEN' });

        // Step 2: If an existing tab responds within a short window, we're the duplicate
        const announceTimeout = setTimeout(() => {
            // No one answered — we are the primary tab. Start a heartbeat.
            if (!isDuplicateTab) {
                startPrimary();
            }
        }, 300);

        const startPrimary = () => {
            // Broadcast heartbeat so any new tabs know we're alive
            heartbeatTimer = setInterval(() => {
                channel.postMessage({ type: 'ORIGAMI_HEARTBEAT' });
            }, HEARTBEAT_INTERVAL);
        };

        const handleDuplicateDetected = () => {
            isDuplicateTab = true;
            clearTimeout(announceTimeout);

            setIsDuplicate(true);
            requestAnimationFrame(() => setIsAnimating(true));

            // Listen for the primary tab to close (heartbeat stops)
            const resetTimeout = () => {
                if (timeoutTimer) clearTimeout(timeoutTimer);
                timeoutTimer = setTimeout(() => {
                    // Primary tab appears to be gone — dismiss and take over
                    setIsAnimating(false);
                    setTimeout(() => {
                        setIsDuplicate(false);
                        isDuplicateTab = false;
                        startPrimary();
                    }, 300);
                }, HEARTBEAT_TIMEOUT);
            };
            resetTimeout();

            // Re-arm the timeout on each heartbeat received
            channel.onmessage = (e) => {
                if (e.data?.type === 'ORIGAMI_HEARTBEAT') {
                    resetTimeout();
                }
                // If primary announces it's closing
                if (e.data?.type === 'ORIGAMI_TAB_CLOSING') {
                    if (timeoutTimer) clearTimeout(timeoutTimer);
                    setIsAnimating(false);
                    setTimeout(() => {
                        setIsDuplicate(false);
                        isDuplicateTab = false;
                        startPrimary();
                    }, 300);
                }
            };
        };

        channel.onmessage = (e) => {
            if (e.data?.type === 'ORIGAMI_TAB_OPEN') {
                // Another tab just opened — respond so it knows we exist
                channel.postMessage({ type: 'ORIGAMI_TAB_EXISTS' });
            } else if (e.data?.type === 'ORIGAMI_TAB_EXISTS') {
                // We heard back — we are the duplicate
                handleDuplicateDetected();
            }
        };

        // Notify other tabs when this tab is closing
        const handleUnload = () => {
            channel.postMessage({ type: 'ORIGAMI_TAB_CLOSING' });
        };
        window.addEventListener('beforeunload', handleUnload);

        return () => {
            clearTimeout(announceTimeout);
            if (heartbeatTimer) clearInterval(heartbeatTimer);
            if (timeoutTimer) clearTimeout(timeoutTimer);
            channel.postMessage({ type: 'ORIGAMI_TAB_CLOSING' });
            channel.close();
            window.removeEventListener('beforeunload', handleUnload);
        };
    }, []);

    if (!isDuplicate) return null;

    return (
        <div
            className="fixed inset-0 z-9999 flex items-center justify-center p-4 sm:p-6"
            style={{
                background: `rgba(0,0,0,${isAnimating ? 0.85 : 0})`,
                backdropFilter: `blur(${isAnimating ? 12 : 0}px)`,
                transition: 'background 0.35s ease, backdrop-filter 0.35s ease',
            }}
        >
            {/* Modal card */}
            <div
                className="relative rounded-2xl overflow-hidden shadow-2xl max-w-lg w-full"
                style={{
                    background: 'linear-gradient(145deg, #0f0f1a 0%, #12122b 50%, #0a1628 100%)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    transform: isAnimating ? 'translateY(0) scale(1)' : 'translateY(32px) scale(0.95)',
                    opacity: isAnimating ? 1 : 0,
                    transition: 'transform 0.4s cubic-bezier(0.34,1.56,0.64,1), opacity 0.3s ease',
                    boxShadow: '0 32px 64px rgba(0,0,0,0.6), 0 0 0 1px rgba(99,102,241,0.15)',
                }}
            >
                {/* Animated accent strip */}
                <div
                    style={{
                        position: 'absolute',
                        top: 0, left: 0, right: 0,
                        height: '2px',
                        background: 'linear-gradient(90deg, #6366f1, #8b5cf6, #3b82f6, #6366f1)',
                        backgroundSize: '300% 100%',
                        animation: 'duplicateShimmer 3s linear infinite',
                    }}
                />

                {/* Glow orb behind icon */}
                <div
                    style={{
                        position: 'absolute',
                        top: '-40px',
                        left: '50%',
                        transform: 'translateX(-50%)',
                        width: '180px',
                        height: '180px',
                        background: 'radial-gradient(circle, rgba(99,102,241,0.18) 0%, transparent 70%)',
                        pointerEvents: 'none',
                    }}
                />

                {/* Header */}
                <div className="px-10 pt-12 pb-7 flex flex-col items-center text-center gap-6">
                    {/* Icon */}
                    <div
                        className="w-18 h-18 rounded-2xl flex items-center justify-center relative"
                        style={{
                            width: '88px',
                            height: '88px',
                            background: 'linear-gradient(135deg, rgba(99,102,241,0.25), rgba(139,92,246,0.25))',
                            border: '1px solid rgba(99,102,241,0.4)',
                            boxShadow: '0 0 40px rgba(99,102,241,0.2)',
                        }}
                    >
                        <Copy className="w-10 h-10 text-indigo-400" />
                        {/* Small badge */}
                        <div
                            className="absolute -top-2 -right-2 w-6 h-6 rounded-full flex items-center justify-center text-xs font-black text-white"
                            style={{
                                background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                                border: '2px solid #0f0f1a',
                            }}
                        >
                            2
                        </div>
                    </div>

                    <div>
                        <h2 className="text-2xl font-black text-white tracking-tight mb-1.5">
                            Already Running
                        </h2>
                        <p className="text-sm font-semibold text-indigo-400/80 uppercase tracking-widest">
                            Duplicate Tab Detected
                        </p>
                    </div>
                </div>

                {/* Body */}
                <div className="px-10 pb-10">
                    <p className="text-base text-white/70 leading-relaxed text-center mb-6">
                        Origami is already open in{' '}
                        <span className="text-white font-semibold">another browser tab.</span>{' '}
                        Running multiple instances at the same time can cause conflicts with saved data and AI resources.
                    </p>

                    {/* Info card */}
                    <div
                        className="flex items-start gap-3 rounded-xl px-5 py-4"
                        style={{
                            background: 'rgba(99,102,241,0.08)',
                            border: '1px solid rgba(99,102,241,0.2)',
                        }}
                    >
                        <ExternalLink className="w-5 h-5 text-indigo-400 shrink-0 mt-0.5" />
                        <p className="text-sm text-white/65 leading-relaxed">
                            Please switch to your existing Origami tab, or close it before continuing here.
                            This tab will automatically become active once the other one is closed.
                        </p>
                    </div>


                </div>
            </div>

            {/* Keyframe injection */}
            <style>{`
                @keyframes duplicateShimmer {
                    0%   { background-position: 300% center; }
                    100% { background-position: -300% center; }
                }
            `}</style>
        </div>
    );
};
