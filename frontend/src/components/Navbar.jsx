import { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation, NavLink } from 'react-router-dom';
import ThemeToggle from './ThemeToggle';
import NotificationBell from './NotificationBell';
import SyncTaskLogo from './SyncTaskLogo';
import { useRealtime } from '../context/RealtimeContext';

// ── Logo mark ──────────────────────────────────────────────────────────────────
function LogoMark() {
  return (
    <span className="inline-flex items-center justify-center w-6 h-6 rounded-[5px] bg-[var(--color-canvas-ink,#171717)] text-[var(--color-canvas-main,#ffffff)] shrink-0">
      <svg width="12" height="12" viewBox="0 0 14 14" fill="none" aria-hidden="true">
        <path
          d="M2 11 L7 3 L12 11"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

// ── Chevron icon for the team dropdown ────────────────────────────────────────
function ChevronIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path
        d="M3 4.5L6 7.5L9 4.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ── Nav items ─────────────────────────────────────────────────────────────────
const NAV_ITEMS = [
  { label: 'Tasks', to: '/dashboard' },
  { label: 'Settings', to: '/settings' },
];

// ── Navbar ────────────────────────────────────────────────────────────────────
export default function Navbar({ teams = [], activeTeam = null, onTeamSwitch, onLogout }) {
  const navigate  = useNavigate();
  const location  = useLocation();
  const { status, isConnected } = useRealtime();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleOutside(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdownOpen(false);
      }
    }
    if (dropdownOpen) document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [dropdownOpen]);

  // Close dropdown on route change
  useEffect(() => { setDropdownOpen(false); }, [location.pathname]); // eslint-disable-line react-hooks/set-state-in-effect

  const handleSelect = (team) => {
    setDropdownOpen(false);
    if (team.id !== activeTeam?.id) onTeamSwitch?.(team);
  };

  return (
    <header
      className="sticky top-0 z-20 bg-[var(--color-header-bg,#ffffff)] border-b border-[var(--color-header-border,#ebebeb)]"
      style={{ height: '64px' }}
    >
      <div className="max-w-3xl mx-auto px-6 h-full flex items-center justify-between gap-6">

        {/* ── Left: wordmark + slash + team context ─────────────────────────── */}
        <div className="flex items-center gap-3 min-w-0">

          {/* Wordmark */}
          <button
            onClick={() => navigate('/dashboard')}
            className="flex items-center gap-2 shrink-0 cursor-pointer bg-transparent border-0 p-0"
            aria-label="Go to dashboard"
          >
            <SyncTaskLogo size={22} />
          </button>


          {/* Divider */}
          <span className="text-[var(--color-canvas-hairline-strong,#a1a1a1)] opacity-50 shrink-0" aria-hidden="true">/</span>

          {/* Team: single name or multi-team custom dropdown */}
          {teams.length > 1 ? (
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setDropdownOpen((v) => !v)}
                className="flex items-center gap-1 h-7 px-2 bg-[var(--color-canvas-card,#ffffff)] text-[var(--color-canvas-ink,#171717)] border border-[var(--color-canvas-hairline,#ebebeb)] rounded-[6px] font-medium transition-colors hover:border-[var(--color-canvas-hairline-strong,#a1a1a1)] cursor-pointer"
                style={{ fontSize: '13px', lineHeight: '20px', letterSpacing: '-0.28px' }}
                aria-haspopup="listbox"
                aria-expanded={dropdownOpen}
                aria-label="Switch team"
              >
                <span className="truncate max-w-[140px]">{activeTeam?.name ?? '—'}</span>
                <span
                  className="text-[var(--color-canvas-mute,#888888)] transition-transform duration-150"
                  style={{ transform: dropdownOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}
                >
                  <ChevronIcon />
                </span>
              </button>

              {dropdownOpen && (
                <ul
                  role="listbox"
                  aria-label="Select team"
                  className="absolute left-0 mt-1 min-w-[160px] bg-[var(--color-canvas-card,#ffffff)] border border-[var(--color-canvas-hairline,#ebebeb)] rounded-[8px] overflow-hidden py-1 shadow-lg"
                  style={{ zIndex: 50 }}
                >
                  {teams.map((t) => {
                    const isActive = t.id === activeTeam?.id;
                    return (
                      <li key={t.id} role="option" aria-selected={isActive}>
                        <button
                          onClick={() => handleSelect(t)}
                          className="w-full flex items-center justify-between gap-3 px-3 py-2 text-left transition-colors hover:bg-[var(--color-canvas-hover,#fafafa)] cursor-pointer border-0 bg-transparent"
                          style={{ fontSize: '13px', lineHeight: '20px' }}
                        >
                          <span
                            className={`truncate ${isActive ? 'text-[var(--color-canvas-ink,#171717)] font-medium' : 'text-[var(--color-canvas-body,#4d4d4d)]'}`}
                          >
                            {t.name}
                          </span>
                          {isActive && (
                            <svg
                              width="12"
                              height="12"
                              viewBox="0 0 12 12"
                              fill="none"
                              aria-hidden="true"
                              className="shrink-0 text-[var(--color-canvas-ink,#171717)]"
                            >
                              <path
                                d="M2 6.5L4.5 9L10 3"
                                stroke="currentColor"
                                strokeWidth="1.5"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          ) : (
            <span
              className="text-[var(--color-canvas-ink,#171717)] font-medium truncate"
              style={{ fontSize: '13px', lineHeight: '20px', letterSpacing: '-0.28px' }}
            >
              {activeTeam?.name ?? '—'}
            </span>
          )}
        </div>

        {/* ── Center: nav links ─────────────────────────────────────────────── */}
        <nav className="hidden sm:flex items-center gap-1" aria-label="Main navigation">
          {NAV_ITEMS.map(({ label, to }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                [
                  'px-3 py-1.5 rounded-full font-medium transition-colors',
                  isActive
                    ? 'bg-[var(--color-canvas-hover,#f5f5f5)] text-[var(--color-canvas-ink,#171717)]'
                    : 'text-[var(--color-canvas-body,#4d4d4d)] hover:text-[var(--color-canvas-ink,#171717)] hover:bg-[var(--color-canvas-hover,#fafafa)]',
                ].join(' ')
              }
              style={{ fontSize: '13px', lineHeight: '20px', letterSpacing: '-0.28px' }}
            >
              {label}
            </NavLink>
          ))}
        </nav>

        {/* ── Right: Live status + NotificationBell + ThemeToggle + logout ────────────────── */}
        <div className="flex items-center gap-2.5">
          {status === 'connected' ? (
            <span
              className="hidden md:inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
              title="Real-time collaboration active"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              Live
            </span>
          ) : status === 'connecting' || status === 'reconnecting' ? (
            <span
              className="hidden md:inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20"
              title="Connecting to real-time collaboration server..."
            >
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-ping"></span>
              Connecting...
            </span>
          ) : null}

          <NotificationBell
            onSelectTask={(taskId) => {
              navigate(`/dashboard?taskId=${taskId}`);
            }}
          />
          <ThemeToggle variant="icon" size="sm" />
          <button
            onClick={onLogout}
            className="shrink-0 h-7 px-3 bg-[var(--color-canvas-card,#ffffff)] text-[var(--color-canvas-ink,#171717)] border border-[var(--color-canvas-hairline,#ebebeb)] rounded-[6px] font-medium transition-colors hover:bg-[var(--color-canvas-hover,#fafafa)] hover:border-[var(--color-canvas-hairline-strong,#a1a1a1)] cursor-pointer"
            style={{ fontSize: '13px', lineHeight: '20px', letterSpacing: '-0.28px' }}
          >
            Log out
          </button>
        </div>
      </div>
    </header>
  );
}
