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

// ==================== RENDER FUNCTIONS ====================
const app = document.querySelector('#app')

function renderLogin() {
  app.innerHTML = `
    <!-- Login Screen -->
    <div id="loginGate" class="fixed inset-0 z-50 flex items-center justify-center bg-white transition-opacity duration-500">
      <div class="w-full max-w-md p-8 bg-white rounded-2xl border border-slate-100 shadow-xl">
        <div class="text-center mb-8">
          <div class="inline-flex items-center justify-center w-16 h-16 bg-blue-50 text-blue-600 rounded-full mb-4 ring-4 ring-blue-50/50">
             <img src="/logo.png" alt="Logo" class="w-10 h-10 object-contain" />
          </div>
          <h1 class="text-2xl font-bold text-slate-900">Operations Access</h1>
          <p class="text-slate-500 mt-2">Please enter the system password</p>
        </div>
        <form id="login-form" class="space-y-5">
          <div>
            <label class="block text-sm font-semibold text-slate-700 mb-1.5">Password</label>
            <input type="password" id="passwordInput" class="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-4 focus:ring-blue-50 focus:border-blue-500 outline-none transition-all placeholder:text-slate-300" placeholder="••••••••">
          </div>
          <button type="submit" class="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3.5 rounded-xl transition-all shadow-lg shadow-blue-600/20 active:scale-[0.98]">
            Enter Dashboard
          </button>
          <p id="loginError" class="text-red-500 text-sm text-center hidden font-medium bg-red-50 py-2 rounded-lg">Incorrect password. Please try again.</p>
        </form>
      </div>
    </div>
  `

  // Lucide icons not needed here as we used image logo
  document.getElementById('login-form').addEventListener('submit', handleLogin)
}

