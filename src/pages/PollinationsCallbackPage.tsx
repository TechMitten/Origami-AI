import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { AlertTriangle, Loader2 } from 'lucide-react';

import {
  consumePendingPollinationsOAuth,
  exchangeCodeForToken,
  fetchPollinationsUserinfo,
  startPollinationsOAuth,
} from '../services/pollinationsAuth';
import { loadGlobalSettings, saveGlobalSettings, type GlobalSettings } from '../services/storage';
import { useNotifications } from '../context/NotificationContext';
import { usePageMeta } from '../hooks/usePageMeta';

const DEFAULT_GLOBAL_SETTINGS: GlobalSettings = {
  isEnabled: true,
  voice: 'af_heart',
  delay: 0.5,
  transition: 'fade',
  introFadeInEnabled: true,
  introFadeInDurationSec: 1,
  previewMode: 'modal',
  aspectRatio: '16:9',
};

export const PollinationsCallbackPage: React.FC = () => {
  usePageMeta({
    title: 'Connecting Pollinations — Origami AI',
    path: '/pollinations-callback',
    noindex: true,
  });

  const navigate = useNavigate();
  const { refresh: refreshNotifications } = useNotifications();
  const ranRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [returnTo, setReturnTo] = useState('/');

  useEffect(() => {
    // StrictMode double-invokes effects in dev; the auth code is single-use, so a
    // second run would burn it and fail with invalid_grant.
    if (ranRef.current) return;
    ranRef.current = true;

    const run = async () => {
      const params = new URLSearchParams(window.location.search);
      const code = params.get('code');
      const state = params.get('state');
      const oauthError = params.get('error');
      const oauthErrorDescription = params.get('error_description');

      const pending = consumePendingPollinationsOAuth();
      if (pending) setReturnTo(pending.returnTo);

      if (oauthError) {
        setError(oauthErrorDescription || 'Sign-in was cancelled.');
        return;
      }

      if (!code || !state || !pending || state !== pending.state) {
        setError('Your sign-in session expired or is invalid. Please try again.');
        return;
      }

      try {
        const token = await exchangeCodeForToken(code, pending.verifier);
        const userinfo = await fetchPollinationsUserinfo(token.accessToken);

        const current = await loadGlobalSettings();
        await saveGlobalSettings({
          ...(current ?? DEFAULT_GLOBAL_SETTINGS),
          pollinationsApiKey: token.accessToken,
          pollinationsTokenExpiresAt: token.expiresAt,
          pollinationsAccountName: userinfo?.preferredUsername ?? userinfo?.name ?? undefined,
        });
        refreshNotifications();

        navigate(pending.returnTo || '/', { replace: true });
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Pollinations sign-in failed.');
      }
    };

    void run();
  }, [navigate, refreshNotifications]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0a0a0b] text-white px-6">
      <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-white/5 p-8 text-center space-y-4">
        {error ? (
          <>
            <div className="mx-auto w-fit p-3 rounded-full bg-amber-400/10 text-amber-300">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <p className="text-sm text-white/70 leading-relaxed">{error}</p>
            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => void startPollinationsOAuth(returnTo)}
                className="px-4 py-2 rounded-xl bg-white text-black text-sm font-semibold hover:bg-white/90 transition-colors"
              >
                Try again
              </button>
              <button
                type="button"
                onClick={() => navigate(returnTo || '/', { replace: true })}
                className="px-4 py-2 rounded-xl border border-white/15 text-white/70 text-sm font-semibold hover:bg-white/10 transition-colors"
              >
                Back to app
              </button>
            </div>
          </>
        ) : (
          <>
            <Loader2 className="w-6 h-6 mx-auto animate-spin text-white/60" />
            <p className="text-sm text-white/70">Connecting to Pollinations…</p>
          </>
        )}
      </div>
    </div>
  );
};

export default PollinationsCallbackPage;
