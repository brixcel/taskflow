import { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation, NavLink } from 'react-router-dom';

// ── Logo mark ──────────────────────────────────────────────────────────────────
function LogoMark() {
  return (
    <span className="inline-flex items-center justify-center w-6 h-6 rounded-[5px] bg-[#171717] shrink-0">
      <svg width="12" height="12" viewBox="0 0 14 14" fill="none" aria-hidden="true">
        <path
          d="M2 11 L7 3 L12 11"
          stroke="white"
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
  // Add more routes here as the app grows, e.g.:
  // { label: 'Members', to: '/members' },
  // { label: 'Settings', to: '/settings' },
];

// ── Navbar ────────────────────────────────────────────────────────────────────
/**
 * Props
 * - teams       {Array<{id, name, role}>}  – all teams the user belongs to
 * - activeTeam  {id, name, role} | null    – currently selected team
 * - onTeamSwitch (team) => void            – called when the user picks a team
 * - onLogout    () => void
 */
export default function Navbar({ teams = [], activeTeam = null, onTeamSwitch, onLogout }) {
  const navigate  = useNavigate();
  const location  = useLocation();
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
      className="sticky top-0 z-20 bg-[#ffffff] border-b border-[#ebebeb]"
      style={{ height: '64px' }}
    >
      <div className="max-w-3xl mx-auto px-6 h-full flex items-center justify-between gap-6">

        {/* ── Left: wordmark + slash + team context ─────────────────────────── */}
        <div className="flex items-center gap-3 min-w-0">

          {/* Wordmark */}
          <button
            onClick={() => navigate('/dashboard')}
            className="flex items-center gap-2 shrink-0 cursor-pointer"
            aria-label="Go to dashboard"
          >
            <LogoMark />
            <span
              className="text-[#171717] font-semibold tracking-[-0.6px]"
              style={{ fontSize: '15px' }}
            >
              TaskFlow
            </span>
          </button>

          {/* Divider */}
          <span className="text-[#e0e0e0] shrink-0" aria-hidden="true">/</span>

          {/* Team: single name or multi-team custom dropdown */}
          {teams.length > 1 ? (
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setDropdownOpen((v) => !v)}
                className="flex items-center gap-1 h-7 px-2 bg-[#ffffff] text-[#171717] border border-[#ebebeb] rounded-[6px] font-medium transition-colors hover:border-[#a1a1a1] cursor-pointer"
                style={{ fontSize: '13px', lineHeight: '20px', letterSpacing: '-0.28px' }}
                aria-haspopup="listbox"
                aria-expanded={dropdownOpen}
                aria-label="Switch team"
              >
                <span className="truncate max-w-[140px]">{activeTeam?.name ?? '—'}</span>
                <span
                  className="text-[#888888] transition-transform duration-150"
                  style={{ transform: dropdownOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}
                >
                  <ChevronIcon />
                </span>
              </button>

              {dropdownOpen && (
                <ul
                  role="listbox"
                  aria-label="Select team"
                  className="absolute left-0 mt-1 min-w-[160px] bg-[#ffffff] border border-[#ebebeb] rounded-[8px] overflow-hidden py-1"
                  style={{
                    boxShadow:
                      '0px 4px 6px rgba(0,0,0,0.04), 0px 10px 16px rgba(0,0,0,0.06)',
                    zIndex: 50,
                  }}
                >
                  {teams.map((t) => {
                    const isActive = t.id === activeTeam?.id;
                    return (
                      <li key={t.id} role="option" aria-selected={isActive}>
                        <button
                          onClick={() => handleSelect(t)}
                          className="w-full flex items-center justify-between gap-3 px-3 py-2 text-left transition-colors hover:bg-[#fafafa] cursor-pointer"
                          style={{ fontSize: '13px', lineHeight: '20px' }}
                        >
                          <span
                            className={`truncate ${isActive ? 'text-[#171717] font-medium' : 'text-[#4d4d4d]'}`}
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
                              className="shrink-0 text-[#171717]"
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
              className="text-[#171717] font-medium truncate"
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
                    ? 'bg-[#f5f5f5] text-[#171717]'
                    : 'text-[#4d4d4d] hover:text-[#171717] hover:bg-[#fafafa]',
                ].join(' ')
              }
              style={{ fontSize: '13px', lineHeight: '20px', letterSpacing: '-0.28px' }}
            >
              {label}
            </NavLink>
          ))}
        </nav>

        {/* ── Right: logout ─────────────────────────────────────────────────── */}
        <button
          onClick={onLogout}
          className="shrink-0 h-7 px-3 bg-[#ffffff] text-[#171717] border border-[#ebebeb] rounded-[6px] font-medium transition-colors hover:bg-[#fafafa] hover:border-[#a1a1a1] cursor-pointer"
          style={{ fontSize: '13px', lineHeight: '20px', letterSpacing: '-0.28px' }}
        >
          Log out
        </button>
      </div>
    </header>
  );
}
