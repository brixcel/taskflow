import { useState, useEffect } from 'react';
import { RefreshCw, Settings, Check, Link, ExternalLink } from 'lucide-react';
import { GithubIcon } from './ProjectIcon';
import { API_BASE } from '../api/config';

export default function ProjectGitHubView({ projectId, teamId, token, project, onSelectTask }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Integration state
  const [connected, setConnected] = useState(false);
  const [integration, setIntegration] = useState(null);
  const [activities, setActivities] = useState({ links: [], events: [] });
  const [activityFilter, setActivityFilter] = useState('all'); // all | pull_request | commit | issue

  // Form / Setup State
  const [repoOwner, setRepoOwner] = useState('');
  const [repoName, setRepoName] = useState('');
  const [autoCloseTasks, setAutoCloseTasks] = useState(true);
  const [autoCreateTasksOnIssue, setAutoCreateTasksOnIssue] = useState(false);
  const [defaultIssueStatus, setDefaultIssueStatus] = useState('todo');
  const [syncBranchesInput, setSyncBranchesInput] = useState('main, master');

  // UI state
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showDisconnectModal, setShowDisconnectModal] = useState(false);
  const [copiedField, setCopiedField] = useState(null);
  const [showSecret, setShowSecret] = useState(false);

  const fetchIntegration = async () => {
    if (!projectId || !token) return;
    try {
      setLoading(true);
      setError('');
      const res = await fetch(`${API_BASE}/projects/${projectId}/github`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'X-Team-Id': teamId,
        },
      });

      if (!res.ok) throw new Error('Failed to load GitHub integration');
      const data = await res.json();
      setConnected(data.connected);
      setIntegration(data.integration);

      if (data.connected && data.integration) {
        setRepoOwner(data.integration.repoOwner || '');
        setRepoName(data.integration.repoName || '');
        setAutoCloseTasks(data.integration.autoCloseTasks);
        setAutoCreateTasksOnIssue(data.integration.autoCreateTasksOnIssue);
        setDefaultIssueStatus(data.integration.defaultIssueStatus || 'todo');
        setSyncBranchesInput(
          Array.isArray(data.integration.syncBranches)
            ? data.integration.syncBranches.join(', ')
            : 'main, master'
        );

        // Also fetch activities
        fetchActivities();
      }
    } catch (err) {
      setError(err.message || 'Error fetching GitHub integration');
    } finally {
      setLoading(false);
    }
  };

  const fetchActivities = async () => {
    try {
      const res = await fetch(`${API_BASE}/projects/${projectId}/github/activities`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'X-Team-Id': teamId,
        },
      });
      if (res.ok) {
        const data = await res.json();
        setActivities(data);
      }
    } catch (e) {
      console.error('Failed to load GitHub activities', e);
    }
  };

  useEffect(() => {
    fetchIntegration();
  }, [projectId, teamId, token]);

  const copyToClipboard = (text, fieldName) => {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldName);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const handleConnect = async (e) => {
    e.preventDefault();
    if (!repoOwner.trim() || !repoName.trim()) {
      setError('Both repository owner and name are required.');
      return;
    }

    setSaving(true);
    setError('');
    setSuccessMsg('');

    try {
      const branches = syncBranchesInput
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

      const res = await fetch(`${API_BASE}/projects/${projectId}/github`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'X-Team-Id': teamId,
        },
        body: JSON.stringify({
          repoOwner: repoOwner.trim(),
          repoName: repoName.trim(),
          autoCloseTasks,
          autoCreateTasksOnIssue,
          defaultIssueStatus,
          syncBranches: branches.length > 0 ? branches : ['main'],
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to connect repository');

      setConnected(true);
      setIntegration(data.integration);
      setSuccessMsg('GitHub repository connected successfully! Set up the webhook below to start receiving real-time events.');
      fetchActivities();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateSettings = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');

    try {
      const branches = syncBranchesInput
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

      const res = await fetch(`${API_BASE}/projects/${projectId}/github`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'X-Team-Id': teamId,
        },
        body: JSON.stringify({
          repoOwner: repoOwner.trim(),
          repoName: repoName.trim(),
          autoCloseTasks,
          autoCreateTasksOnIssue,
          defaultIssueStatus,
          syncBranches: branches,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update settings');

      setIntegration(data.integration);
      setShowSettingsModal(false);
      setSuccessMsg('GitHub automation settings updated.');
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      const res = await fetch(`${API_BASE}/projects/${projectId}/github/sync`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'X-Team-Id': teamId,
        },
      });
      if (res.ok) {
        setSuccessMsg('Repository connection verified and activity synced.');
        fetchActivities();
        setTimeout(() => setSuccessMsg(''), 4000);
      }
    } catch (e) {
      setError('Failed to trigger sync');
    } finally {
      setSyncing(false);
    }
  };

  const handleDisconnect = async () => {
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/projects/${projectId}/github`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
          'X-Team-Id': teamId,
        },
      });

      if (!res.ok) throw new Error('Failed to disconnect');
      setConnected(false);
      setIntegration(null);
      setActivities({ links: [], events: [] });
      setShowDisconnectModal(false);
      setSuccessMsg('GitHub integration disconnected.');
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: 'var(--color-canvas-mute, #8a8f98)' }}>
        <p>Loading GitHub integration details...</p>
      </div>
    );
  }

  const filteredLinks = (activities.links || []).filter((l) => {
    if (activityFilter === 'all') return true;
    return l.resourceType === activityFilter;
  });

  return (
    <div style={{ padding: '0 28px 40px 28px', maxWidth: 1200, margin: '0 auto' }}>
      {/* Alert Messages */}
      {error && (
        <div
          style={{
            padding: '12px 16px',
            marginBottom: 20,
            borderRadius: 8,
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            color: '#ef4444',
            fontSize: 13,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span>{error}</span>
          <button
            onClick={() => setError('')}
            style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 16 }}
          >
            ×
          </button>
        </div>
      )}

      {successMsg && (
        <div
          style={{
            padding: '12px 16px',
            marginBottom: 20,
            borderRadius: 8,
            backgroundColor: 'rgba(16, 185, 129, 0.1)',
            border: '1px solid rgba(16, 185, 129, 0.3)',
            color: '#10b981',
            fontSize: 13,
          }}
        >
          {successMsg}
        </div>
      )}

      {!connected ? (
        /* ─── Disconnected / Setup Onboarding ────────────────────────────────── */
        <div
          style={{
            background: 'var(--color-canvas-card, #ffffff)',
            borderRadius: 12,
            border: '1px solid var(--color-canvas-hairline, #ebebeb)',
            padding: '36px 32px',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: 12,
                background: '#24292f',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 26,
              }}
            >
              <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
              </svg>
            </div>
            <div>
              <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0, color: 'var(--color-canvas-ink, #0f1011)' }}>
                Connect GitHub Repository
              </h2>
              <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--color-canvas-mute, #8a8f98)' }}>
                Link your code repository to <strong>{project?.name || 'this project'}</strong> to automate task workflows on PR merges and commits.
              </p>
            </div>
          </div>

          <form onSubmit={handleConnect} style={{ maxWidth: 640 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6, color: 'var(--color-canvas-ink, #0f1011)' }}>
                  GitHub Owner / Org *
                </label>
                <input
                  type="text"
                  placeholder="e.g. brixcel"
                  value={repoOwner}
                  onChange={(e) => setRepoOwner(e.target.value)}
                  required
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 6,
                    border: '1px solid var(--color-canvas-hairline, #ebebeb)',
                    background: 'var(--color-canvas-subtle, #f9fafa)',
                    fontSize: 13,
                  }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6, color: 'var(--color-canvas-ink, #0f1011)' }}>
                  Repository Name *
                </label>
                <input
                  type="text"
                  placeholder="e.g. taskflow"
                  value={repoName}
                  onChange={(e) => setRepoName(e.target.value)}
                  required
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 6,
                    border: '1px solid var(--color-canvas-hairline, #ebebeb)',
                    background: 'var(--color-canvas-subtle, #f9fafa)',
                    fontSize: 13,
                  }}
                />
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6, color: 'var(--color-canvas-ink, #0f1011)' }}>
                Sync Branches (comma-separated)
              </label>
              <input
                type="text"
                placeholder="main, master, develop"
                value={syncBranchesInput}
                onChange={(e) => setSyncBranchesInput(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: 6,
                  border: '1px solid var(--color-canvas-hairline, #ebebeb)',
                  background: 'var(--color-canvas-subtle, #f9fafa)',
                  fontSize: 13,
                }}
              />
            </div>

            {/* Automation Options */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 24, padding: 16, background: 'var(--color-canvas-subtle, #f9fafa)', borderRadius: 8 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={autoCloseTasks}
                  onChange={(e) => setAutoCloseTasks(e.target.checked)}
                />
                <span>
                  <strong>Auto-complete tasks</strong> when linked Pull Request is merged or commit message includes <code>Fixes #123</code> / <code>Closes TF-123</code>.
                </span>
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={autoCreateTasksOnIssue}
                  onChange={(e) => setAutoCreateTasksOnIssue(e.target.checked)}
                />
                <span>
                  <strong>Auto-create tasks</strong> when new GitHub Issues are opened in this repository.
                </span>
              </label>
            </div>

            <button
              type="submit"
              disabled={saving}
              className="btn-primary"
              style={{ padding: '10px 20px', fontSize: 13, fontWeight: 600 }}
            >
              {saving ? 'Connecting...' : 'Connect GitHub Repository'}
            </button>
          </form>
        </div>
      ) : (
        /* ─── Connected Dashboard ────────────────────────────────────────────── */
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Top Status & Controls Bar */}
          <div
            style={{
              background: 'var(--color-canvas-card, #ffffff)',
              borderRadius: 12,
              border: '1px solid var(--color-canvas-hairline, #ebebeb)',
              padding: '24px 28px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 16,
              boxShadow: '0 1px 4px rgba(0,0,0,0.03)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 10,
                  background: '#24292f',
                  color: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 22,
                }}
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
                </svg>
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <a
                    href={`https://github.com/${integration.repoFullName}`}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      fontSize: 18,
                      fontWeight: 700,
                      color: 'var(--color-canvas-ink, #0f1011)',
                      textDecoration: 'none',
                    }}
                  >
                    {integration.repoFullName} ↗
                  </a>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      padding: '2px 8px',
                      borderRadius: 12,
                      background: integration.isActive ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                      color: integration.isActive ? '#10b981' : '#ef4444',
                    }}
                  >
                    {integration.isActive ? '● Active' : '○ Inactive'}
                  </span>
                </div>
                <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--color-canvas-mute, #8a8f98)' }}>
                  Connected by {integration.createdBy?.name || 'Admin'}
                  {integration.lastSyncedAt && ` · Last event synced: ${new Date(integration.lastSyncedAt).toLocaleString()}`}
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={handleSync}
                disabled={syncing}
                className="btn-secondary"
                style={{ fontSize: 12, padding: '7px 12px', display: 'flex', alignItems: 'center', gap: 6 }}
              >
                <RefreshCw size={13} className={syncing ? 'animate-spin' : ''} />
                {syncing ? 'Verifying...' : 'Verify Connection'}
              </button>

              <button
                type="button"
                onClick={() => setShowSettingsModal(true)}
                className="btn-secondary"
                style={{ fontSize: 12, padding: '7px 12px', display: 'flex', alignItems: 'center', gap: 6 }}
              >
                <Settings size={13} />
                Settings
              </button>

              <button
                type="button"
                onClick={() => setShowDisconnectModal(true)}
                className="btn-danger"
                style={{ fontSize: 12, padding: '7px 12px' }}
              >
                Disconnect
              </button>
            </div>
          </div>

          {/* Webhook Configuration Setup Box */}
          <div
            style={{
              background: 'var(--color-canvas-card, #ffffff)',
              borderRadius: 12,
              border: '1px solid var(--color-canvas-hairline, #ebebeb)',
              padding: '22px 28px',
            }}
          >
            <h3 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 8px 0', color: 'var(--color-canvas-ink, #0f1011)' }}>
              GitHub Webhook Setup
            </h3>
            <p style={{ margin: '0 0 16px 0', fontSize: 13, color: 'var(--color-canvas-mute, #8a8f98)' }}>
              To receive live PR merges, commits, and issues, add this webhook endpoint in your GitHub repo under <strong>Settings &gt; Webhooks &gt; Add Webhook</strong>.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
              {/* Payload URL */}
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--color-canvas-mute, #8a8f98)', marginBottom: 4 }}>
                  PAYLOAD URL (Content type: <code>application/json</code>)
                </label>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input
                    type="text"
                    readOnly
                    value={integration.webhookUrl || ''}
                    style={{
                      flex: 1,
                      padding: '6px 10px',
                      borderRadius: 6,
                      fontSize: 12,
                      fontFamily: 'monospace',
                      background: 'var(--color-canvas-subtle, #f9fafa)',
                      border: '1px solid var(--color-canvas-hairline, #ebebeb)',
                    }}
                  />
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => copyToClipboard(integration.webhookUrl, 'url')}
                    style={{ fontSize: 11, padding: '6px 10px', display: 'flex', alignItems: 'center', gap: 4 }}
                  >
                    {copiedField === 'url' ? <><Check size={11} /> Copied</> : 'Copy'}
                  </button>
                </div>
              </div>

              {/* Webhook Secret */}
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--color-canvas-mute, #8a8f98)', marginBottom: 4 }}>
                  SECRET TOKEN (HMAC-SHA256 signature verification)
                </label>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input
                    type={showSecret ? 'text' : 'password'}
                    readOnly
                    value={integration.webhookSecret || ''}
                    style={{
                      flex: 1,
                      padding: '6px 10px',
                      borderRadius: 6,
                      fontSize: 12,
                      fontFamily: 'monospace',
                      background: 'var(--color-canvas-subtle, #f9fafa)',
                      border: '1px solid var(--color-canvas-hairline, #ebebeb)',
                    }}
                  />
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => setShowSecret(!showSecret)}
                    style={{ fontSize: 11, padding: '6px 10px' }}
                  >
                    {showSecret ? 'Hide' : 'Show'}
                  </button>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => copyToClipboard(integration.webhookSecret, 'secret')}
                    style={{ fontSize: 11, padding: '6px 10px', display: 'flex', alignItems: 'center', gap: 4 }}
                  >
                    {copiedField === 'secret' ? <><Check size={11} /> Copied</> : 'Copy'}
                  </button>
                </div>
              </div>
            </div>
          </div>


          {/* Activity Feed Section */}
          <div
            style={{
              background: 'var(--color-canvas-card, #ffffff)',
              borderRadius: 12,
              border: '1px solid var(--color-canvas-hairline, #ebebeb)',
              padding: '24px 28px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18, flexWrap: 'wrap', gap: 10 }}>
              <div>
                <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: 'var(--color-canvas-ink, #0f1011)' }}>
                  GitHub Activity & Traceability
                </h3>
                <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--color-canvas-mute, #8a8f98)' }}>
                  Trace pull requests, commits, and issues linked to TaskFlow tasks.
                </p>
              </div>

              {/* Filter Tabs */}
              <div
                style={{
                  display: 'inline-flex',
                  borderRadius: 6,
                  padding: 2,
                  background: 'var(--color-canvas-subtle, #f9fafa)',
                  border: '1px solid var(--color-canvas-hairline, #ebebeb)',
                }}
              >
                {['all', 'pull_request', 'commit', 'issue'].map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setActivityFilter(type)}
                    style={{
                      padding: '4px 10px',
                      borderRadius: 4,
                      fontSize: 11,
                      fontWeight: 600,
                      border: 'none',
                      cursor: 'pointer',
                      background: activityFilter === type ? 'var(--color-canvas-card, #ffffff)' : 'transparent',
                      color: activityFilter === type ? 'var(--color-canvas-ink, #0f1011)' : 'var(--color-canvas-mute, #8a8f98)',
                      boxShadow: activityFilter === type ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                      textTransform: 'capitalize',
                    }}
                  >
                    {type === 'pull_request' ? 'Pull Requests' : type === 'commit' ? 'Commits' : type === 'issue' ? 'Issues' : 'All'}
                  </button>
                ))}
              </div>
            </div>

            {filteredLinks.length === 0 ? (
              <div style={{ padding: '36px 0', textAlign: 'center', color: 'var(--color-canvas-mute, #8a8f98)', fontSize: 13 }}>
                No GitHub activity recorded yet. Incoming pull requests and commits will appear here.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {filteredLinks.map((item) => {
                  const isMerged = item.status === 'merged';
                  const isOpen = item.status === 'open';
                  const isCommit = item.resourceType === 'commit';

                  const badgeColor = isMerged
                    ? { bg: '#8250df18', text: '#8250df', label: 'Merged' }
                    : isOpen
                    ? { bg: '#2da44e18', text: '#2da44e', label: 'Open' }
                    : isCommit
                    ? { bg: '#0969da18', text: '#0969da', label: 'Committed' }
                    : { bg: '#cf222e18', text: '#cf222e', label: 'Closed' };

                  return (
                    <div
                      key={item.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '12px 16px',
                        borderRadius: 8,
                        background: 'var(--color-canvas-subtle, #f9fafa)',
                        border: '1px solid var(--color-canvas-hairline, #ebebeb)',
                        gap: 12,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, minWidth: 0, flex: 1 }}>
                        <span
                          style={{
                            padding: '3px 8px',
                            borderRadius: 4,
                            fontSize: 11,
                            fontWeight: 700,
                            background: badgeColor.bg,
                            color: badgeColor.text,
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {item.resourceRef || badgeColor.label}
                        </span>

                        <div style={{ minWidth: 0 }}>
                          <a
                            href={item.url}
                            target="_blank"
                            rel="noreferrer"
                            style={{
                              fontSize: 13,
                              fontWeight: 600,
                              color: 'var(--color-canvas-ink, #0f1011)',
                              textDecoration: 'none',
                              display: 'block',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {item.title} ↗
                          </a>
                          <p style={{ margin: '2px 0 0', fontSize: 11, color: 'var(--color-canvas-mute, #8a8f98)' }}>
                            by @{item.author || 'contributor'} · {new Date(item.createdAt).toLocaleString()}
                          </p>
                        </div>
                      </div>

                      {/* Linked Task Indicator */}
                      {item.task && (
                        <button
                          type="button"
                          onClick={() => onSelectTask && onSelectTask(item.task.id)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                            padding: '4px 10px',
                            borderRadius: 6,
                            fontSize: 11,
                            fontWeight: 500,
                            background: 'var(--color-canvas-card, #ffffff)',
                            border: '1px solid var(--color-canvas-hairline, #ebebeb)',
                            color: '#0070f3',
                            cursor: 'pointer',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          <Link size={11} /> Task: {item.task.title.substring(0, 24)}…
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Settings Modal */}
      {showSettingsModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: 20,
          }}
        >
          <div
            style={{
              background: 'var(--color-canvas-card, #ffffff)',
              borderRadius: 12,
              padding: 28,
              maxWidth: 520,
              width: '100%',
              boxShadow: '0 8px 32px rgba(0,0,0,0.16)',
            }}
          >
            <h3 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 16px 0' }}>
              GitHub Automation Settings
            </h3>

            <form onSubmit={handleUpdateSettings}>
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
                  Branches to Sync
                </label>
                <input
                  type="text"
                  value={syncBranchesInput}
                  onChange={(e) => setSyncBranchesInput(e.target.value)}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #ebebeb', fontSize: 13 }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={autoCloseTasks}
                    onChange={(e) => setAutoCloseTasks(e.target.checked)}
                  />
                  <span>Auto-close tasks on PR merge / commit keywords</span>
                </label>

                <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={autoCreateTasksOnIssue}
                    onChange={(e) => setAutoCreateTasksOnIssue(e.target.checked)}
                  />
                  <span>Auto-create tasks from new GitHub Issues</span>
                </label>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button type="button" onClick={() => setShowSettingsModal(false)} className="btn-secondary">
                  Cancel
                </button>
                <button type="submit" disabled={saving} className="btn-primary">
                  {saving ? 'Saving...' : 'Save Settings'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Disconnect Modal */}
      {showDisconnectModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: 20,
          }}
        >
          <div
            style={{
              background: 'var(--color-canvas-card, #ffffff)',
              borderRadius: 12,
              padding: 28,
              maxWidth: 440,
              width: '100%',
            }}
          >
            <h3 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 12px 0', color: '#ef4444' }}>
              Disconnect GitHub Repository?
            </h3>
            <p style={{ fontSize: 13, color: 'var(--color-canvas-mute, #8a8f98)', margin: '0 0 20px 0' }}>
              This will stop incoming webhooks and disconnect <strong>{integration?.repoFullName}</strong> from this project. Existing tasks will not be deleted.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button type="button" onClick={() => setShowDisconnectModal(false)} className="btn-secondary">
                Cancel
              </button>
              <button type="button" onClick={handleDisconnect} disabled={saving} className="btn-danger">
                {saving ? 'Disconnecting...' : 'Yes, Disconnect'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
