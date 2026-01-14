import './style.css'

// ==================== STATE ====================
const state = {
  isLoggedIn: false,
  oauth: {
    gmail: false,
    drive: false,
    sheets: false
  },
  scanEnabled: false,
  scanFrequency: '2', // times per day
  logs: []
}

const APP_PASSWORD = 'leanne'

// ==================== RENDER FUNCTIONS ====================
const app = document.querySelector('#app')

function renderLogin() {
  app.innerHTML = `
    <div class="login-container">
      <div class="login-card">
        <div class="login-logo">📄</div>
        <h1>Invoice Automation</h1>
        <p>Operations Command Center</p>
        
        <div id="login-error" class="login-error">Incorrect password. Please try again.</div>
        
        <form id="login-form">
          <div class="form-group">
            <label for="password">Password</label>
            <input type="password" id="password" name="password" placeholder="Enter password" autocomplete="current-password" />
          </div>
          <button type="submit" class="btn btn-primary">Sign In</button>
        </form>
      </div>
    </div>
  `

  document.getElementById('login-form').addEventListener('submit', handleLogin)
}

function renderDashboard() {
  const allConnected = state.oauth.gmail && state.oauth.drive && state.oauth.sheets

  app.innerHTML = `
    <div class="dashboard">
      <header class="dashboard-header">
        <div class="dashboard-title">
          <h1>Invoice Automation</h1>
          <p>Operations Command Center</p>
        </div>
        <div class="header-actions">
          <div class="status-pill ${state.scanEnabled ? 'active' : 'inactive'}">
            <span class="status-dot"></span>
            ${state.scanEnabled ? 'Scanning Active' : 'Scanning Paused'}
          </div>
          <button class="btn btn-logout" id="logout-btn">Logout</button>
        </div>
      </header>

      <div class="grid-layout">
        <!-- OAuth Connections -->
        <div class="card" style="grid-column: span 4;">
          <div class="card-header">
            <span class="card-title">Connections</span>
          </div>
          <div class="oauth-grid">
            <div class="oauth-item">
              <div class="oauth-info">
                <div class="oauth-icon gmail">📧</div>
                <div>
                  <div class="oauth-label">Gmail</div>
                  <div class="oauth-status ${state.oauth.gmail ? 'connected' : ''}">
                    ${state.oauth.gmail ? 'Connected' : 'Not connected'}
                  </div>
                </div>
              </div>
              <button class="btn btn-connect ${state.oauth.gmail ? 'connected' : ''}" data-service="gmail">
                ${state.oauth.gmail ? '✓ Connected' : 'Connect'}
              </button>
            </div>
            
            <div class="oauth-item">
              <div class="oauth-info">
                <div class="oauth-icon drive">📁</div>
                <div>
                  <div class="oauth-label">Google Drive</div>
                  <div class="oauth-status ${state.oauth.drive ? 'connected' : ''}">
                    ${state.oauth.drive ? 'Connected' : 'Not connected'}
                  </div>
                </div>
              </div>
              <button class="btn btn-connect ${state.oauth.drive ? 'connected' : ''}" data-service="drive">
                ${state.oauth.drive ? '✓ Connected' : 'Connect'}
              </button>
            </div>
            
            <div class="oauth-item">
              <div class="oauth-info">
                <div class="oauth-icon sheets">📊</div>
                <div>
                  <div class="oauth-label">Google Sheets</div>
                  <div class="oauth-status ${state.oauth.sheets ? 'connected' : ''}">
                    ${state.oauth.sheets ? 'Connected' : 'Not connected'}
                  </div>
                </div>
              </div>
              <button class="btn btn-connect ${state.oauth.sheets ? 'connected' : ''}" data-service="sheets">
                ${state.oauth.sheets ? '✓ Connected' : 'Connect'}
              </button>
            </div>
          </div>
        </div>

        <!-- Control Panel -->
        <div class="card" style="grid-column: span 4;">
          <div class="card-header">
            <span class="card-title">Control Panel</span>
          </div>
          
          <div class="control-group">
            <div class="toggle-switch">
              <div class="toggle ${state.scanEnabled ? 'active' : ''}" id="scan-toggle"></div>
              <span class="toggle-label">Continual Scan</span>
            </div>
          </div>
          
          <div class="control-group">
            <label class="control-label">Scan Frequency</label>
            <div class="select-wrapper">
              <select id="scan-frequency" ${!allConnected ? 'disabled' : ''}>
                <option value="48" ${state.scanFrequency === '48' ? 'selected' : ''}>Every 30 minutes</option>
                <option value="24" ${state.scanFrequency === '24' ? 'selected' : ''}>Hourly</option>
                <option value="2" ${state.scanFrequency === '2' ? 'selected' : ''}>Twice daily</option>
                <option value="1" ${state.scanFrequency === '1' ? 'selected' : ''}>Once daily</option>
              </select>
            </div>
          </div>
          
          <div class="control-group">
            <label class="control-label">Historical Scan</label>
            <div class="date-range">
              <input type="date" id="date-from" placeholder="From" />
              <input type="date" id="date-to" placeholder="To" />
            </div>
            <button class="btn btn-scan" id="scan-range-btn" ${!allConnected ? 'disabled' : ''}>
              Scan Date Range
            </button>
          </div>
        </div>

        <!-- Quick Stats -->
        <div class="card" style="grid-column: span 4;">
          <div class="card-header">
            <span class="card-title">Summary</span>
          </div>
          <div class="stats-grid">
            <div class="stat-item">
              <div class="stat-value">${state.logs.length}</div>
              <div class="stat-label">Total</div>
            </div>
            <div class="stat-item">
              <div class="stat-value">${state.logs.filter(l => l.status === 'success').length}</div>
              <div class="stat-label">Processed</div>
            </div>
            <div class="stat-item">
              <div class="stat-value">${state.logs.filter(l => l.status === 'pending').length}</div>
              <div class="stat-label">Pending</div>
            </div>
            <div class="stat-item">
              <div class="stat-value">${state.logs.filter(l => l.status === 'error').length}</div>
              <div class="stat-label">Errors</div>
            </div>
          </div>
        </div>

        <!-- Activity Log -->
        <div class="card" style="grid-column: span 12;">
          <div class="card-header">
            <span class="card-title">Activity Log</span>
            <div class="log-filters">
              <span class="filter-chip active" data-filter="all">All</span>
              <span class="filter-chip" data-filter="success">Processed</span>
              <span class="filter-chip" data-filter="pending">Pending</span>
              <span class="filter-chip" data-filter="error">Errors</span>
            </div>
          </div>
          <div class="log-list" id="log-list">
            ${renderLogList()}
          </div>
        </div>
      </div>
    </div>
  `

  attachDashboardListeners()
}

