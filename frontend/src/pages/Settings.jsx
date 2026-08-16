import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import Sidebar from '../components/Sidebar';
import ThemeToggle from '../components/ThemeToggle';
import NotificationBell from '../components/NotificationBell';
import { API_URL } from '../api/config';

const API = API_URL;

function getActiveTeam() {
  try { return JSON.parse(localStorage.getItem('team')); } catch { return null; }
}
function getCurrentUser() {
  try { return JSON.parse(localStorage.getItem('user')); } catch { return null; }
}

const Card = ({ children, style = {} }) => (
  <div
    style={{
      background: 'var(--color-canvas-card, #fff)',
      border: '1px solid var(--color-canvas-card-border, #ebebeb)',
      borderRadius: 10,
      padding: '20px 24px',
      marginBottom: 16,
      transition: 'background-color 120ms, border-color 120ms',
      ...style,
    }}
  >
    {children}
  </div>
);

const SectionTitle = ({ children }) => (
  <h2
    style={{
      margin: '0 0 16px',
      fontSize: 14,
      fontWeight: 600,
      color: 'var(--color-canvas-ink, #171717)',
      letterSpacing: '-0.2px',
    }}
  >
    {children}
  </h2>
);

const Row = ({ label, value, badge }) => (
  <div
    style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '9px 0',
      borderBottom: '1px solid var(--color-canvas-hairline, #ebebeb)',
    }}
  >
    <span style={{ fontSize: 13, color: 'var(--color-canvas-mute, #888888)' }}>{label}</span>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-canvas-ink, #171717)' }}>{value}</span>
      {badge}
    </div>
  </div>
);

const ALL_WEBHOOK_EVENTS = [
  { id: 'task.created', label: 'Task Created' },
  { id: 'task.updated', label: 'Task Updated' },
  { id: 'task.completed', label: 'Task Completed' },
  { id: 'task.assigned', label: 'Task Assigned' },
  { id: 'comment.created', label: 'Comment Created' },
  { id: 'project.created', label: 'Project Created' },
];

