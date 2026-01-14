import './style.css'

// ==================== STATE ====================
const state = {
  isLoggedIn: false,
  oauth: {
    gmail: false,
    drive: false,
    sheets: false
  },
  scanEnabled: true,
  scanFrequency: '2',
  logs: []
}

const APP_PASSWORD = 'leanne'

// ... (keep renderLogin and renderDashboard same until attachDashboardListeners)

function attachDashboardListeners() {
  // Logout
  document.getElementById('logout-btn').addEventListener('click', () => {
    state.isLoggedIn = false
    localStorage.removeItem('isLoggedIn')
    renderLogin()
  })

  // OAuth buttons logic
  document.querySelectorAll('.oauth-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const service = e.target.dataset.service
      // In production, this would be more granular, but for MVP we use one Google auth for all
      window.location.href = '/auth/google'
    })
  })

  // Scan toggle
  document.getElementById('scanToggle').addEventListener('change', () => {
    state.scanEnabled = !state.scanEnabled
    showToast(state.scanEnabled ? 'Scanning resumed' : 'Scanning paused')
    renderDashboard()
  })

  // Frequency selector
  document.getElementById('scan-frequency').addEventListener('change', (e) => {
    state.scanFrequency = e.target.value
    showToast('Frequency updated')
  })

  // Manual scan
  document.getElementById('triggerBtn').addEventListener('click', triggerRealScan)
}

async function triggerRealScan() {
  const btn = document.getElementById('triggerBtn')
  const originalHTML = btn.innerHTML

  btn.disabled = true
  btn.innerHTML = `<i data-lucide="refresh-cw" class="w-4 h-4 animate-spin"></i> Scanning Gmail...`
  lucide.createIcons()

  try {
    const response = await fetch('/api/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        // Default to last 24h if not specified
        dateFrom: new Date(Date.now() - 86400000).toISOString().split('T')[0]
      })
    })

    const result = await response.json()

    if (result.success) {
      showToast(`Scan complete: ${result.processed.length} new invoices`)
      // Ideally refresh logs here by fetching from backend, but for MVP we just show toast
      // You might want to implement a fetchLogs function
    } else {
      showToast('Scan failed or no new invoices')
    }
  } catch (error) {
    console.error('Scan error:', error)
    showToast('Error triggering scan')
  } finally {
    btn.disabled = false
    btn.innerHTML = originalHTML
    lucide.createIcons()
  }
}

function showToast(msg) {
  const toast = document.getElementById('toast')
  const toastMsg = document.getElementById('toastMessage')
  toastMsg.innerText = msg
  toast.classList.remove('translate-y-24')

  setTimeout(() => {
    toast.classList.add('translate-y-24')
  }, 3000)
}

// ... (keep init same)

// ==================== INIT ====================
function init() {
  if (localStorage.getItem('isLoggedIn') === 'true') {
    state.isLoggedIn = true
    renderDashboard()
  } else {
    renderLogin()
  }
}

init()
