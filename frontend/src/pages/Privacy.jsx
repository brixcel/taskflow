import { Link } from 'react-router-dom';
import ThemeToggle from '../components/ThemeToggle';
import SyncTaskLogo from '../components/SyncTaskLogo';

export default function Privacy() {
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
            <Link to="/terms" style={{ fontSize: 13, color: 'var(--color-canvas-mute, #8a8f98)', textDecoration: 'none', fontWeight: 500 }}>
              Terms of Service
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
            Data Protection & Rights
          </p>
          <h1 style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.8px', margin: '0 0 8px', color: 'var(--color-canvas-ink, #0f1011)' }}>
            Privacy Policy
          </h1>
          <p style={{ fontSize: 13, color: 'var(--color-canvas-mute, #8a8f98)', margin: '0 0 32px', paddingBottom: 24, borderBottom: '1px solid var(--color-canvas-hairline, #f0f1f3)' }}>
            Last updated: August 17, 2026
          </p>

          <section style={{ display: 'flex', flexDirection: 'column', gap: 28, fontSize: 14, color: 'var(--color-canvas-body, #3d4148)', lineHeight: '22px' }}>
            <div>
              <h2 style={{ fontSize: 16, fontWeight: 600, color: 'var(--color-canvas-ink, #0f1011)', margin: '0 0 10px' }}>1. Information We Collect</h2>
              <p style={{ margin: '0 0 8px' }}>
                We collect personal information necessary to deliver SyncTask's multi-tenant project management capabilities:
              </p>
              <ul style={{ margin: 0, paddingLeft: 20 }}>
                <li><strong>Account Credentials:</strong> Full name, email address, and cryptographically hashed passwords (salted bcrypt). We never store plaintext passwords.</li>
                <li><strong>Workspace Content:</strong> Tasks, task descriptions, comments, status transitions, and team assignments authored by you.</li>
                <li><strong>Audit & Activity Logs:</strong> IP address, user agent, timestamps, and workspace activity log events required for audit logging and rate limiting.</li>
              </ul>
            </div>

            <div>
              <h2 style={{ fontSize: 16, fontWeight: 600, color: 'var(--color-canvas-ink, #0f1011)', margin: '0 0 10px' }}>2. How We Use Your Information</h2>
              <p style={{ margin: '0 0 8px' }}>We process your data strictly to operate and secure SyncTask:</p>
              <ul style={{ margin: 0, paddingLeft: 20 }}>
                <li>Authenticating user access and maintaining JWT session security.</li>
                <li>Scoping workspace resources to prevent cross-tenant data access.</li>
                <li>Sending essential auth notifications (password resets and email verification links).</li>
                <li>Protecting service stability via rate limiting and automated error monitoring.</li>
              </ul>
            </div>

            <div>
              <h2 style={{ fontSize: 16, fontWeight: 600, color: 'var(--color-canvas-ink, #0f1011)', margin: '0 0 10px' }}>3. Data Sharing & Multi-Tenant Boundaries</h2>
              <p style={{ margin: 0 }}>
                SyncTask does not sell, rent, or trade your personal data to third parties. Data is visible only to authorized members of your team workspaces. Backend database queries are strictly enforced by team scoping (`teamId`) to ensure complete isolation.
              </p>
            </div>

            <div style={{ background: 'var(--color-banner-success-bg, #f8faf9)', border: '1px solid var(--color-banner-success-border, #dbe6e0)', borderRadius: 8, padding: 20 }}>
              <h2 style={{ fontSize: 16, fontWeight: 600, color: 'var(--color-banner-success-fg, #165c36)', margin: '0 0 10px' }}>4. GDPR Rights: Export & Account Deletion</h2>
              <p style={{ margin: '0 0 10px', color: 'var(--color-canvas-ink, #273b30)' }}>
                In compliance with modern privacy standards (GDPR-Lite framework built into SyncTask), you retain full rights over your data:
              </p>
              <ul style={{ margin: 0, paddingLeft: 20, color: 'var(--color-canvas-ink, #273b30)' }}>
                <li style={{ marginBottom: 6 }}>
                  <strong>Data Export (`GET /users/me/export`):</strong> You can download a complete, portable JSON archive of your personal profile, team memberships, created/assigned tasks, comments, and activity history directly from your Account Settings.
                </li>
                <li>
                  <strong>Account Deletion (`DELETE /users/me`):</strong> You may permanently delete your account at any time. To protect team workflow continuity, your name is anonymized to <em>"Deleted User"</em>, your email and password hashes are permanently purged, and unassigned tasks remain accessible to teammates without breaking foreign key integrity.
                </li>
              </ul>
            </div>

            <div>
              <h2 style={{ fontSize: 16, fontWeight: 600, color: 'var(--color-canvas-ink, #0f1011)', margin: '0 0 10px' }}>5. Security Standards</h2>
              <p style={{ margin: 0 }}>
                We implement robust security controls including HTTP security headers (Helmet), CORS restriction, strict input validation (Zod), rate limiting against brute-force attacks, and automatic scrubbing of sensitive headers (JWT, passwords) before error logging.
              </p>
            </div>

            <div>
              <h2 style={{ fontSize: 16, fontWeight: 600, color: 'var(--color-canvas-ink, #0f1011)', margin: '0 0 10px' }}>6. Contact Us</h2>
              <p style={{ margin: 0 }}>
                If you have questions about your privacy rights or this policy, please reach out to our privacy officer at <a href="mailto:privacy@synctask.local" style={{ color: 'var(--color-canvas-ink, #0f1011)', textDecoration: 'underline' }}>privacy@synctask.local</a>.
              </p>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
