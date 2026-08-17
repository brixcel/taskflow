import { Link } from 'react-router-dom';
import ThemeToggle from '../components/ThemeToggle';
import SyncTaskLogo from '../components/SyncTaskLogo';

export default function Terms() {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-canvas-bg, #fafafa)', color: 'var(--color-canvas-ink, #0f1011)', fontFamily: 'Inter, system-ui, sans-serif' }}>
      {/* Header Bar */}
      <header style={{
        borderBottom: '1px solid var(--color-canvas-hairline, #e8eaec)', background: 'var(--color-canvas-card, #ffffff)',
        position: 'sticky', top: 0, zIndex: 10, padding: '12px 24px'
      }}>
        <div style={{ maxWidth: 860, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Link to="/" style={{ textDecoration: 'none' }}>
            <SyncTaskLogo size={26} />
          </Link>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
            <ThemeToggle variant="icon" size="sm" />
            <Link to="/privacy" style={{ fontSize: 13, color: 'var(--color-canvas-mute, #8a8f98)', textDecoration: 'none', fontWeight: 500 }}>
              Privacy Policy
            </Link>
            <Link to="/" style={{
              fontSize: 13, color: 'var(--color-canvas-ink, #0f1011)', background: 'var(--color-canvas-subtle, #f0f1f3)', padding: '6px 14px',
              borderRadius: 6, textDecoration: 'none', fontWeight: 500
            }}>
              Back to SyncTask
            </Link>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main style={{ maxWidth: 860, margin: '40px auto 80px', padding: '0 24px' }}>
        <div style={{
          background: 'var(--color-canvas-card, #ffffff)', border: '1px solid var(--color-canvas-hairline, #e8eaec)', borderRadius: 12,
          padding: '36px 40px', boxShadow: '0 1px 3px var(--color-modal-backdrop, rgba(0,0,0,0.02))'
        }}>
          <p style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.6px', color: 'var(--color-canvas-mute, #8a8f98)', margin: '0 0 8px' }}>
            Legal Terms & Conditions
          </p>
          <h1 style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.8px', margin: '0 0 8px', color: 'var(--color-canvas-ink, #0f1011)' }}>
            Terms of Service
          </h1>
          <p style={{ fontSize: 13, color: 'var(--color-canvas-mute, #8a8f98)', margin: '0 0 32px', paddingBottom: 24, borderBottom: '1px solid var(--color-canvas-hairline, #f0f1f3)' }}>
            Last updated: August 17, 2026
          </p>

          <section style={{ display: 'flex', flexDirection: 'column', gap: 28, fontSize: 14, color: 'var(--color-canvas-body, #3d4148)', lineHeight: '22px' }}>
            <div>
              <h2 style={{ fontSize: 16, fontWeight: 600, color: 'var(--color-canvas-ink, #0f1011)', margin: '0 0 10px' }}>1. Acceptance of Terms</h2>
              <p style={{ margin: 0 }}>
                By creating an account, accessing, or using SyncTask, you agree to be bound by these Terms of Service.
                If you do not agree to these terms, you must not create an account or use the service.
              </p>
            </div>

            <div>
              <h2 style={{ fontSize: 16, fontWeight: 600, color: 'var(--color-canvas-ink, #0f1011)', margin: '0 0 10px' }}>2. Account Registration & Responsibilities</h2>
              <p style={{ margin: '0 0 8px' }}>
                To use SyncTask, you must register with a valid email address and secure password. You are responsible for maintaining the confidentiality of your account credentials and for all activities that occur under your account.
              </p>
              <ul style={{ margin: 0, paddingLeft: 20 }}>
                <li>You must provide accurate and complete registration information.</li>
                <li>You may not share account credentials across multiple individuals.</li>
                <li>You must notify SyncTask immediately of any unauthorized access to your account.</li>
              </ul>
            </div>

            <div>
              <h2 style={{ fontSize: 16, fontWeight: 600, color: 'var(--color-canvas-ink, #0f1011)', margin: '0 0 10px' }}>3. Multi-Tenant Workspaces & Content</h2>
              <p style={{ margin: 0 }}>
                SyncTask operates as a multi-tenant platform with isolated team workspaces. Tasks, comments, and project data authored within a workspace belong to that workspace environment. Workspace owners and administrators hold administrative authority over team memberships and permissions within their respective teams.
              </p>
            </div>

            <div>
              <h2 style={{ fontSize: 16, fontWeight: 600, color: 'var(--color-canvas-ink, #0f1011)', margin: '0 0 10px' }}>4. Acceptable Use & Prohibited Actions</h2>
              <p style={{ margin: '0 0 8px' }}>You agree not to use SyncTask to:</p>
              <ul style={{ margin: 0, paddingLeft: 20 }}>
                <li>Violate any applicable laws, regulations, or third-party rights.</li>
                <li>Upload malicious code, viruses, or harmful payload attachments.</li>
                <li>Attempt unauthorized access to other team workspaces or backend services.</li>
                <li>Execute automated vulnerability scanning or denial-of-service attempts.</li>
              </ul>
            </div>

            <div>
              <h2 style={{ fontSize: 16, fontWeight: 600, color: 'var(--color-canvas-ink, #0f1011)', margin: '0 0 10px' }}>5. Service Availability & Modification</h2>
              <p style={{ margin: 0 }}>
                SyncTask strives for high availability and performance. However, services are provided on an "as is" and "as available" basis. We reserve the right to modify, update, or temporarily suspend features for maintenance or operational enhancements.
              </p>
            </div>

            <div>
              <h2 style={{ fontSize: 16, fontWeight: 600, color: 'var(--color-canvas-ink, #0f1011)', margin: '0 0 10px' }}>6. Account Termination & Data Rights</h2>
              <p style={{ margin: 0 }}>
                You may request account deletion at any time via your Account Settings. Account deletion anonymizes your profile data and removes authentication tokens, while preserving workspace task history under an anonymized author identity ("Deleted User") so team workflow continuity is preserved. You also have the right to export your complete data payload at any time prior to account deletion.
              </p>
            </div>

            <div>
              <h2 style={{ fontSize: 16, fontWeight: 600, color: 'var(--color-canvas-ink, #0f1011)', margin: '0 0 10px' }}>7. Contact & Support</h2>
              <p style={{ margin: 0 }}>
                For legal inquiries or terms clarification, please contact our support team at <a href="mailto:support@synctask.local" style={{ color: 'var(--color-canvas-ink, #0f1011)', textDecoration: 'underline' }}>support@synctask.local</a>.
              </p>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