function renderDashboard() {
  const gmailStatus = state.oauth.gmail
  const driveStatus = state.oauth.drive
  const sheetsStatus = state.oauth.sheets

  // Calculate dynamic stats
  const completed = state.logs.filter(l => l.status === 'success').length
  const pending = state.logs.filter(l => l.status === 'processing').length

  // Calculate today's total
  const today = new Date().toISOString().split('T')[0]
  const todayCount = state.logs.filter(l => l.date === today).length

  app.innerHTML = `
    <!-- Main Dashboard -->
    <div id="mainDashboard" class="min-h-screen pb-12 bg-white">
      <!-- Header -->
      <header class="sticky top-0 z-40 bg-white/90 backdrop-blur-xl border-b border-slate-100">
        <div class="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div class="flex items-center gap-3">
            <img src="/logo.png" alt="Pela Terra" class="w-8 h-8 rounded-lg shadow-sm" />
            <span class="font-bold text-xl tracking-tight text-slate-900">Pela Terra <span class="text-blue-600 text-sm font-medium bg-blue-50 px-2 py-0.5 rounded-full ml-1">Operations</span></span>
          </div>

          <!-- Connection States -->
          <div class="flex items-center gap-4">
            <div class="hidden md:flex items-center gap-6 px-4 py-1.5 bg-slate-50 rounded-full border border-slate-100">
              <div class="flex items-center gap-2 text-xs font-semibold">
                <span class="w-2 h-2 rounded-full ${gmailStatus ? 'bg-green-500 status-pulse shadow-[0_0_8px_rgba(34,197,94,0.4)]' : 'bg-slate-300'}"></span>
                <span class="text-slate-500 uppercase tracking-wider">Gmail</span>
              </div>
              <div class="flex items-center gap-2 text-xs font-semibold">
                <span class="w-2 h-2 rounded-full ${driveStatus ? 'bg-green-500 status-pulse shadow-[0_0_8px_rgba(34,197,94,0.4)]' : 'bg-slate-300'}"></span>
                <span class="text-slate-500 uppercase tracking-wider">Drive</span>
              </div>
              <div class="flex items-center gap-2 text-xs font-semibold">
                <span class="w-2 h-2 rounded-full ${sheetsStatus ? 'bg-green-500 status-pulse shadow-[0_0_8px_rgba(34,197,94,0.4)]' : 'bg-amber-400'}"></span>
                <span class="text-slate-500 uppercase tracking-wider">Sheets</span>
              </div>
            </div>
            <button class="p-2 text-slate-400 hover:bg-slate-50 hover:text-slate-600 rounded-full transition-colors relative">
              <i data-lucide="bell" class="w-5 h-5"></i>
              ${state.logs.length > 0 ? '<span class="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full border-2 border-white"></span>' : ''}
            </button>
            <button id="logout-btn" class="w-9 h-9 bg-gradient-to-br from-blue-50 to-blue-100 text-blue-600 rounded-full flex items-center justify-center font-bold text-xs border border-blue-200 hover:shadow-md transition-all cursor-pointer">
              LN
            </button>
          </div>
        </div>
      </header>

      <main class="max-w-7xl mx-auto px-4 mt-8">
        
        <!-- Warning Alert (Only if Sheets not connected) -->
        ${!sheetsStatus ? `
        <div class="mb-8 p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-4 animate-fade-in-up">
          <div class="text-amber-600 mt-0.5">
            <i data-lucide="alert-triangle" class="w-5 h-5"></i>
          </div>
          <div>
            <h4 class="font-semibold text-amber-900 text-sm">System Configuration Required</h4>
            <p class="text-amber-700 text-xs mt-1">Google Sheets connection is missing. Data will not be logged correctly.</p>
          </div>
          <button id="configBtn" class="ml-auto text-xs font-bold text-amber-800 bg-amber-100 px-3 py-1.5 rounded-lg hover:bg-amber-200 transition-colors uppercase tracking-tight">Connect Now</button>
        </div>` : ''}

        <!-- Dashboard Stats Grid -->
        <div class="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div class="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 hover:border-blue-100 transition-colors">
            <div class="text-slate-500 text-xs font-bold mb-2 uppercase tracking-wider">Total Processed</div>
            <div class="flex items-end justify-between">
              <span class="text-4xl font-bold text-slate-900 tracking-tight">${completed}</span>
              <div class="h-8 w-8 bg-green-50 rounded-lg flex items-center justify-center text-green-600">
                <i data-lucide="file-check" class="w-4 h-4"></i>
              </div>
            </div>
          </div>
          
          <div class="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 hover:border-blue-100 transition-colors">
            <div class="text-slate-500 text-xs font-bold mb-2 uppercase tracking-wider">Avg Confidence</div>
            <div class="flex items-end justify-between">
              <span class="text-4xl font-bold text-slate-900 tracking-tight">--<span class="text-lg text-slate-400">%</span></span>
              <div class="h-8 w-8 bg-blue-50 rounded-lg flex items-center justify-center text-blue-600">
                <i data-lucide="brain-circuit" class="w-4 h-4"></i>
              </div>
            </div>
          </div>
          
          <div class="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 hover:border-blue-100 transition-colors">
            <div class="text-slate-500 text-xs font-bold mb-2 uppercase tracking-wider">Queue Status</div>
            <div class="flex items-end justify-between">
              <span class="text-4xl font-bold text-slate-900 tracking-tight">${pending}</span>
              <span class="text-slate-400 text-xs font-bold mb-1 uppercase bg-slate-50 px-2 py-1 rounded">Idle</span>
            </div>
          </div>
          
          <div class="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 hover:border-blue-100 transition-colors">
            <div class="text-slate-500 text-xs font-bold mb-2 uppercase tracking-wider">System Status</div>
            <div class="flex items-center justify-between mt-1">
              <div class="flex items-center gap-3">
                 <div class="w-3 h-3 bg-green-500 rounded-full shadow-[0_0_8px_rgba(34,197,94,0.6)] animate-pulse"></div>
                 <span class="font-bold text-slate-700 text-sm">Online</span>
              </div>
              <label class="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" id="scanToggle" class="sr-only peer" ${state.scanEnabled ? 'checked' : ''}>
                <div class="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
              </label>
            </div>
          </div>
        </div>


        <!-- Controls and Filter -->
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          <!-- Left Column: Controls -->
          <div class="lg:col-span-1 space-y-6">
            <div class="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
              <h3 class="font-bold text-lg mb-4 flex items-center gap-2">
                <i data-lucide="settings" class="w-5 h-5 text-slate-400"></i>
                Scanner Controls
              </h3>
              <div class="space-y-4">
                <div>
                  <label class="block text-xs font-bold text-slate-500 uppercase mb-2">Frequency</label>
                  <select id="scan-frequency" class="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none">
                    <option value="48" ${state.scanFrequency === '48' ? 'selected' : ''}>Every 30 Minutes</option>
                    <option value="24" ${state.scanFrequency === '24' ? 'selected' : ''}>Hourly</option>
                    <option value="2" ${state.scanFrequency === '2' ? 'selected' : ''}>2x Daily</option>
                    <option value="1" ${state.scanFrequency === '1' ? 'selected' : ''}>Daily</option>
                  </select>
                </div>
                <div>
                  <label class="block text-xs font-bold text-slate-500 uppercase mb-2">Historical Scan (Date Range)</label>
                  <div class="grid grid-cols-2 gap-2">
                    <input type="date" id="date-from" class="bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-xs">
                    <input type="date" id="date-to" class="bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-xs">
                  </div>
                </div>
                <button id="triggerBtn" class="w-full bg-slate-900 hover:bg-black text-white py-2.5 rounded-lg text-sm font-semibold transition-all flex items-center justify-center gap-2 mt-4">
                  <i data-lucide="play" class="w-4 h-4"></i>
                  Trigger Manual Scan
                </button>
              </div>
            </div>

            <div class="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
              <h3 class="font-bold text-lg mb-4 flex items-center gap-2 text-slate-800">
                <i data-lucide="link" class="w-5 h-5 text-slate-400"></i>
                Service OAuth
              </h3>
              <div class="space-y-3">
                <div class="flex items-center justify-between p-3 ${gmailStatus ? 'bg-green-50 border-green-100' : 'bg-slate-50 border-slate-200'} rounded-xl border">
                  <div class="flex items-center gap-3">
                    <i data-lucide="mail" class="w-5 h-5 ${gmailStatus ? 'text-green-600' : 'text-slate-400'}"></i>
                    <span class="text-sm font-medium ${gmailStatus ? 'text-green-800' : 'text-slate-600'}">${gmailStatus ? 'Gmail Connected' : 'Gmail'}</span>
                  </div>
                  <button class="oauth-btn text-xs font-bold ${gmailStatus ? 'text-green-700 hover:underline' : 'text-blue-600 px-3 py-1 bg-white rounded-lg border border-blue-200 hover:bg-blue-50'}" data-service="gmail">${gmailStatus ? 'REVOKE' : 'CONNECT'}</button>
                </div>
                <div class="flex items-center justify-between p-3 ${driveStatus ? 'bg-green-50 border-green-100' : 'bg-slate-50 border-slate-200'} rounded-xl border">
                  <div class="flex items-center gap-3">
                    <i data-lucide="database" class="w-5 h-5 ${driveStatus ? 'text-green-600' : 'text-slate-400'}"></i>
                    <span class="text-sm font-medium ${driveStatus ? 'text-green-800' : 'text-slate-600'}">${driveStatus ? 'Drive Connected' : 'Drive'}</span>
                  </div>
                  <button class="oauth-btn text-xs font-bold ${driveStatus ? 'text-green-700 hover:underline' : 'text-blue-600 px-3 py-1 bg-white rounded-lg border border-blue-200 hover:bg-blue-50'}" data-service="drive">${driveStatus ? 'REVOKE' : 'CONNECT'}</button>
                </div>
                <div class="flex items-center justify-between p-3 ${sheetsStatus ? 'bg-green-50 border-green-100' : 'bg-amber-50 border-amber-100'} rounded-xl border">
                  <div class="flex items-center gap-3">
                    <i data-lucide="file-spreadsheet" class="w-5 h-5 ${sheetsStatus ? 'text-green-600' : 'text-amber-600'}"></i>
                    <span class="text-sm font-medium ${sheetsStatus ? 'text-green-800' : 'text-amber-800'}">${sheetsStatus ? 'Sheets Connected' : 'Sheets Auth Expired'}</span>
                  </div>
                  <button class="oauth-btn text-xs font-bold ${sheetsStatus ? 'text-green-700 hover:underline' : 'text-amber-700 px-3 py-1 bg-white rounded-lg border border-amber-200 hover:bg-amber-100'}" data-service="sheets">${sheetsStatus ? 'REVOKE' : 'CONNECT'}</button>
                </div>
              </div>
            </div>
          </div>

          <!-- Right Column: Activity Log -->
          <div class="lg:col-span-2">
            <div class="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
              <div class="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                <h3 class="font-bold text-lg text-slate-800">Processing Activity</h3>
                <div class="flex gap-2">
                  <button class="p-1.5 hover:bg-slate-100 rounded-lg text-slate-500"><i data-lucide="filter" class="w-4 h-4"></i></button>
                  <button class="p-1.5 hover:bg-slate-100 rounded-lg text-slate-500"><i data-lucide="download" class="w-4 h-4"></i></button>
                </div>
              </div>
              <div class="overflow-x-auto">
                <table class="w-full text-left">
                  <thead class="bg-slate-50 border-b border-slate-100">
                    <tr>
                      <th class="px-6 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Invoice / Supplier</th>
                      <th class="px-6 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Date</th>
                      <th class="px-6 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Amount</th>
                      <th class="px-6 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Status</th>
                      <th class="px-6 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Action</th>
                    </tr>
                  </thead>
                  <tbody id="activityLogBody" class="divide-y divide-slate-100">
                    ${renderLogRows()}
                  </tbody>
                </table>
              </div>
              ${state.logs.length === 0 ? `
              <div id="emptyState" class="p-12 text-center">
                <div class="inline-flex items-center justify-center w-12 h-12 bg-slate-100 text-slate-400 rounded-full mb-4">
                  <i data-lucide="inbox" class="w-6 h-6"></i>
                </div>
                <p class="text-slate-500 font-medium">No activity for the selected range.</p>
              </div>
              ` : ''}
            </div>
          </div>
        </div>
      </main>
    </div>

    <!-- Notification Toast -->
    <div id="toast" class="fixed bottom-6 right-6 transform translate-y-24 transition-transform duration-300 z-[100]">
      <div class="bg-slate-900 text-white px-6 py-3 rounded-xl shadow-2xl flex items-center gap-3">
        <i data-lucide="check-circle" class="w-5 h-5 text-green-400"></i>
        <span id="toastMessage">Action successful</span>
      </div>
    </div>
  `

  lucide.createIcons()
  attachDashboardListeners()
}