function renderLogList(filter = 'all') {
  const filteredLogs = filter === 'all'
    ? state.logs
    : state.logs.filter(l => l.status === filter)

  if (filteredLogs.length === 0) {
    return `
      <div class="log-empty">
        <div class="log-empty-icon">📭</div>
        <p>No invoices processed yet.</p>
        <p style="font-size: 0.8rem; margin-top: 0.5rem;">Connect your accounts and enable scanning to get started.</p>
      </div>
    `
  }

  return filteredLogs.map(log => `
    <div class="log-item">
      <div class="log-status ${log.status}"></div>
      <div class="log-content">
        <div class="log-title">${log.supplier} - ${log.invoiceNumber}</div>
        <div class="log-meta">
          <span>${log.company}</span>
          <span class="log-amount">€${log.amount.toFixed(2)}</span>
          <span>${log.date}</span>
        </div>
      </div>
      <div class="log-time">${log.processedAt}</div>
    </div>
  `).join('')
}

// ==================== EVENT HANDLERS ====================
function handleLogin(e) {
  e.preventDefault()
  const password = document.getElementById('password').value
  const errorEl = document.getElementById('login-error')

  if (password === APP_PASSWORD) {
    state.isLoggedIn = true
    localStorage.setItem('isLoggedIn', 'true')
    renderDashboard()
  } else {
    errorEl.classList.add('visible')
    document.getElementById('password').value = ''
  }
}

function attachDashboardListeners() {
  // Logout
  document.getElementById('logout-btn').addEventListener('click', () => {
    state.isLoggedIn = false
    localStorage.removeItem('isLoggedIn')
    renderLogin()
  })

  // OAuth buttons
  document.querySelectorAll('.btn-connect').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const service = e.target.dataset.service
      // In production, this would trigger OAuth flow
      // For now, simulate connection
      state.oauth[service] = !state.oauth[service]
      renderDashboard()
    })
  })

  // Scan toggle
  document.getElementById('scan-toggle').addEventListener('click', () => {
    const allConnected = state.oauth.gmail && state.oauth.drive && state.oauth.sheets
    if (!allConnected) {
      alert('Please connect all services before enabling scanning.')
      return
    }
    state.scanEnabled = !state.scanEnabled
    renderDashboard()
  })

  // Frequency selector
  document.getElementById('scan-frequency').addEventListener('change', (e) => {
    state.scanFrequency = e.target.value
  })

  // Filter chips
  document.querySelectorAll('.filter-chip').forEach(chip => {
    chip.addEventListener('click', (e) => {
      document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'))
      e.target.classList.add('active')
      document.getElementById('log-list').innerHTML = renderLogList(e.target.dataset.filter)
    })
  })

  // Scan range button
  document.getElementById('scan-range-btn').addEventListener('click', () => {
    const from = document.getElementById('date-from').value
    const to = document.getElementById('date-to').value
    if (!from || !to) {
      alert('Please select both start and end dates.')
      return
    }
    alert(`Scanning emails from ${from} to ${to}...\n\n(Backend integration pending)`)
  })
}

// ==================== INIT ====================
function init() {
  // Check for existing session
  if (localStorage.getItem('isLoggedIn') === 'true') {
    state.isLoggedIn = true

    // Add some demo data for the log
    state.logs = [
      {
        id: 1,
        supplier: 'Quiosque Alegria',
        invoiceNumber: 'FT 2025/225',
        company: 'Pela Terra II',
        amount: 1250.00,
        date: '10-Jan-2025',
        status: 'success',
        processedAt: '2 min ago'
      },
      {
        id: 2,
        supplier: 'EDP Comercial',
        invoiceNumber: 'FT 2025/1847',
        company: 'Pela Terra II',
        amount: 342.56,
        date: '08-Jan-2025',
        status: 'success',
        processedAt: '1 hour ago'
      },
      {
        id: 3,
        supplier: 'Vodafone Portugal',
        invoiceNumber: 'FT 2025/9921',
        company: 'Hadlock Consulting',
        amount: 89.99,
        date: '07-Jan-2025',
        status: 'pending',
        processedAt: 'Just now'
      }
    ]

    renderDashboard()
  } else {
    renderLogin()
  }
}

init()
