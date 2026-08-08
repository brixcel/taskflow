import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import Sidebar from '../components/Sidebar';
import ThemeToggle from '../components/ThemeToggle';
import { API_URL } from '../api/config';

const API = API_URL;

function getActiveTeam() { try { return JSON.parse(localStorage.getItem('team')); } catch { return null; } }
function getCurrentUser() { try { return JSON.parse(localStorage.getItem('user')); } catch { return null; } }

// ── Section card helpers ──────────────────────────────────────────────────
const Card = ({ children, style = {} }) => (
  <div style={{
    background: 'var(--color-canvas-card, #fff)', border: '1px solid var(--color-canvas-card-border, #ebebeb)', borderRadius: 10,
    padding: '20px 24px', marginBottom: 16, transition: 'background-color 120ms, border-color 120ms', ...style,
  }}>
    {children}
  </div>
);

const SectionTitle = ({ children }) => (
  <h2 style={{ margin: '0 0 16px', fontSize: 14, fontWeight: 600, color: 'var(--color-canvas-ink, #171717)', letterSpacing: '-0.2px' }}>
    {children}
  </h2>
);

const Row = ({ label, value, badge }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 0', borderBottom: '1px solid var(--color-canvas-hairline, #ebebeb)' }}>
    <span style={{ fontSize: 13, color: 'var(--color-canvas-mute, #888888)' }}>{label}</span>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-canvas-ink, #171717)' }}>{value}</span>
      {badge}
    </div>
  </div>
);

export default function Settings() {
  const navigate = useNavigate();

  const [user]                      = useState(getCurrentUser);
  const [activeTeam, setActiveTeam] = useState(getActiveTeam);
  const [teams,      setTeams]      = useState([]);

  const [exporting,     setExporting]     = useState(false);
  const [exportError,   setExportError]   = useState('');
  const [exportSuccess, setExportSuccess] = useState(false);

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [confirmEmail,    setConfirmEmail]    = useState('');
  const [deleting,        setDeleting]        = useState(false);
  const [deleteError,     setDeleteError]     = useState('');

  const token = localStorage.getItem('token');

  useEffect(() => {
    if (!token || !user) { navigate('/'); return; }
    axios.get(`${API}/teams/me`, { headers: { Authorization: `Bearer ${token}` } })
      .then(res => {
        const t = res.data.teams ?? [];
        setTeams(t);
        if (t.length === 0) {
          localStorage.removeItem('teamId');
          localStorage.removeItem('team');
          navigate('/onboarding');
          return;
        }
        if (!activeTeam && t.length > 0) {
          setActiveTeam(t[0]);
          localStorage.setItem('team', JSON.stringify(t[0]));
        }
      })
      .catch(err => { if (err.response?.status === 401) { localStorage.clear(); navigate('/'); } });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleTeamSwitch = (team) => {
    setActiveTeam(team);
    localStorage.setItem('team', JSON.stringify(team));
  };

  const handleLogout = () => { localStorage.clear(); navigate('/'); };

  // ── Export ────────────────────────────────────────────────────────────────
  const handleExportData = async () => {
    setExporting(true); setExportError(''); setExportSuccess(false);
    try {
      const res = await axios.get(`${API}/users/me/export`, {
        headers: { Authorization: `Bearer ${token}` },
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([res.data], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url; a.download = 'taskflow-user-data.json';
      document.body.appendChild(a); a.click(); a.remove();
      window.URL.revokeObjectURL(url);
      setExportSuccess(true);
      setTimeout(() => setExportSuccess(false), 5000);
    } catch (err) {
      setExportError(err.response?.data?.error || 'Export failed. Please try again.');
    } finally { setExporting(false); }
  };

  // ── Delete account ────────────────────────────────────────────────────────
  const handleDeleteAccount = async (e) => {
    e.preventDefault(); setDeleteError('');
    if (confirmEmail.trim().toLowerCase() !== user.email.toLowerCase()) {
      setDeleteError('Email does not match your account email.'); return;
    }
    setDeleting(true);
    try {
      await axios.delete(`${API}/users/me`, {
        headers: { Authorization: `Bearer ${token}` },
        data: { email: confirmEmail.trim() },
      });
      localStorage.clear();
      navigate('/', { state: { message: 'Your account has been deleted and data anonymized.' } });
    } catch (err) {
      setDeleteError(err.response?.data?.error || 'Deletion failed. Please try again.');
      setDeleting(false);
    }
  };

  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  return (
    <div className="app-shell">
      <Sidebar
        teams={teams}
        activeTeam={activeTeam}
        onTeamSwitch={handleTeamSwitch}
        onLogout={handleLogout}
        userName={user?.name}
        userEmail={user?.email}
        isOpen={mobileSidebarOpen}
        onClose={() => setMobileSidebarOpen(false)}
      />

      <div className="app-main">
        {/* Top bar */}
        <header style={{
          height: 52, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0 24px', borderBottom: '1px solid var(--color-header-border, #f0f1f3)',
          background: 'var(--color-header-bg, #fff)', position: 'sticky', top: 0, zIndex: 20,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button
              onClick={() => setMobileSidebarOpen(v => !v)}
              aria-expanded={mobileSidebarOpen}
              aria-label="Toggle navigation menu"
              className="btn-secondary"
              style={{ height: 32, width: 32, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
                <path d="M2.5 4.5h13M2.5 9h13M2.5 13.5h13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
            <h1 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: 'var(--color-canvas-ink, #0f1011)', letterSpacing: '-0.3px' }}>
              Account Settings
            </h1>
          </div>

          <ThemeToggle variant="icon" size="sm" />
        </header>

        {/* Content */}
        <main id="main-content" style={{ flex: 1, padding: '24px', maxWidth: 640 }}>

          {/* Appearance / Theme Selector */}
          <Card>
            <SectionTitle>Appearance</SectionTitle>
            <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--color-canvas-body, #50545c)', lineHeight: '18px' }}>
              Customize how TaskFlow looks on your device. Choose between light, dark, or automatically sync with your operating system preference.
            </p>
            <ThemeToggle variant="cards" />
          </Card>

          {/* Profile */}
          <Card>
            <SectionTitle>Profile</SectionTitle>
            <Row label="Full Name" value={user?.name || '—'} />
            <Row
              label="Email"
              value={user?.email || '—'}
              badge={
                user?.emailVerified
                  ? <span className="badge badge-done" style={{ fontSize: 10 }}>Verified</span>
                  : <span className="badge badge-progress" style={{ fontSize: 10 }}>Unverified</span>
              }
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 9 }}>
              <span style={{ fontSize: 13, color: 'var(--color-canvas-body, #50545c)' }}>Role in team</span>
              <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-canvas-ink, #0f1011)', textTransform: 'capitalize' }}>
                {activeTeam?.role || '—'}
              </span>
            </div>
          </Card>

          {/* Data export */}
          <Card>
            <SectionTitle>Data Export</SectionTitle>
            <p style={{ margin: '0 0 14px', fontSize: 13, color: 'var(--color-canvas-body, #50545c)', lineHeight: '18px' }}>
              Download a copy of all data associated with your account — tasks, comments, activity logs, and team memberships — in JSON format.
            </p>
            {exportError && <div className="error-banner" style={{ marginBottom: 12, fontSize: 13 }}>{exportError}</div>}
            {exportSuccess && <div className="success-banner" style={{ marginBottom: 12, fontSize: 13 }}>Export ready — download should have started.</div>}
            <button className="btn-secondary" onClick={handleExportData} disabled={exporting}>
              {exporting ? 'Exporting…' : 'Export my data (JSON)'}
            </button>
          </Card>

          {/* Danger zone */}
          <Card style={{ borderColor: '#f2bbb7' }}>
            <SectionTitle>Danger Zone</SectionTitle>
            <p style={{ margin: '0 0 14px', fontSize: 13, color: '#50545c', lineHeight: '18px' }}>
              Permanently delete your account. Your name will appear as <strong style={{ color: '#0f1011' }}>"Deleted User"</strong> on any existing tasks or comments to preserve team history.
            </p>
            <button
              className="btn-danger"
              onClick={() => { setShowDeleteModal(true); setConfirmEmail(''); setDeleteError(''); }}
            >
              Delete account
            </button>
          </Card>
        </main>
      </div>

      {/* Delete confirmation modal */}
      {showDeleteModal && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 100,
            background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(2px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
          }}
          onClick={e => { if (e.target === e.currentTarget) setShowDeleteModal(false); }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-modal-title"
        >
          <div style={{
            background: '#fff', borderRadius: 12, maxWidth: 440, width: '100%',
            border: '1px solid #e8eaec', boxShadow: '0 8px 32px rgba(0,0,0,0.14)', padding: 28,
          }}>
            <h2 id="delete-modal-title" style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 600, color: '#d93025', letterSpacing: '-0.3px' }}>
              Delete account?
            </h2>
            <p style={{ margin: '0 0 16px', fontSize: 13, color: '#50545c', lineHeight: '18px' }}>
              This is irreversible. Your credentials will be invalidated and personal data erased. Tasks and comments will remain, attributed to <em>"Deleted User"</em>.
            </p>

            <form onSubmit={handleDeleteAccount} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <label htmlFor="confirm-email" style={{ fontSize: 13, fontWeight: 500, color: '#3d4148' }}>
                  Type <strong>{user?.email}</strong> to confirm:
                </label>
                <input
                  id="confirm-email"
                  type="email"
                  className="field-input"
                  value={confirmEmail}
                  onChange={e => setConfirmEmail(e.target.value)}
                  placeholder={user?.email}
                  required
                  autoFocus
                />
              </div>

              {deleteError && (
                <div className="error-banner" style={{ fontSize: 13 }}>{deleteError}</div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
                <button type="button" className="btn-secondary" onClick={() => setShowDeleteModal(false)} disabled={deleting}>
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-danger"
                  disabled={deleting || confirmEmail.trim().toLowerCase() !== user?.email.toLowerCase()}
                  style={{ background: '#d93025', color: '#fff', borderColor: '#d93025' }}
                >
                  {deleting ? 'Deleting…' : 'Confirm delete'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
