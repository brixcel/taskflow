import { useEffect, useRef } from 'react';

/**
 * TurnstileWidget.jsx — Cloudflare Turnstile CAPTCHA Integration (Charter C12, C13)
 * Renders Cloudflare Turnstile challenge box without intrusive friction for human users.
 */
export default function TurnstileWidget({ onVerify, onExpire, onError }) {
  const containerRef = useRef(null);
  const widgetIdRef = useRef(null);
  const siteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY;

  useEffect(() => {
    // If no site key is configured (local dev without Cloudflare Turnstile), bypass cleanly
    if (!siteKey) {
      if (onVerify) onVerify('dev-bypass-token');
      return;
    }

    let isMounted = true;

    const renderWidget = () => {
      if (!isMounted || !containerRef.current || !window.turnstile) return;

      try {
        if (widgetIdRef.current) {
          window.turnstile.remove(widgetIdRef.current);
        }

        widgetIdRef.current = window.turnstile.render(containerRef.current, {
          sitekey: siteKey,
          callback: (token) => {
            if (isMounted && onVerify) onVerify(token);
          },
          'expired-callback': () => {
            if (isMounted && onExpire) onExpire();
          },
          'error-callback': (err) => {
            if (isMounted && onError) onError(err);
          },
          theme: 'auto',
          size: 'flexible',
        });
      } catch (e) {
        console.warn('Turnstile render error:', e);
      }
    };

    // Load Cloudflare Turnstile script if not already present
    const SCRIPT_ID = 'cf-turnstile-script';
    let script = document.getElementById(SCRIPT_ID);

    if (!script) {
      script = document.createElement('script');
      script.id = SCRIPT_ID;
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      script.async = true;
      script.defer = true;
      script.onload = renderWidget;
      document.head.appendChild(script);
    } else if (window.turnstile) {
      renderWidget();
    } else {
      script.addEventListener('load', renderWidget);
    }

    return () => {
      isMounted = false;
      if (window.turnstile && widgetIdRef.current) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch (_) {}
      }
    };
  }, [siteKey, onVerify, onExpire, onError]);

  if (!siteKey) {
    return null; // Silent render when Turnstile is disabled in dev
  }

  return (
    <div
      ref={containerRef}
      style={{
        minHeight: 65,
        display: 'flex',
        justifyContent: 'center',
        margin: '6px 0',
      }}
    />
  );
}