function renderLogRows() {
  return state.logs.map(log => {
    const statusColor = log.status === 'Complete' ? 'text-green-600 bg-green-50' :
      log.status === 'Processing' ? 'text-blue-600 bg-blue-50' : 'text-red-600 bg-red-50'
    return `
      <tr class="hover:bg-slate-50 transition-colors group">
        <td class="px-6 py-4">
          <div class="flex flex-col">
            <span class="font-bold text-slate-800 text-sm flex items-center gap-1">
              ${log.id}
              ${log.qrDetected ? '<i data-lucide="qr-code" class="w-3 h-3 text-blue-500" title="QR Code Verified"></i>' : ''}
            </span>
            <span class="text-xs text-slate-500">${log.supplier}</span>
          </div>
        </td>
        <td class="px-6 py-4 text-xs font-medium text-slate-600 uppercase tracking-tighter">
          ${log.date}
        </td>
        <td class="px-6 py-4 font-bold text-sm text-slate-800">
          ${log.amount}
        </td>
        <td class="px-6 py-4">
          <span class="px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${statusColor}">
            ${log.status}
          </span>
        </td>
        <td class="px-6 py-4">
          <button class="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all" title="View Details">
            <i data-lucide="external-link" class="w-4 h-4"></i>
          </button>
        </td>
      </tr>
    `
  }).join('')
}

