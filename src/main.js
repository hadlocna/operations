import './style.css'

const app = document.querySelector('#app')

const renderDashboard = () => {
  app.innerHTML = `
    <header class="dashboard-header">
      <div class="dashboard-title">
        <h1>Operations Intelligence</h1>
        <p>Real-time autonomous systems monitoring</p>
      </div>
      <div class="header-actions">
        <div class="status-indicator">
          <span class="pulse"></span>
          System Active
        </div>
      </div>
    </header>

    <main class="grid-layout">
      <!-- Metric Cards -->
      <div class="card animate-in" style="grid-column: span 3;">
        <div class="card-title">Active Processes</div>
        <div class="card-value">128</div>
        <div class="card-trend trend-up">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"></polyline><polyline points="17 6 23 6 23 12"></polyline></svg>
          +12% vs last hour
        </div>
      </div>

      <div class="card animate-in" style="grid-column: span 3; animation-delay: 0.1s;">
        <div class="card-title">System Latency</div>
        <div class="card-value">14ms</div>
        <div class="card-trend trend-up">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"></polyline><polyline points="17 6 23 6 23 12"></polyline></svg>
          -2ms improvement
        </div>
      </div>

      <div class="card animate-in" style="grid-column: span 3; animation-delay: 0.2s;">
        <div class="card-title">Error Rate</div>
        <div class="card-value">0.02%</div>
        <div class="card-trend trend-down">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 18 13.5 8.5 8.5 13.5 1 6"></polyline><polyline points="17 18 23 18 23 12"></polyline></svg>
          +0.01% increase
        </div>
      </div>

      <div class="card animate-in" style="grid-column: span 3; animation-delay: 0.3s;">
        <div class="card-title">Uptime</div>
        <div class="card-value">99.99%</div>
        <div class="card-trend trend-up">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"></polyline><polyline points="17 6 23 6 23 12"></polyline></svg>
          Stable
        </div>
      </div>

      <!-- Main Content Area -->
      <div class="card animate-in" style="grid-column: span 8; height: 400px; animation-delay: 0.4s;">
        <div class="card-title">Activity Feed</div>
        <div class="activity-feed">
          <p style="color: var(--text-secondary); text-align: center; margin-top: 100px;">Initializing neural activity stream...</p>
        </div>
      </div>

      <div class="card animate-in" style="grid-column: span 4; animation-delay: 0.5s;">
        <div class="card-title">Top Alerts</div>
        <div class="alerts-list">
          <div style="padding: 10px; border-bottom: 1px solid var(--card-border);">
            <small style="color: #3b82f6;">Just now</small>
            <p style="margin-top: 4px;">Neural engine successfully re-indexed.</p>
          </div>
          <div style="padding: 10px; border-bottom: 1px solid var(--card-border);">
            <small style="color: var(--text-secondary);">15m ago</small>
            <p style="margin-top: 4px;">Database migration completed in region us-east-1.</p>
          </div>
        </div>
      </div>
    </main>
  `
}

renderDashboard()

// Add some basic interactivity or styles for the pulse indicator in a real app would go here
const style = document.createElement('style')
style.textContent = `
  .status-indicator {
    display: flex;
    align-items: center;
    gap: 10px;
    background: rgba(16, 185, 129, 0.1);
    color: #10b981;
    padding: 8px 16px;
    border-radius: 100px;
    font-size: 0.875rem;
    font-weight: 600;
  }
  .pulse {
    width: 8px;
    height: 8px;
    background: #10b981;
    border-radius: 50%;
    box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7);
    animation: pulse 2s infinite;
  }
  @keyframes pulse {
    0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7); }
    70% { transform: scale(1); box-shadow: 0 0 0 10px rgba(16, 185, 129, 0); }
    100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); }
  }
`
document.head.appendChild(style)
