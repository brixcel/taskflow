import React from 'react';

/**
 * SyncTask Official Vector Logo Component
 * Matches the glowing S-arrow cyclical checkmark brand mark.
 *
 * @param {Object} props
 * @param {number} [props.size=32] - Height/Width of the icon mark in px
 * @param {boolean} [props.showText=true] - Whether to show the "SyncTask" wordmark
 * @param {boolean} [props.showTagline=false] - Whether to show "SYNC YOUR WORK." subtitle
 * @param {string} [props.className=''] - Extra CSS classes
 * @param {string} [props.textColor] - Optional color override for the wordmark text
 */
export default function SyncTaskLogo({
  size = 32,
  showText = true,
  showTagline = false,
  className = '',
  textColor,
}) {
  const iconScale = size / 48;

  return (
    <div
      className={`inline-flex items-center gap-2.5 select-none ${className}`}
      style={{ display: 'inline-flex', alignItems: 'center' }}
    >
      {/* ── Vector S-Arrow Checkmark Emblem ── */}
      <svg
        width={size}
        height={size}
        viewBox="0 0 100 100"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ flexShrink: 0 }}
        aria-hidden="true"
      >
        <defs>
          {/* Top Arrow Gradient (Cyan -> Sky Blue) */}
          <linearGradient id="stTopGrad" x1="10" y1="15" x2="90" y2="35" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#00f2fe" />
            <stop offset="60%" stopColor="#00a8ff" />
            <stop offset="100%" stopColor="#0066ff" />
          </linearGradient>

          {/* Bottom Arrow Gradient (Deep Indigo -> Vivid Purple) */}
          <linearGradient id="stBottomGrad" x1="15" y1="85" x2="90" y2="60" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#9d4edd" />
            <stop offset="50%" stopColor="#7928ca" />
            <stop offset="100%" stopColor="#3a0ca3" />
          </linearGradient>

          {/* Connecting Spine Gradient */}
          <linearGradient id="stSpineGrad" x1="30" y1="20" x2="70" y2="80" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#00d2ff" />
            <stop offset="50%" stopColor="#0070f3" />
            <stop offset="100%" stopColor="#7928ca" />
          </linearGradient>

          {/* Text Gradient for 'Task' */}
          <linearGradient id="stTaskTextGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#00f2fe" />
            <stop offset="100%" stopColor="#9d4edd" />
          </linearGradient>

          {/* Glow Filter */}
          <filter id="stGlow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        {/* Speed Dash 1 (Top) */}
        <rect x="8" y="34" width="16" height="4.5" rx="2.25" fill="#00f2fe" opacity="0.9" />

        {/* Speed Dash 2 (Middle) */}
        <rect x="14" y="44" width="14" height="4.5" rx="2.25" fill="#00d2ff" opacity="0.8" />

        {/* Speed Dot / Dash 3 (Bottom) */}
        <circle cx="10" cy="54" r="2.5" fill="#00b4d8" opacity="0.9" />
        <rect x="16" y="52" width="22" height="4.5" rx="2.25" fill="url(#stSpineGrad)" opacity="0.85" />

        {/* Top S-Loop & Arrow */}
        <path
          d="M34 40 C34 26 44 18 62 18 L76 18 L76 9 L94 25 L76 41 L76 32 L62 32 C54 32 49 35 48 40 Z"
          fill="url(#stTopGrad)"
          filter="url(#stGlow)"
        />

        {/* Bottom S-Loop & Arrow */}
        <path
          d="M66 60 C66 74 56 82 38 82 L24 82 L24 91 L6 75 L24 59 L24 68 L38 68 C46 68 51 65 52 60 Z"
          fill="url(#stBottomGrad)"
          filter="url(#stGlow)"
        />

        {/* Central Core Checkmark (White with Glow) */}
        <path
          d="M40 50 L48 58 L68 38"
          stroke="#ffffff"
          strokeWidth="6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>

      {/* ── Brand Typography Wordmark ── */}
      {showText && (
        <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1 }}>
          <div
            style={{
              fontSize: size * 0.62,
              fontWeight: 800,
              letterSpacing: '-0.03em',
              fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <span style={{ color: textColor || 'var(--color-canvas-ink, #0f1011)' }}>
              Sync
            </span>
            <span
              style={{
                background: 'linear-gradient(135deg, #00f2fe 0%, #0070f3 45%, #9d4edd 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                display: 'inline-block',
                marginLeft: 1,
              }}
            >
              Task
            </span>
          </div>

          {showTagline && (
            <div
              style={{
                fontSize: Math.max(9, size * 0.22),
                fontWeight: 700,
                letterSpacing: '0.18em',
                color: 'var(--color-canvas-mute, #8a8f98)',
                marginTop: 2,
                textTransform: 'uppercase',
                fontFamily: "'JetBrains Mono', monospace",
              }}
            >
              Sync Your Work.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * SyncTask Icon Only (Square / Avatar size)
 */
export function SyncTaskIcon({ size = 24, className = '' }) {
  return <SyncTaskLogo size={size} showText={false} className={className} />;
}