// ==================== EVENT HANDLERS ====================
function handleLogin(e) {
  e.preventDefault()
  const password = document.getElementById('passwordInput').value
  const errorEl = document.getElementById('loginError')
  const gate = document.getElementById('loginGate')

  if (password === APP_PASSWORD) {
    state.isLoggedIn = true
    localStorage.setItem('isLoggedIn', 'true')
    gate.classList.add('opacity-0')
    setTimeout(() => {
      renderDashboard()
    }, 500)
  } else {
    errorEl.classList.remove('hidden')
    document.getElementById('passwordInput').value = ''
  }
}

// ... (previous functions remain the same)

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
      e.stopPropagation()
      // If revoking
      if (btn.innerText === 'REVOKE') {
        fetch('/api/oauth/revoke', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ service: btn.dataset.service })
        }).then(() => window.location.reload())
      } else {
        window.location.href = '/auth/google'
      }
    })
  })

  // Config Button (if present)
  const configBtn = document.getElementById('configBtn')
  if (configBtn) {
    configBtn.addEventListener('click', () => {
      window.location.href = '/auth/google'
    })
  }

  // Scan toggle
  document.getElementById('scanToggle').addEventListener('change', () => {
    state.scanEnabled = !state.scanEnabled
    showToast(state.scanEnabled ? 'Scanning resumed' : 'Scanning paused')
    renderDashboard()
  })

  // Frequency selector
  const freqSelect = document.getElementById('scan-frequency')
  if (freqSelect) {
    freqSelect.addEventListener('change', (e) => {
      state.scanFrequency = e.target.value
      showToast('Frequency updated')
    })
  }

  // Manual scan
  const triggerBtn = document.getElementById('triggerBtn')
  if (triggerBtn) {
    triggerBtn.addEventListener('click', triggerRealScan)
  }
}

// ... (triggerRealScan and showToast remain same)

// ==================== INIT ====================
async function checkStatus() {
  try {
    const res = await fetch('/api/status')
    const data = await res.json()
    state.oauth.gmail = data.gmail
    state.oauth.drive = data.drive
    state.sheetsStatus = data.sheets // Note: keys might differ slightly in logic, updating to match
    state.oauth.sheets = data.sheets
  } catch (e) {
    console.error('Failed to fetch status')
  }
}

async function init() {
  // Check for successful oauth return
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('oauth') === 'success') {
    state.isLoggedIn = true
    localStorage.setItem('isLoggedIn', 'true')
    window.history.replaceState({}, document.title, "/") // Clean URL
  }

  if (localStorage.getItem('isLoggedIn') === 'true') {
    state.isLoggedIn = true
    await checkStatus() // Sync with backend
    renderDashboard()
  } else {
    renderLogin()
  }
}

init()