export default function Settings() {
  const navigate = useNavigate();

  const [activeSettingsTab, setActiveSettingsTab] = useState('general'); // 'general' | 'developer'

  const [user] = useState(getCurrentUser);
  const [activeTeam, setActiveTeam] = useState(getActiveTeam);
  const [teams, setTeams] = useState([]);

  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');
  const [exportSuccess, setExportSuccess] = useState(false);

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [confirmEmail, setConfirmEmail] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  // ── Notification preferences state ──────────────────────────────────────────
  const [notificationPreferences, setNotificationPreferences] = useState({
    taskAssigned: true,
    statusChanged: true,
    commentsAndMentions: true,
    dueDates: true,
    teamUpdates: true,
    emailNotifications: false,
  });
  const [savingNotifPrefs, setSavingNotifPrefs] = useState(false);
  const [notifPrefSuccess, setNotifPrefSuccess] = useState(false);

  // ── Developer / API Keys state (Phase 31) ───────────────────────────────────
  const [apiKeys, setApiKeys] = useState([]);
  const [loadingApiKeys, setLoadingApiKeys] = useState(false);
  const [showCreateKeyModal, setShowCreateKeyModal] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyExpiresDays, setNewKeyExpiresDays] = useState('');
  const [createdSecretKey, setCreatedSecretKey] = useState(null);
  const [creatingKey, setCreatingKey] = useState(false);
  const [keyError, setKeyError] = useState('');
  const [copiedKey, setCopiedKey] = useState(false);

  // ── Developer / Webhooks state (Phase 31) ───────────────────────────────────
  const [webhooks, setWebhooks] = useState([]);
  const [loadingWebhooks, setLoadingWebhooks] = useState(false);
  const [showWebhookModal, setShowWebhookModal] = useState(false);
  const [webhookName, setWebhookName] = useState('');
  const [webhookUrl, setWebhookUrl] = useState('');
  const [webhookEvents, setWebhookEvents] = useState(['task.created', 'task.updated', 'task.completed']);
  const [editingWebhookId, setEditingWebhookId] = useState(null);
  const [savingWebhook, setSavingWebhook] = useState(false);
  const [webhookError, setWebhookError] = useState('');
  const [pingStatus, setPingStatus] = useState({});

  // ── Webhook Deliveries Modal ────────────────────────────────────────────────
  const [viewingDeliveriesWebhook, setViewingDeliveriesWebhook] = useState(null);
  const [deliveries, setDeliveries] = useState([]);
  const [loadingDeliveries, setLoadingDeliveries] = useState(false);

  const token = localStorage.getItem('token');
  const headers = {
    Authorization: `Bearer ${token}`,
    'X-Team-Id': activeTeam?.id,
  };

  useEffect(() => {
    if (!token) {
      navigate('/login');
      return;
    }
    fetchTeams();
    fetchNotificationPreferences();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (activeSettingsTab === 'developer' && activeTeam?.id) {
      fetchApiKeys();
      fetchWebhooks();
    }
  }, [activeSettingsTab, activeTeam?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchTeams = async () => {
    try {
      const res = await axios.get(`${API}/teams`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setTeams(res.data.teams || []);
    } catch {
      // ignore
    }
  };

  const fetchNotificationPreferences = async () => {
    try {
      const res = await axios.get(`${API}/notifications/preferences`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.data.preferences) {
        setNotificationPreferences(res.data.preferences);
      }
    } catch {
      // fallback to defaults
    }
  };

  // ── Developer Fetch Handlers ────────────────────────────────────────────────
  const fetchApiKeys = async () => {
    if (!activeTeam?.id) return;
    setLoadingApiKeys(true);
    try {
      const res = await axios.get(`${API}/developer/api-keys`, { headers });
      setApiKeys(res.data.apiKeys || []);
    } catch {
      // ignore
    } finally {
      setLoadingApiKeys(false);
    }
  };

  const fetchWebhooks = async () => {
    if (!activeTeam?.id) return;
    setLoadingWebhooks(true);
    try {
      const res = await axios.get(`${API}/developer/webhooks`, { headers });
      setWebhooks(res.data.webhooks || []);
    } catch {
      // ignore
    } finally {
      setLoadingWebhooks(false);
    }
  };

  const handleCreateApiKey = async (e) => {
    e.preventDefault();
    if (!newKeyName.trim()) return;
    setCreatingKey(true);
    setKeyError('');
    try {
      const res = await axios.post(
        `${API}/developer/api-keys`,
        {
          name: newKeyName.trim(),
          expiresInDays: newKeyExpiresDays ? parseInt(newKeyExpiresDays, 10) : null,
          scopes: ['*'],
        },
        { headers }
      );
      setCreatedSecretKey(res.data.secretKey);
      fetchApiKeys();
    } catch (err) {
      setKeyError(err.response?.data?.error || 'Failed to create API key');
    } finally {
      setCreatingKey(false);
    }
  };

  const handleRevokeApiKey = async (keyId) => {
    if (!window.confirm('Are you sure you want to revoke this API key? Applications using it will immediately lose access.')) {
      return;
    }
    try {
      await axios.delete(`${API}/developer/api-keys/${keyId}`, { headers });
      fetchApiKeys();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to revoke API key');
    }
  };

  const handleRotateApiKey = async (keyId) => {
    if (!window.confirm('Rotating this key will revoke the existing key and generate a new one. Proceed?')) {
      return;
    }
    try {
      const res = await axios.post(`${API}/developer/api-keys/${keyId}/rotate`, {}, { headers });
      setCreatedSecretKey(res.data.secretKey);
      fetchApiKeys();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to rotate API key');
    }
  };

  const handleSaveWebhook = async (e) => {
    e.preventDefault();
    if (!webhookName.trim() || !webhookUrl.trim() || webhookEvents.length === 0) return;
    setSavingWebhook(true);
    setWebhookError('');
    try {
      if (editingWebhookId) {
        await axios.patch(
          `${API}/developer/webhooks/${editingWebhookId}`,
          { name: webhookName.trim(), url: webhookUrl.trim(), events: webhookEvents },
          { headers }
        );
      } else {
        await axios.post(
          `${API}/developer/webhooks`,
          { name: webhookName.trim(), url: webhookUrl.trim(), events: webhookEvents },
          { headers }
        );
      }
      setShowWebhookModal(false);
      setEditingWebhookId(null);
      setWebhookName('');
      setWebhookUrl('');
      fetchWebhooks();
    } catch (err) {
      setWebhookError(err.response?.data?.error || 'Failed to save webhook');
    } finally {
      setSavingWebhook(false);
    }
  };

  const handleDeleteWebhook = async (webhookId) => {
    if (!window.confirm('Are you sure you want to delete this webhook endpoint?')) return;
    try {
      await axios.delete(`${API}/developer/webhooks/${webhookId}`, { headers });
      fetchWebhooks();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to delete webhook');
    }
  };

  const handleTestPingWebhook = async (webhookId) => {
    setPingStatus((prev) => ({ ...prev, [webhookId]: 'sending' }));
    try {
      const res = await axios.post(`${API}/developer/webhooks/${webhookId}/test`, {}, { headers });
      setPingStatus((prev) => ({
        ...prev,
        [webhookId]: res.data.success ? `success (${res.data.delivery?.statusCode || 200})` : `failed (${res.data.delivery?.statusCode || 'Error'})`,
      }));
      setTimeout(() => {
        setPingStatus((prev) => {
          const next = { ...prev };
          delete next[webhookId];
          return next;
        });
      }, 4000);
    } catch (err) {
      setPingStatus((prev) => ({ ...prev, [webhookId]: 'failed' }));
    }
  };

  const handleViewDeliveries = async (webhook) => {
    setViewingDeliveriesWebhook(webhook);
    setLoadingDeliveries(true);
    try {
      const res = await axios.get(`${API}/developer/webhooks/${webhook.id}/deliveries`, { headers });
      setDeliveries(res.data.deliveries || []);
    } catch {
      setDeliveries([]);
    } finally {
      setLoadingDeliveries(false);
    }
  };

  const handleExportData = async () => {
    setExporting(true);
    setExportError('');
    setExportSuccess(false);
    try {
      const res = await axios.get(`${API}/auth/export-data`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const dataStr = JSON.stringify(res.data, null, 2);
      const blob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `taskflow-data-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setExportSuccess(true);
    } catch (err) {
      setExportError(err.response?.data?.error || 'Failed to export data.');
    } finally {
      setExporting(false);
    }
  };

  const handleDeleteAccount = async (e) => {
    e.preventDefault();
    if (confirmEmail.trim().toLowerCase() !== user?.email?.toLowerCase()) {
      setDeleteError('Email confirmation does not match.');
      return;
    }
    setDeleting(true);
    setDeleteError('');
    try {
      await axios.delete(`${API}/auth/delete-account`, {
        headers: { Authorization: `Bearer ${token}` },
        data: { confirmEmail: confirmEmail.trim() },
      });
      localStorage.clear();
      navigate('/register');
    } catch (err) {
      setDeleteError(err.response?.data?.error || 'Failed to delete account.');
      setDeleting(false);
    }
  };

  return (
    <div className="dashboard-layout" style={{ minHeight: '100vh', display: 'flex' }}>
      <Sidebar
        activeProjectId={null}
        onSelectProject={() => navigate('/dashboard')}
        onNewProject={() => navigate('/dashboard')}
        onTeamSwitch={(team) => {
          setActiveTeam(team);
          localStorage.setItem('team', JSON.stringify(team));
        }}
        onLogout={() => {
          localStorage.clear();
          navigate('/login');
        }}
        userName={user?.name}
        userEmail={user?.email}
        currentTeam={activeTeam}
        teams={teams}
      />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {/* Header */}
        <header
          style={{
            height: 52,
            borderBottom: '1px solid var(--color-canvas-hairline, #ebebeb)',
            padding: '0 24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'var(--color-canvas-card, #fff)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-canvas-ink, #171717)' }}>
              Settings
            </span>
            <span style={{ color: 'var(--color-canvas-mute, #888888)', fontSize: 13 }}>/</span>
            <span style={{ fontSize: 13, color: 'var(--color-canvas-body, #50545c)' }}>
              {activeSettingsTab === 'general' ? 'General & Preferences' : 'Developer & Webhooks'}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <NotificationBell />
            <ThemeToggle />
          </div>
        </header>

        {/* Tab Navigation */}
        <div
          style={{
            padding: '0 28px',
            borderBottom: '1px solid var(--color-canvas-hairline, #ebebeb)',
            background: 'var(--color-canvas-card, #fff)',
            display: 'flex',
            gap: 24,
          }}
        >
          <button
            onClick={() => setActiveSettingsTab('general')}
            style={{
              padding: '12px 0',
              fontSize: 13,
              fontWeight: 600,
              color: activeSettingsTab === 'general' ? '#0070f3' : 'var(--color-canvas-mute, #888888)',
              borderBottom: activeSettingsTab === 'general' ? '2px solid #0070f3' : '2px solid transparent',
              background: 'transparent',
              borderTop: 0,
              borderLeft: 0,
              borderRight: 0,
              cursor: 'pointer',
              transition: 'color 120ms',
            }}
          >
            ⚙️ General & Preferences
          </button>
          <button
            onClick={() => setActiveSettingsTab('developer')}
            style={{
              padding: '12px 0',
              fontSize: 13,
              fontWeight: 600,
              color: activeSettingsTab === 'developer' ? '#0070f3' : 'var(--color-canvas-mute, #888888)',
              borderBottom: activeSettingsTab === 'developer' ? '2px solid #0070f3' : '2px solid transparent',
              background: 'transparent',
              borderTop: 0,
              borderLeft: 0,
              borderRight: 0,
              cursor: 'pointer',
              transition: 'color 120ms',
            }}
          >
            🔌 Developer & API Keys
          </button>
        </div>

        {/* Content Body */}
        <main
          style={{
            flex: 1,
            padding: '28px',
            maxWidth: 860,
            width: '100%',
            margin: '0 auto',
            boxSizing: 'border-box',
          }}
        >
          {activeSettingsTab === 'general' ? (
            <>
              {/* Account profile card */}
              <Card>
                <SectionTitle>Account Profile</SectionTitle>
                <Row label="Full Name" value={user?.name || '—'} />
                <Row label="Email Address" value={user?.email || '—'} />
                <Row
                  label="Email Verification"
                  value={user?.emailVerified ? 'Verified' : 'Unverified'}
                  badge={
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        padding: '2px 8px',
                        borderRadius: 20,
                        background: user?.emailVerified ? 'rgba(48, 164, 108, 0.12)' : 'rgba(229, 72, 77, 0.12)',
                        color: user?.emailVerified ? '#30a46c' : '#e5484d',
                      }}
                    >
                      {user?.emailVerified ? 'Verified' : 'Pending'}
                    </span>
                  }
                />
              </Card>

              {/* Active team card */}
              <Card>
                <SectionTitle>Active Team Workspace</SectionTitle>
                <Row label="Team Name" value={activeTeam?.name || 'No team selected'} />
                <Row label="Team Identifier" value={activeTeam?.id || '—'} />
              </Card>

              {/* Notification Preferences */}
              <Card>
                <SectionTitle>Notification Preferences</SectionTitle>
                {notifPrefSuccess && (
                  <div className="success-banner" style={{ marginBottom: 12, fontSize: 13 }}>
                    Notification preferences saved!
                  </div>
                )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {[
                    { key: 'taskAssigned', label: 'Task assignments & reassignments', desc: 'When you are assigned to a new or existing task.' },
                    { key: 'statusChanged', label: 'Status changes & task completions', desc: 'When task status updates or moves to completed.' },
                    { key: 'commentsAndMentions', label: 'Comments and @mentions', desc: 'When someone comments on your task or mentions you.' },
                    { key: 'dueDates', label: 'Due dates & overdue alerts', desc: 'Reminders for approaching and overdue deadlines.' },
                    { key: 'teamUpdates', label: 'Team invitations & role changes', desc: 'When team membership or roles are modified.' },
                    { key: 'emailNotifications', label: 'Email notification digest', desc: 'Receive transactional emails for key updates.' },
                  ].map(({ key, label, desc }) => (
                    <div
                      key={key}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 16,
                        padding: '8px 0',
                        borderBottom: '1px solid var(--color-canvas-hairline, #ebebeb)',
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: 'var(--color-canvas-ink, #171717)' }}>
                          {label}
                        </p>
                        <p style={{ margin: 0, fontSize: 12, color: 'var(--color-canvas-mute, #888888)', lineHeight: '16px' }}>
                          {desc}
                        </p>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer shrink-0">
                        <input
                          type="checkbox"
                          checked={Boolean(notificationPreferences[key])}
                          disabled={savingNotifPrefs}
                          onChange={async () => {
                            const updated = { ...notificationPreferences, [key]: !notificationPreferences[key] };
                            setNotificationPreferences(updated);
                            setSavingNotifPrefs(true);
                            try {
                              await axios.patch(`${API}/notifications/preferences`, updated, {
                                headers: { Authorization: `Bearer ${token}` },
                              });
                              setNotifPrefSuccess(true);
                              setTimeout(() => setNotifPrefSuccess(false), 3000);
                            } catch (err) {
                              console.error('Failed to update notification preference:', err);
                            } finally {
                              setSavingNotifPrefs(false);
                            }
                          }}
                          className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-gray-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#0070f3]" />
                      </label>
                    </div>
                  ))}
                </div>
              </Card>

              {/* Data export */}
              <Card>
                <SectionTitle>Data Export</SectionTitle>
                <p style={{ margin: '0 0 14px', fontSize: 13, color: 'var(--color-canvas-body, #50545c)', lineHeight: '18px' }}>
                  Download a copy of all data associated with your account in JSON format.
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
                  Permanently delete your account. Your name will appear as <strong style={{ color: '#0f1011' }}>"Deleted User"</strong> on any existing tasks or comments.
                </p>
                <button
                  className="btn-danger"
                  onClick={() => { setShowDeleteModal(true); setConfirmEmail(''); setDeleteError(''); }}
                >
                  Delete account
                </button>
              </Card>
            </>
          ) : (
            <>
              {/* ── API Keys Section (Phase 31) ── */}
              <Card>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <div>
                    <SectionTitle>API Keys</SectionTitle>
                    <p style={{ margin: 0, fontSize: 13, color: 'var(--color-canvas-mute, #888888)' }}>
                      Authenticate automated scripts, CI/CD pipelines, or custom integrations with TaskFlow.
                    </p>
                  </div>
                  <button
                    className="btn-primary"
                    onClick={() => {
                      setNewKeyName('');
                      setNewKeyExpiresDays('');
                      setKeyError('');
                      setShowCreateKeyModal(true);
                    }}
                    style={{ fontSize: 12, padding: '6px 12px' }}
                  >
                    + Create API Key
                  </button>
                </div>

                {loadingApiKeys ? (
                  <p style={{ fontSize: 13, color: 'var(--color-canvas-mute, #888888)' }}>Loading API keys…</p>
                ) : apiKeys.length === 0 ? (
                  <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--color-canvas-mute, #888888)', fontSize: 13 }}>
                    No active API keys found for this team workspace.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {apiKeys.map((k) => (
                      <div
                        key={k.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '12px 14px',
                          borderRadius: 8,
                          border: '1px solid var(--color-canvas-hairline, #ebebeb)',
                          background: 'var(--color-canvas-main, #fafafa)',
                          opacity: k.revokedAt ? 0.6 : 1,
                        }}
                      >
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-canvas-ink, #171717)' }}>
                              {k.name}
                            </span>
                            <span style={{ fontFamily: 'monospace', fontSize: 11, background: 'var(--color-canvas-card, #fff)', border: '1px solid var(--color-canvas-hairline, #ebebeb)', padding: '1px 6px', borderRadius: 4 }}>
                              {k.keyPrefix}
                            </span>
                            {k.revokedAt ? (
                              <span style={{ fontSize: 11, color: '#e5484d', background: 'rgba(229, 72, 77, 0.1)', padding: '1px 6px', borderRadius: 4 }}>
                                Revoked
                              </span>
                            ) : (
                              <span style={{ fontSize: 11, color: '#30a46c', background: 'rgba(48, 164, 108, 0.1)', padding: '1px 6px', borderRadius: 4 }}>
                                Active
                              </span>
                            )}
                          </div>
                          <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--color-canvas-mute, #888888)' }}>
                            Created by {k.user?.name || 'User'} on {new Date(k.createdAt).toLocaleDateString()}
                            {k.lastUsedAt && ` · Last used ${new Date(k.lastUsedAt).toLocaleDateString()}`}
                            {k.expiresAt && ` · Expires ${new Date(k.expiresAt).toLocaleDateString()}`}
                          </p>
                        </div>

                        {!k.revokedAt && (
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button
                              onClick={() => handleRotateApiKey(k.id)}
                              className="btn-secondary"
                              style={{ fontSize: 11, padding: '4px 8px' }}
                              title="Rotate secret key"
                            >
                              🔄 Rotate
                            </button>
                            <button
                              onClick={() => handleRevokeApiKey(k.id)}
                              className="btn-danger"
                              style={{ fontSize: 11, padding: '4px 8px' }}
                            >
                              Revoke
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </Card>

              {/* ── Webhooks Section (Phase 31) ── */}
              <Card>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <div>
                    <SectionTitle>Webhooks</SectionTitle>
                    <p style={{ margin: 0, fontSize: 13, color: 'var(--color-canvas-mute, #888888)' }}>
                      Receive real-time HTTP POST notifications when events happen in this team.
                    </p>
                  </div>
                  <button
                    className="btn-primary"
                    onClick={() => {
                      setEditingWebhookId(null);
                      setWebhookName('');
                      setWebhookUrl('');
                      setWebhookEvents(['task.created', 'task.updated', 'task.completed']);
                      setWebhookError('');
                      setShowWebhookModal(true);
                    }}
                    style={{ fontSize: 12, padding: '6px 12px' }}
                  >
                    + Add Webhook
                  </button>
                </div>

                {loadingWebhooks ? (
                  <p style={{ fontSize: 13, color: 'var(--color-canvas-mute, #888888)' }}>Loading webhooks…</p>
                ) : webhooks.length === 0 ? (
                  <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--color-canvas-mute, #888888)', fontSize: 13 }}>
                    No webhooks registered for this team yet.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {webhooks.map((w) => (
                      <div
                        key={w.id}
                        style={{
                          padding: '14px',
                          borderRadius: 8,
                          border: '1px solid var(--color-canvas-hairline, #ebebeb)',
                          background: 'var(--color-canvas-main, #fafafa)',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                              <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-canvas-ink, #171717)' }}>
                                {w.name}
                              </span>
                              <span style={{ fontSize: 11, color: w.isActive ? '#30a46c' : '#888', background: w.isActive ? 'rgba(48,164,108,0.1)' : 'rgba(0,0,0,0.05)', padding: '1px 6px', borderRadius: 4 }}>
                                {w.isActive ? 'Active' : 'Paused'}
                              </span>
                              <span style={{ fontSize: 11, color: 'var(--color-canvas-mute, #888888)' }}>
                                {w._count?.deliveries || 0} deliveries
                              </span>
                            </div>
                            <div style={{ fontFamily: 'monospace', fontSize: 12, color: '#0070f3', margin: '4px 0 6px', wordBreak: 'break-all' }}>
                              {w.url}
                            </div>
                            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                              {w.events.map((ev) => (
                                <span
                                  key={ev}
                                  style={{
                                    fontSize: 10,
                                    fontFamily: 'monospace',
                                    padding: '1px 6px',
                                    borderRadius: 4,
                                    background: 'var(--color-canvas-card, #fff)',
                                    border: '1px solid var(--color-canvas-hairline, #ebebeb)',
                                    color: 'var(--color-canvas-body, #50545c)',
                                  }}
                                >
                                  {ev}
                                </span>
                              ))}
                            </div>
                          </div>

                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                            <button
                              onClick={() => handleTestPingWebhook(w.id)}
                              disabled={pingStatus[w.id] === 'sending'}
                              className="btn-secondary"
                              style={{ fontSize: 11, padding: '4px 8px' }}
                            >
                              {pingStatus[w.id] ? `Ping: ${pingStatus[w.id]}` : '⚡ Ping test'}
                            </button>
                            <button
                              onClick={() => handleViewDeliveries(w)}
                              className="btn-secondary"
                              style={{ fontSize: 11, padding: '4px 8px' }}
                            >
                              📜 Logs
                            </button>
                            <button
                              onClick={() => handleDeleteWebhook(w.id)}
                              className="btn-danger"
                              style={{ fontSize: 11, padding: '4px 8px' }}
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </>
          )}
        </main>
      </div>

      {/* ── Create API Key Modal ── */}
      {showCreateKeyModal && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 100,
            background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(2px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
          }}
          onClick={(e) => { if (e.target === e.currentTarget && !createdSecretKey) setShowCreateKeyModal(false); }}
        >
          <div
            style={{
              background: 'var(--color-canvas-card, #fff)',
              borderRadius: 12,
              maxWidth: 480,
              width: '100%',
              border: '1px solid var(--color-canvas-hairline, #ebebeb)',
              boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
              padding: 24,
            }}
          >
            {createdSecretKey ? (
              <div>
                <h3 style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 600, color: '#30a46c' }}>
                  🔑 API Key Generated!
                </h3>
                <p style={{ margin: '0 0 14px', fontSize: 13, color: 'var(--color-canvas-mute, #888888)', lineHeight: '18px' }}>
                  Please copy and store your API secret key now. For security reasons, <strong>it will never be shown again</strong>.
                </p>

                <div
                  style={{
                    padding: '12px',
                    borderRadius: 8,
                    background: 'var(--color-canvas-main, #fafafa)',
                    border: '1px solid var(--color-canvas-hairline, #ebebeb)',
                    fontFamily: 'monospace',
                    fontSize: 12,
                    wordBreak: 'break-all',
                    marginBottom: 16,
                    color: 'var(--color-canvas-ink, #171717)',
                  }}
                >
                  {createdSecretKey}
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                  <button
                    className="btn-secondary"
                    onClick={() => {
                      navigator.clipboard.writeText(createdSecretKey);
                      setCopiedKey(true);
                      setTimeout(() => setCopiedKey(false), 2000);
                    }}
                  >
                    {copiedKey ? '✓ Copied!' : '📋 Copy to Clipboard'}
                  </button>
                  <button
                    className="btn-primary"
                    onClick={() => {
                      setCreatedSecretKey(null);
                      setShowCreateKeyModal(false);
                    }}
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleCreateApiKey} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: 'var(--color-canvas-ink, #171717)' }}>
                  Create New API Key
                </h3>

                {keyError && <div className="error-banner" style={{ fontSize: 13 }}>{keyError}</div>}

                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-canvas-body, #50545c)' }}>
                    Key Name / Identifier:
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. GitHub Actions CI, Zapier Integration"
                    value={newKeyName}
                    onChange={(e) => setNewKeyName(e.target.value)}
                    className="field-input"
                    autoFocus
                  />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-canvas-body, #50545c)' }}>
                    Expiration (optional):
                  </label>
                  <select
                    value={newKeyExpiresDays}
                    onChange={(e) => setNewKeyExpiresDays(e.target.value)}
                    className="field-input"
                  >
                    <option value="">Never expire</option>
                    <option value="30">30 days</option>
                    <option value="90">90 days</option>
                    <option value="365">1 year</option>
                  </select>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => setShowCreateKeyModal(false)}
                    disabled={creatingKey}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn-primary"
                    disabled={creatingKey || !newKeyName.trim()}
                  >
                    {creatingKey ? 'Generating…' : 'Generate Key'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* ── Create / Edit Webhook Modal ── */}
      {showWebhookModal && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 100,
            background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(2px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowWebhookModal(false); }}
        >
          <div
            style={{
              background: 'var(--color-canvas-card, #fff)',
              borderRadius: 12,
              maxWidth: 520,
              width: '100%',
              border: '1px solid var(--color-canvas-hairline, #ebebeb)',
              boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
              padding: 24,
            }}
          >
            <form onSubmit={handleSaveWebhook} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: 'var(--color-canvas-ink, #171717)' }}>
                {editingWebhookId ? 'Edit Webhook' : 'Register New Webhook'}
              </h3>

              {webhookError && <div className="error-banner" style={{ fontSize: 13 }}>{webhookError}</div>}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-canvas-body, #50545c)' }}>
                  Webhook Name:
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Discord Bot Feed, Slack Notifier"
                  value={webhookName}
                  onChange={(e) => setWebhookName(e.target.value)}
                  className="field-input"
                  autoFocus
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-canvas-body, #50545c)' }}>
                  Payload Destination URL:
                </label>
                <input
                  type="url"
                  required
                  placeholder="https://api.yourdomain.com/webhooks/taskflow"
                  value={webhookUrl}
                  onChange={(e) => setWebhookUrl(e.target.value)}
                  className="field-input"
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-canvas-body, #50545c)' }}>
                  Subscribed Events:
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                  {ALL_WEBHOOK_EVENTS.map((ev) => {
                    const isChecked = webhookEvents.includes(ev.id);
                    return (
                      <label
                        key={ev.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          fontSize: 12,
                          color: 'var(--color-canvas-ink, #171717)',
                          cursor: 'pointer',
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {
                            if (isChecked) {
                              setWebhookEvents(webhookEvents.filter((e) => e !== ev.id));
                            } else {
                              setWebhookEvents([...webhookEvents, ev.id]);
                            }
                          }}
                        />
                        <span>{ev.label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setShowWebhookModal(false)}
                  disabled={savingWebhook}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={savingWebhook || !webhookName.trim() || !webhookUrl.trim() || webhookEvents.length === 0}
                >
                  {savingWebhook ? 'Saving…' : 'Save Webhook'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Deliveries Log Drawer / Modal ── */}
      {viewingDeliveriesWebhook && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 100,
            background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(2px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setViewingDeliveriesWebhook(null); }}
        >
          <div
            style={{
              background: 'var(--color-canvas-card, #fff)',
              borderRadius: 12,
              maxWidth: 680,
              width: '100%',
              maxHeight: '80vh',
              display: 'flex',
              flexDirection: 'column',
              border: '1px solid var(--color-canvas-hairline, #ebebeb)',
              boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
              overflow: 'hidden',
            }}
          >
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--color-canvas-hairline, #ebebeb)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: 'var(--color-canvas-ink, #171717)' }}>
                  Delivery Logs: {viewingDeliveriesWebhook.name}
                </h3>
                <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--color-canvas-mute, #888888)' }}>
                  Recent HTTP delivery events and responses
                </p>
              </div>
              <button
                className="btn-secondary"
                onClick={() => setViewingDeliveriesWebhook(null)}
                style={{ fontSize: 12, padding: '4px 8px' }}
              >
                ✕ Close
              </button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
              {loadingDeliveries ? (
                <p style={{ fontSize: 13, color: 'var(--color-canvas-mute, #888888)' }}>Loading logs…</p>
              ) : deliveries.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--color-canvas-mute, #888888)', fontSize: 13 }}>
                  No delivery attempts recorded yet for this webhook.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {deliveries.map((del) => (
                    <div
                      key={del.id}
                      style={{
                        padding: '10px 12px',
                        borderRadius: 6,
                        border: '1px solid var(--color-canvas-hairline, #ebebeb)',
                        background: 'var(--color-canvas-main, #fafafa)',
                        fontSize: 12,
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                        <span style={{ fontWeight: 600, fontFamily: 'monospace', color: 'var(--color-canvas-ink, #171717)' }}>
                          {del.event}
                        </span>
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 600,
                            color: del.status === 'success' ? '#30a46c' : '#e5484d',
                          }}
                        >
                          {del.statusCode ? `HTTP ${del.statusCode}` : 'Failed'} ({del.durationMs || 0}ms)
                        </span>
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--color-canvas-mute, #888888)' }}>
                        {new Date(del.createdAt).toLocaleString()}
                        {del.error && ` · Error: ${del.error}`}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
