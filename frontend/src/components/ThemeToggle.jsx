import { useState, useRef, useEffect } from 'react';
import { useTheme } from '../context/useTheme';

// ── Icons ──────────────────────────────────────────────────────────────────
export function SunIcon({ size = 14, className = '' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <circle cx="8" cy="8" r="3.5" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M8 1.5v1.5M8 13v1.5M1.5 8h1.5M13 8h1.5M3.4 3.4l1.06 1.06M11.54 11.54l1.06 1.06M3.4 12.6l1.06-1.06M11.54 4.46l1.06-1.06"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function MoonIcon({ size = 14, className = '' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <path
        d="M13.5 9.2A5.8 5.8 0 016.8 2.5a6 6 0 106.7 6.7z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function SystemIcon({ size = 14, className = '' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <rect
        x="2"
        y="2.5"
        width="12"
        height="8.5"
        rx="1.5"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <path
        d="M5.5 14h5M8 11v3"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

// ── Check Icon ─────────────────────────────────────────────────────────────
function CheckIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path
        d="M2.5 6.5L5 9L9.5 3.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Reusable ThemeToggle Component
 *
 * Props:
 * - variant: 'icon' | 'segmented' | 'cards' | 'dropdown'
 * - showLabels: boolean (for segmented)
 * - size: 'sm' | 'md'
 * - className: string
 */
export default function ThemeToggle({
  variant = 'icon',
  showLabels = true,
  size = 'md',
  className = '',
}) {
  const { theme, resolvedTheme, setTheme, toggleTheme } = useTheme();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleOutside(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdownOpen(false);
      }
    }
    if (dropdownOpen) {
      document.addEventListener('mousedown', handleOutside);
      return () => document.removeEventListener('mousedown', handleOutside);
    }
  }, [dropdownOpen]);

  // ── Variant 1: Quick Icon Toggle with Dropdown ────────────────────────────
  if (variant === 'icon') {
    const isDark = resolvedTheme === 'dark';
    return (
      <div className={`relative inline-flex items-center ${className}`} ref={dropdownRef}>
        <button
          type="button"
          onClick={() => toggleTheme()}
          onContextMenu={(e) => {
            e.preventDefault();
            setDropdownOpen((v) => !v);
          }}
          aria-label={`Current theme: ${theme} (${resolvedTheme}). Click to toggle, right click for menu.`}
          title={`Theme: ${theme === 'system' ? `System (${resolvedTheme})` : theme}. Click to toggle.`}
          className="theme-icon-btn"
          style={{
            width: size === 'sm' ? 28 : 32,
            height: size === 'sm' ? 28 : 32,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 6,
            border: '1px solid var(--color-canvas-hairline, #ebebeb)',
            background: 'var(--color-canvas-card, #ffffff)',
            color: 'var(--color-canvas-ink, #171717)',
            cursor: 'pointer',
            padding: 0,
            transition: 'all 150ms ease',
          }}
        >
          {isDark ? <MoonIcon size={size === 'sm' ? 13 : 15} /> : <SunIcon size={size === 'sm' ? 13 : 15} />}
        </button>

        {/* Dropdown menu if triggered */}
        {dropdownOpen && (
          <div
            className="theme-dropdown"
            style={{
              position: 'absolute',
              right: 0,
              top: 'calc(100% + 4px)',
              background: 'var(--color-canvas-card, #ffffff)',
              border: '1px solid var(--color-canvas-hairline, #ebebeb)',
              borderRadius: 8,
              boxShadow: '0 8px 24px rgba(0,0,0,0.14)',
              padding: 4,
              minWidth: 130,
              zIndex: 60,
              display: 'flex',
              flexDirection: 'column',
              gap: 2,
            }}
          >
            {[
              { key: 'light', label: 'Light', icon: SunIcon },
              { key: 'dark', label: 'Dark', icon: MoonIcon },
              { key: 'system', label: 'System', icon: SystemIcon },
            ].map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                type="button"
                onClick={() => {
                  setTheme(key);
                  setDropdownOpen(false);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  width: '100%',
                  padding: '6px 10px',
                  borderRadius: 6,
                  border: 'none',
                  background: theme === key ? 'var(--color-canvas-hover, #f5f5f5)' : 'transparent',
                  color: theme === key ? 'var(--color-canvas-ink, #171717)' : 'var(--color-canvas-body, #4d4d4d)',
                  fontWeight: theme === key ? 600 : 400,
                  fontSize: 12,
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <Icon size={13} />
                <span style={{ flex: 1 }}>{label}</span>
                {theme === key && <CheckIcon />}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ── Variant 2: Segmented Pill Switcher ────────────────────────────────────
  if (variant === 'segmented') {
    const options = [
      { key: 'light', label: 'Light', icon: SunIcon },
      { key: 'dark', label: 'Dark', icon: MoonIcon },
      { key: 'system', label: 'System', icon: SystemIcon },
    ];

    return (
      <div
        className={`theme-segmented-group ${className}`}
        role="radiogroup"
        aria-label="Theme mode selection"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          background: 'var(--color-segmented-bg, #161719)',
          border: '1px solid var(--color-segmented-border, #2a2d31)',
          borderRadius: 8,
          padding: 3,
          gap: 2,
        }}
      >
        {options.map(({ key, label, icon: Icon }) => {
          const isActive = theme === key;
          return (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={isActive}
              onClick={() => setTheme(key)}
              title={`Switch to ${label} theme`}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                padding: showLabels ? '5px 10px' : '6px',
                borderRadius: 6,
                border: 'none',
                background: isActive ? 'var(--color-segmented-active-bg, #2a2d31)' : 'transparent',
                color: isActive ? 'var(--color-segmented-active-fg, #ffffff)' : 'var(--color-segmented-fg, #888888)',
                fontSize: 12,
                fontWeight: isActive ? 500 : 400,
                cursor: 'pointer',
                transition: 'all 120ms ease',
                lineHeight: 1,
              }}
            >
              <Icon size={13} />
              {showLabels && <span>{label}</span>}
            </button>
          );
        })}
      </div>
    );
  }

  // ── Variant 3: Interactive Visual Preview Cards (Settings Page) ───────────
  if (variant === 'cards') {
    const options = [
      {
        key: 'light',
        label: 'Light Mode',
        description: 'Clean, high-contrast crisp white canvas',
        icon: SunIcon,
        preview: (
          <div
            style={{
              height: 72,
              background: '#ffffff',
              borderRadius: 6,
              border: '1px solid #e5e7eb',
              padding: 8,
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
              boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.03)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 12, height: 12, borderRadius: 3, background: '#171717' }} />
              <div style={{ width: 48, height: 6, borderRadius: 3, background: '#e5e7eb' }} />
            </div>
            <div style={{ display: 'flex', gap: 4, flex: 1 }}>
              <div style={{ width: 24, borderRadius: 4, background: '#f3f4f6' }} />
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{ height: 14, borderRadius: 3, background: '#f9fafb', border: '1px solid #e5e7eb' }} />
                <div style={{ height: 14, borderRadius: 3, background: '#f9fafb', border: '1px solid #e5e7eb' }} />
              </div>
            </div>
          </div>
        ),
      },
      {
        key: 'dark',
        label: 'Dark Mode',
        description: 'Obsidian dark canvas with high-contrast text',
        icon: MoonIcon,
        preview: (
          <div
            style={{
              height: 72,
              background: '#090a0b',
              borderRadius: 6,
              border: '1px solid #26282d',
              padding: 8,
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
              boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.5)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 12, height: 12, borderRadius: 3, background: '#f0f1f3' }} />
              <div style={{ width: 48, height: 6, borderRadius: 3, background: '#27292e' }} />
            </div>
            <div style={{ display: 'flex', gap: 4, flex: 1 }}>
              <div style={{ width: 24, borderRadius: 4, background: '#141518' }} />
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{ height: 14, borderRadius: 3, background: '#141518', border: '1px solid #222428' }} />
                <div style={{ height: 14, borderRadius: 3, background: '#141518', border: '1px solid #222428' }} />
              </div>
            </div>
          </div>
        ),
      },
      {
        key: 'system',
        label: 'System Preference',
        description: 'Automatically match your OS light / dark mode',
        icon: SystemIcon,
        preview: (
          <div
            style={{
              height: 72,
              borderRadius: 6,
              overflow: 'hidden',
              display: 'flex',
              border: '1px solid var(--color-canvas-hairline, #ebebeb)',
            }}
          >
            {/* Left half: Light */}
            <div
              style={{
                flex: 1,
                background: '#ffffff',
                padding: 8,
                display: 'flex',
                flexDirection: 'column',
                gap: 5,
              }}
            >
              <div style={{ width: 32, height: 6, borderRadius: 3, background: '#e5e7eb' }} />
              <div style={{ height: 12, borderRadius: 3, background: '#f3f4f6' }} />
              <div style={{ height: 12, borderRadius: 3, background: '#f3f4f6' }} />
            </div>
            {/* Right half: Dark */}
            <div
              style={{
                flex: 1,
                background: '#090a0b',
                padding: 8,
                display: 'flex',
                flexDirection: 'column',
                gap: 5,
                borderLeft: '1px dashed #3f434a',
              }}
            >
              <div style={{ width: 32, height: 6, borderRadius: 3, background: '#27292e' }} />
              <div style={{ height: 12, borderRadius: 3, background: '#141518' }} />
              <div style={{ height: 12, borderRadius: 3, background: '#141518' }} />
            </div>
          </div>
        ),
      },
    ];

    return (
      <div
        className={`theme-cards-grid ${className}`}
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          gap: 12,
        }}
      >
        {options.map(({ key, label, description, icon: Icon, preview }) => {
          const isActive = theme === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setTheme(key)}
              style={{
                display: 'flex',
                flexDirection: 'column',
                padding: 12,
                borderRadius: 10,
                border: isActive
                  ? '2px solid var(--color-canvas-ink, #0070f3)'
                  : '1px solid var(--color-canvas-hairline, #ebebeb)',
                background: isActive
                  ? 'var(--color-canvas-hover, #fafafa)'
                  : 'var(--color-canvas-card, #ffffff)',
                cursor: 'pointer',
                textAlign: 'left',
                position: 'relative',
                transition: 'all 120ms ease',
                outline: 'none',
              }}
            >
              {/* Preview mockup */}
              <div style={{ marginBottom: 12 }}>{preview}</div>

              {/* Title & icon */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ color: 'var(--color-canvas-ink, #171717)' }}>
                    <Icon size={14} />
                  </span>
                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: 'var(--color-canvas-ink, #171717)',
                      letterSpacing: '-0.2px',
                    }}
                  >
                    {label}
                  </span>
                </div>
                {isActive && (
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: 16,
                      height: 16,
                      borderRadius: '50%',
                      background: 'var(--color-canvas-ink, #171717)',
                      color: 'var(--color-canvas, #ffffff)',
                    }}
                  >
                    <CheckIcon />
                  </span>
                )}
              </div>

              {/* Description */}
              <p
                style={{
                  margin: 0,
                  fontSize: 11,
                  color: 'var(--color-canvas-mute, #888888)',
                  lineHeight: '15px',
                }}
              >
                {description}
              </p>
            </button>
          );
        })}
      </div>
    );
  }

  return null;
}
