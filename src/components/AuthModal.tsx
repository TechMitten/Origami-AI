import React, { useState, useEffect, useRef } from 'react';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  sendPasswordResetEmail,
} from 'firebase/auth';
import { auth } from '../config/firebase';
import {
  X,
  Loader2,
  Mail,
  Lock,
  Eye,
  EyeOff,
  AlertCircle,
  CheckCircle2,
  ShieldCheck,
  ArrowLeft,
  Sparkles,
  Cloud,
  Check,
} from 'lucide-react';
import { Turnstile } from '@marsidev/react-turnstile';
import { TransitionLink } from './TransitionLink';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialMode?: 'signin' | 'signup' | 'reset';
}

type AuthMode = 'signin' | 'signup' | 'reset';

/**
 * Maps Firebase Auth and Turnstile errors into friendly, actionable messages.
 */
function formatAuthError(err: unknown): string {
  if (!err) return 'An unexpected error occurred. Please try again.';
  const message = typeof err === 'object' && err !== null && 'message' in err
    ? String((err as { message: unknown }).message)
    : String(err);

  const code = typeof err === 'object' && err !== null && 'code' in err
    ? String((err as { code: unknown }).code)
    : '';

  if (code === 'auth/invalid-email' || message.includes('auth/invalid-email')) {
    return 'Please enter a valid email address.';
  }
  if (code === 'auth/user-not-found' || message.includes('auth/user-not-found')) {
    return 'No account found with this email. Please sign up first.';
  }
  if (code === 'auth/wrong-password' || message.includes('auth/wrong-password')) {
    return 'Incorrect password. Please try again or reset your password.';
  }
  if (code === 'auth/invalid-credential' || message.includes('auth/invalid-credential')) {
    return 'Incorrect email or password. Please verify your credentials.';
  }
  if (code === 'auth/email-already-in-use' || message.includes('auth/email-already-in-use')) {
    return 'An account with this email already exists. Try signing in instead.';
  }
  if (code === 'auth/weak-password' || message.includes('auth/weak-password')) {
    return 'Password is too weak. Please use at least 6 characters.';
  }
  if (code === 'auth/popup-closed-by-user' || message.includes('auth/popup-closed-by-user')) {
    return 'Google sign-in was cancelled before completion.';
  }
  if (code === 'auth/popup-blocked' || message.includes('auth/popup-blocked')) {
    return 'The sign-in popup was blocked by your browser. Please allow popups for this site.';
  }
  if (code === 'auth/too-many-requests' || message.includes('auth/too-many-requests')) {
    return 'Too many attempts. Access is temporarily paused for security; please try again later.';
  }
  if (code === 'auth/network-request-failed' || message.includes('auth/network-request-failed')) {
    return 'Network connection error. Please check your internet connection.';
  }

  // Strip generic 'Firebase: Error (auth/...)' wrapper if present
  const cleaned = message.replace(/^Firebase:\s*Error\s*\((.*?)\)\.?$/i, '$1');
  return cleaned || 'Authentication failed. Please try again.';
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  initialMode = 'signin',
}) => {
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);

  // Animation lifecycle states matching app standards
  const [isRendered, setIsRendered] = useState(false);
  const [isVisible, setIsVisible] = useState(false);

  const emailInputRef = useRef<HTMLInputElement>(null);

  // Synchronize modal open/close transitions
  useEffect(() => {
    if (isOpen) {
      setMode(initialMode);
      setError(null);
      setSuccessMessage(null);
      requestAnimationFrame(() => {
        setIsRendered(true);
        requestAnimationFrame(() => {
          setIsVisible(true);
          // Focus email on open
          setTimeout(() => {
            emailInputRef.current?.focus();
          }, 50);
        });
      });
    } else {
      requestAnimationFrame(() => setIsVisible(false));
      const timer = setTimeout(() => {
        setIsRendered(false);
        setError(null);
        setSuccessMessage(null);
        setPassword('');
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [isOpen, initialMode]);

  // Handle escape key to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, onClose]);

  if (!isRendered) return null;

  const verifyTurnstile = async () => {
    if (!turnstileToken) {
      throw new Error('Please complete the security check below before continuing.');
    }
    const res = await fetch('/api/verify-turnstile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: turnstileToken }),
    });
    const data = await res.json();
    if (!data.success) {
      throw new Error(data.error || 'Security verification failed. Please refresh and try again.');
    }
  };

  const handleGoogleSignIn = async () => {
    setError(null);
    setSuccessMessage(null);
    setLoading(true);
    try {
      await verifyTurnstile();
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });

      // When Cross-Origin Isolation (COOP/COEP) is active for WebGPU/FFmpeg SharedArrayBuffer,
      // browsers prohibit cross-window communication between main page and auth popups (blocking window.closed).
      // We directly use signInWithRedirect to guarantee a reliable, non-blocking sign-in flow.
      if (typeof window !== 'undefined' && (window.crossOriginIsolated || /iPhone|iPad|iPod|Android/i.test(navigator.userAgent))) {
        await signInWithRedirect(auth, provider);
        return;
      }

      try {
        await signInWithPopup(auth, provider);
        onClose();
      } catch (popupErr: unknown) {
        const errCode = typeof popupErr === 'object' && popupErr !== null && 'code' in popupErr
          ? String((popupErr as { code: unknown }).code)
          : '';
        const errMsg = typeof popupErr === 'object' && popupErr !== null && 'message' in popupErr
          ? String((popupErr as { message: unknown }).message)
          : '';

        // If popup flow was interrupted by COOP/COEP isolation, popup blocker, or closed window:
        if (
          errCode === 'auth/popup-closed-by-user' ||
          errCode === 'auth/popup-blocked' ||
          errCode === 'auth/cancelled-popup-request' ||
          errMsg.includes('popup')
        ) {
          console.warn('[AuthModal] Popup flow blocked by browser COOP policy; falling back to redirect flow...', popupErr);
          await signInWithRedirect(auth, provider);
          return;
        }
        throw popupErr;
      }
    } catch (err: unknown) {
      console.error('[AuthModal] Google Sign-In error:', err);
      setError(formatAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);
    setLoading(true);

    try {
      await verifyTurnstile();

      if (mode === 'reset') {
        if (!email.trim()) {
          throw new Error('Please enter your email address to receive password reset instructions.');
        }
        await sendPasswordResetEmail(auth, email.trim());
        setSuccessMessage('Password reset link sent! Please check your email inbox.');
        return;
      }

      if (mode === 'signin') {
        await signInWithEmailAndPassword(auth, email.trim(), password);
        onClose();
      } else {
        await createUserWithEmailAndPassword(auth, email.trim(), password);
        onClose();
      }
    } catch (err: unknown) {
      console.error('[AuthModal] Form error:', err);
      setError(formatAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  const switchMode = (newMode: AuthMode) => {
    setError(null);
    setSuccessMessage(null);
    setMode(newMode);
  };

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 transition-all duration-300 ${
        isVisible ? 'opacity-100' : 'opacity-0'
      }`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-modal-title"
    >
      {/* Dark Glass Backdrop */}
      <div
        className="absolute inset-0 bg-black/75 backdrop-blur-md transition-opacity duration-300"
        onClick={onClose}
      />

      {/* Modal Dialog Container */}
      <div
        onClick={(e) => e.stopPropagation()}
        className={`relative w-full max-w-md bg-[#121215]/95 border border-white/10 rounded-2xl shadow-[0_25px_60px_-15px_rgba(0,0,0,0.85),0_0_40px_rgba(34,211,238,0.06)] overflow-hidden flex flex-col max-h-[92vh] transform transition-all duration-300 ${
          isVisible ? 'scale-100 translate-y-0' : 'scale-95 translate-y-3'
        }`}
      >
        {/* Origami cold-to-warm gradient accent line */}
        <div className="h-1 w-full bg-linear-to-r from-cyan-400 via-blue-500 to-amber-500 shrink-0" />

        {/* Ambient Top Glow */}
        <div className="absolute -top-16 left-1/2 -translate-x-1/2 w-64 h-32 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />

        {/* Modal Header */}
        <div className="relative px-6 pt-5 pb-4 flex items-start justify-between gap-4 border-b border-white/5 bg-white/[0.02]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500/20 via-blue-500/15 to-purple-500/10 border border-cyan-500/30 flex items-center justify-center p-1.5 shadow-inner shadow-cyan-500/20 shrink-0">
              <img
                src="/modlogo.png"
                alt="Origami Logo"
                className="w-full h-full object-contain"
              />
            </div>
            <div>
              <h2
                id="auth-modal-title"
                className="text-lg font-bold text-white tracking-tight flex items-center gap-1.5"
              >
                {mode === 'signin' && 'Sign In to Origami'}
                {mode === 'signup' && 'Create Origami Account'}
                {mode === 'reset' && 'Reset Your Password'}
              </h2>
              <p className="text-xs text-white/55 font-medium leading-tight">
                {mode === 'signin' && 'Sync projects, media & AI settings across devices'}
                {mode === 'signup' && 'Unlock cloud syncing, custom voices & fast backups'}
                {mode === 'reset' && 'Enter your email to receive recovery instructions'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close authentication dialog"
            className="p-1.5 text-white/40 hover:text-white hover:bg-white/10 rounded-xl transition-all min-w-9 min-h-9 flex items-center justify-center -mr-1 -mt-1 focus-ring"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Segmented Mode Switcher (Sign In vs Sign Up) */}
        {mode !== 'reset' && (
          <div className="px-6 pt-4 pb-1">
            <div className="grid grid-cols-2 p-1 bg-black/40 border border-white/10 rounded-xl">
              <button
                type="button"
                onClick={() => switchMode('signin')}
                className={`py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                  mode === 'signin'
                    ? 'bg-white/15 text-white shadow-sm shadow-black/40'
                    : 'text-white/45 hover:text-white hover:bg-white/5'
                }`}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => switchMode('signup')}
                className={`py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                  mode === 'signup'
                    ? 'bg-white/15 text-white shadow-sm shadow-black/40'
                    : 'text-white/45 hover:text-white hover:bg-white/5'
                }`}
              >
                Create Account
              </button>
            </div>
          </div>
        )}

        {/* Scrollable Form Body */}
        <div className="p-6 pt-3 overflow-y-auto custom-scrollbar flex flex-col gap-4">
          {/* Error Banner */}
          {error && (
            <div
              role="alert"
              className="p-3.5 bg-red-500/10 border border-red-500/30 rounded-xl text-red-200 text-xs flex items-start gap-2.5 animate-fade-in"
            >
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <div className="flex-1 leading-relaxed">{error}</div>
            </div>
          )}

          {/* Success Banner (e.g., reset email sent) */}
          {successMessage && (
            <div
              role="status"
              className="p-3.5 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-200 text-xs flex items-start gap-2.5 animate-fade-in"
            >
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <div className="flex-1 leading-relaxed">{successMessage}</div>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
            {/* Email Field */}
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="auth-email-input"
                className="text-xs font-semibold text-white/70 flex items-center justify-between"
              >
                <span>Email Address</span>
              </label>
              <div className="relative flex items-center group">
                <Mail className="absolute left-3.5 w-4 h-4 text-white/40 group-focus-within:text-cyan-400 transition-colors pointer-events-none" />
                <input
                  ref={emailInputRef}
                  id="auth-email-input"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-white/[0.04] border border-white/10 hover:border-white/20 focus:border-cyan-400 focus:bg-white/[0.06] rounded-xl text-white placeholder-white/25 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/20 transition-all"
                  placeholder="you@example.com"
                  autoComplete="email"
                />
              </div>
            </div>

            {/* Password Field (hidden in reset mode) */}
            {mode !== 'reset' && (
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <label
                    htmlFor="auth-password-input"
                    className="text-xs font-semibold text-white/70"
                  >
                    Password
                  </label>
                  {mode === 'signin' && (
                    <button
                      type="button"
                      onClick={() => switchMode('reset')}
                      className="text-xs text-cyan-400 hover:text-cyan-300 transition-colors font-medium hover:underline focus-ring rounded"
                    >
                      Forgot password?
                    </button>
                  )}
                </div>
                <div className="relative flex items-center group">
                  <Lock className="absolute left-3.5 w-4 h-4 text-white/40 group-focus-within:text-cyan-400 transition-colors pointer-events-none" />
                  <input
                    id="auth-password-input"
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-10 pr-11 py-2.5 bg-white/[0.04] border border-white/10 hover:border-white/20 focus:border-cyan-400 focus:bg-white/[0.06] rounded-xl text-white placeholder-white/25 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/20 transition-all"
                    placeholder="••••••••"
                    minLength={6}
                    autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    className="absolute right-2.5 p-1 text-white/40 hover:text-white hover:bg-white/10 rounded-lg transition-colors focus-ring"
                  >
                    {showPassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
                {mode === 'signup' && (
                  <p className="text-[11px] text-white/40 pl-1">
                    Must be at least 6 characters
                  </p>
                )}
              </div>
            )}

            {/* Turnstile Security Challenge */}
            <div className="bg-black/30 border border-white/5 rounded-xl p-2.5 flex flex-col items-center gap-1.5 my-1">
              <div className="flex items-center gap-1.5 text-[11px] font-medium text-white/50">
                <ShieldCheck className="w-3.5 h-3.5 text-cyan-400/80" />
                <span>Security Verification</span>
              </div>
              <div className="flex justify-center w-full min-h-[65px] items-center">
                <Turnstile
                  siteKey={import.meta.env.VITE_TURNSTILE_SITE_KEY || '0x4AAAAAAEjW6dDhR8esD0I3'}
                  onSuccess={(token) => setTurnstileToken(token)}
                  onError={() => setTurnstileToken(null)}
                  onExpire={() => setTurnstileToken(null)}
                  options={{ theme: 'dark', size: 'normal' }}
                />
              </div>
            </div>

            {/* Primary Submit Button */}
            <button
              type="submit"
              disabled={loading || !turnstileToken}
              className="mt-1 w-full py-2.5 px-4 bg-linear-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 active:scale-[0.99] text-white font-bold text-sm rounded-xl shadow-lg shadow-cyan-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 focus-ring cursor-pointer"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {mode === 'signin' && (loading ? 'Signing In...' : 'Sign In')}
              {mode === 'signup' && (loading ? 'Creating Account...' : 'Create Account')}
              {mode === 'reset' && (loading ? 'Sending Instructions...' : 'Send Reset Instructions')}
            </button>

            {/* Back to sign in button if in reset mode */}
            {mode === 'reset' && (
              <button
                type="button"
                onClick={() => switchMode('signin')}
                className="w-full py-2 text-xs font-semibold text-white/60 hover:text-white flex items-center justify-center gap-1.5 transition-colors focus-ring rounded-lg"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Back to Sign In
              </button>
            )}

            {/* OR Divider & Google Sign-In (only in signin/signup modes) */}
            {mode !== 'reset' && (
              <>
                <div className="flex items-center gap-3 my-0.5">
                  <div className="h-px bg-white/10 flex-1" />
                  <span className="text-[11px] uppercase tracking-wider text-white/35 font-semibold">
                    or continue with
                  </span>
                  <div className="h-px bg-white/10 flex-1" />
                </div>

                <button
                  type="button"
                  onClick={handleGoogleSignIn}
                  disabled={loading || !turnstileToken}
                  className="w-full py-2.5 px-4 bg-white/[0.05] hover:bg-white/[0.09] active:scale-[0.99] border border-white/10 hover:border-white/20 text-white font-medium text-sm rounded-xl flex items-center justify-center gap-3 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm focus-ring cursor-pointer"
                >
                  <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                    <path
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                      fill="#4285F4"
                    />
                    <path
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                      fill="#34A853"
                    />
                    <path
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                      fill="#FBBC05"
                    />
                    <path
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                      fill="#EA4335"
                    />
                  </svg>
                  <span>Continue with Google</span>
                </button>
              </>
            )}
          </form>

          {/* Benefits Feature Highlights Pill */}
          <div className="mt-1 p-2.5 rounded-xl bg-white/[0.02] border border-white/5 flex items-center justify-between gap-2 text-[11px] text-white/50">
            <div className="flex items-center gap-1.5">
              <Cloud className="w-3.5 h-3.5 text-cyan-400/80 shrink-0" />
              <span>Cloud project sync</span>
            </div>
            <div className="w-1 h-1 rounded-full bg-white/20" />
            <div className="flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-400/80 shrink-0" />
              <span>Saved AI configs</span>
            </div>
            <div className="w-1 h-1 rounded-full bg-white/20" />
            <div className="flex items-center gap-1.5">
              <Check className="w-3.5 h-3.5 text-emerald-400/80 shrink-0" />
              <span>Free & secure</span>
            </div>
          </div>

          {/* Legal / Policy links */}
          <p className="text-[11px] text-white/35 text-center leading-relaxed">
            By continuing, you agree to Origami's{' '}
            <TransitionLink
              to="/terms"
              onClick={onClose}
              className="text-white/60 hover:text-cyan-400 transition-colors underline underline-offset-2"
            >
              Terms of Service
            </TransitionLink>{' '}
            and{' '}
            <TransitionLink
              to="/privacy"
              onClick={onClose}
              className="text-white/60 hover:text-cyan-400 transition-colors underline underline-offset-2"
            >
              Privacy Policy
            </TransitionLink>
            .
          </p>
        </div>
      </div>
    </div>
  );
};

