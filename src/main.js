import './style.css'

// ==================== STATE ====================
const state = {
  isLoggedIn: false,
  oauth: {
    connected: false // Unified status
  },
  scanEnabled: true,
  scanFrequency: '2',
  logs: JSON.parse(localStorage.getItem('ops_logs') || '[]') // Init from storage
}

const USERS = {
  'alex': 'alex',
  'nick': 'nick',
  'leanne': 'leanne',
  'nathan': 'nathan'
}

// ==================== RENDER FUNCTIONS ====================
const app = document.querySelector('#app')

// Helper for Lucide icons
const createIcons = () => {
  if (window.lucide) window.lucide.createIcons()
}

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
            <label class="block text-sm font-semibold text-slate-700 mb-1.5">User</label>
            <div class="relative">
              <select id="userInput" class="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-4 focus:ring-blue-50 focus:border-blue-500 outline-none transition-all appearance-none bg-white text-slate-700 font-medium cursor-pointer">
                <option value="" disabled selected>Select your name</option>
                <option value="alex">Alex</option>
                <option value="nick">Nick</option>
                <option value="leanne">Leanne</option>
                <option value="nathan">Nathan</option>
              </select>
              <div class="absolute inset-y-0 right-0 flex items-center px-4 pointer-events-none text-slate-500">
                <i data-lucide="chevron-down" class="w-4 h-4"></i>
              </div>
            </div>
          </div>
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

  document.getElementById('login-form').addEventListener('submit', handleLogin)
}

function renderDashboard() {
  const isConnected = state.oauth.connected

  // Calculate dynamic stats
  const completed = state.logs.filter(l => l.status === 'Complete' || l.status === 'success').length
  const pending = 0 // Synchronous

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
                <span class="w-2 h-2 rounded-full ${isConnected ? 'bg-green-500 status-pulse shadow-[0_0_8px_rgba(34,197,94,0.4)]' : 'bg-slate-300'}"></span>
                <span class="text-slate-500 uppercase tracking-wider">${isConnected && state.oauth.email ? state.oauth.email : 'Not Connected'}</span>
              </div>
            </div>
            <button id="logout-btn" class="w-9 h-9 bg-gradient-to-br from-blue-50 to-blue-100 text-blue-600 rounded-full flex items-center justify-center font-bold text-xs border border-blue-200 hover:shadow-md transition-all cursor-pointer">
              LN
            </button>
          </div>
        </div>
      </header>

      <main class="max-w-7xl mx-auto px-4 mt-8">
        
        <!-- Warning Alert (Only if Not connected) -->
        ${!isConnected ? `
        <div class="mb-8 p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-4 animate-fade-in-up">
          <div class="text-amber-600 mt-0.5">
            <i data-lucide="alert-triangle" class="w-5 h-5"></i>
          </div>
          <div>
            <h4 class="font-semibold text-amber-900 text-sm">System Configuration Required</h4>
            <p class="text-amber-700 text-xs mt-1">Google Services Disconnected. Please connect to enable scanning.</p>
          </div>
          <button id="configBtn" class="ml-auto text-xs font-bold text-amber-800 bg-amber-100 px-3 py-1.5 rounded-lg hover:bg-amber-200 transition-colors uppercase tracking-tight">Connect Now</button>
        </div>` : ''}

        <!-- LIVE LOGS TERMINAL -->
        <div id="liveLogsContainer" class="mb-8 hidden">
           <div class="bg-slate-900 rounded-xl border border-slate-800 shadow-xl overflow-hidden">
             <div class="px-4 py-2 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
                <div class="flex items-center gap-2">
                    <div class="w-3 h-3 rounded-full bg-red-500"></div>
                    <div class="w-3 h-3 rounded-full bg-amber-500"></div>
                    <div class="w-3 h-3 rounded-full bg-green-500"></div>
                    <span class="text-xs font-mono text-slate-400 ml-2">scanner_output.log</span>
                </div>
                <div id="scanSpinner" class="hidden">
                    <i data-lucide="loader-2" class="w-4 h-4 text-blue-500 animate-spin"></i>
                </div>
             </div>
             <div id="liveLogs" class="p-4 h-64 overflow-y-auto font-mono text-xs text-green-400 space-y-1">
                <!-- Logs will appear here -->
             </div>
           </div>
        </div>


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
            <div class="text-slate-500 text-xs font-bold mb-2 uppercase tracking-wider">Queue Status</div>
            <div class="flex items-end justify-between">
              <span class="text-4xl font-bold text-slate-900 tracking-tight">${pending}</span>
              <span class="text-slate-400 text-xs font-bold mb-1 uppercase bg-slate-50 px-2 py-1 rounded">Idle</span>
            </div>
          </div>

          <!-- Controls -->
          <div class="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
             <h3 class="font-bold text-xs text-slate-500 uppercase mb-4">Scanner Controls</h3>
             <div class="flex flex-col gap-4">
               <div class="grid grid-cols-2 gap-2">
                    <input type="date" id="date-from" class="bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-xs">
                    <input type="date" id="date-to" class="bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-xs">
               </div>
               <button id="triggerBtn" class="w-full bg-slate-900 hover:bg-black text-white py-2.5 rounded-lg text-sm font-semibold transition-all flex items-center justify-center gap-2">
                  <i data-lucide="play" class="w-4 h-4"></i>
                  Start Live Scan
               </button>
             </div>
          </div>

           <div class="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
              <h3 class="font-bold text-xs text-slate-500 uppercase mb-4">Connection</h3>
                <div class="flex items-center justify-between p-3 ${isConnected ? 'bg-green-50 border-green-100' : 'bg-slate-50 border-slate-200'} rounded-xl border">
                  <div class="flex items-center gap-3">
                    <div class="p-2 bg-white rounded-lg border border-slate-200 shadow-sm">
                      <img src="https://www.gstatic.com/images/branding/product/1x/googleg_48dp.png" class="w-5 h-5" alt="Google">
                    </div>
                    <div>
                        <span class="block text-sm font-bold ${isConnected ? 'text-green-800' : 'text-slate-700'}">${isConnected ? 'Connected' : 'Disconnected'}</span>
                    </div>
                  </div>
                  <button class="oauth-btn text-xs font-bold ${isConnected ? 'text-green-700 hover:underline' : 'text-blue-600 px-3 py-1.5 bg-blue-50 rounded-lg border border-blue-100 hover:bg-blue-100'}" data-service="google">${isConnected ? 'REVOKE' : 'CONNECT'}</button>
                </div>
          </div>
        </div>

        <!-- Activity Log -->
        <div class="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div class="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
            <h3 class="font-bold text-lg text-slate-800">Processing History</h3>
            <div class="flex gap-2">
                <button id="clearLogsBtn" class="p-1.5 hover:bg-slate-100 rounded-lg text-slate-500" title="Clear Logs"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
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
                    <th class="px-6 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">File</th>
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
            <p class="text-slate-500 font-medium">No activity recorded.</p>
            </div>
            ` : ''}
        </div>
      </main>
    </div>

    <!-- Notification Toast (Still kept for simple feedback) -->
    <div id="toast" class="fixed bottom-6 right-6 transform translate-y-24 transition-transform duration-300 z-[100]">
      <div class="bg-slate-900 text-white px-6 py-3 rounded-xl shadow-2xl flex items-center gap-3">
        <i data-lucide="check-circle" class="w-5 h-5 text-green-400"></i>
        <span id="toastMessage">Action successful</span>
      </div>
    </div>
  `

  createIcons()
  attachDashboardListeners()
}

function renderLogRows() {
  return state.logs.map(log => {
    const statusColor = (log.status === 'Complete' || log.status === 'success') ? 'text-green-600 bg-green-50' :
      log.status === 'Processing' ? 'text-blue-600 bg-blue-50' : 'text-red-600 bg-red-50'
    return `
      <tr class="hover:bg-slate-50 transition-colors group">
        <td class="px-6 py-4">
          <div class="flex flex-col">
            <span class="font-bold text-slate-800 text-sm flex items-center gap-1">
              ${log.id}
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
          <button class="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all" title="View Details" onclick="window.open('${log.fileLink}', '_blank')">
            <i data-lucide="external-link" class="w-4 h-4"></i>
          </button>
        </td>
      </tr>
    `
  }).join('')
}

// ==================== EVENT HANDLERS & SSE ====================
function handleLogin(e) {
  e.preventDefault()
  const selectedUser = document.getElementById('userInput').value
  const password = document.getElementById('passwordInput').value
  const errorEl = document.getElementById('loginError')
  const gate = document.getElementById('loginGate')

  if (USERS[selectedUser] && USERS[selectedUser] === password) {
    state.isLoggedIn = true
    state.currentUser = selectedUser
    localStorage.setItem('isLoggedIn', 'true')
    localStorage.setItem('currentUser', selectedUser)

    gate.classList.add('opacity-0')
    setTimeout(() => {
      renderDashboard()
      checkStatus() // Check status for THIS user
    }, 500)
  } else {
    errorEl.classList.remove('hidden')
    document.getElementById('passwordInput').value = ''
  }
}

function attachDashboardListeners() {
  // Logout
  document.getElementById('logout-btn').addEventListener('click', () => {
    state.isLoggedIn = false
    localStorage.removeItem('isLoggedIn')
    renderLogin()
  })

  // Clear Logs
  const clearBtn = document.getElementById('clearLogsBtn')
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      if (confirm('Clear all logs?')) {
        state.logs = []
        localStorage.removeItem('ops_logs')
        renderDashboard()
      }
    })
  }

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
      // Listen for "Connect Now" or header "Connect"
      document.addEventListener('click', (e) => {
        if (e.target.id === 'configBtn' || e.target.id === 'connectHeaderBtn' || e.target.textContent.includes('Connect Now') || (e.target.tagName === 'BUTTON' && e.target.textContent.trim() === 'CONNECT')) {
          // Pass username to Auth endpoint
          const user = state.currentUser || localStorage.getItem('currentUser')
          window.location.href = `/auth/google?username=${user}`
        }
      })

      // Start Scan
      document.getElementById('triggerBtn')?.addEventListener('click', async () => {
        const btn = document.getElementById('triggerBtn')
        const statusEl = document.getElementById('scanStatus') // Assuming this element exists or will be added

        // UI Reset
        btn.disabled = true
        btn.innerHTML = `<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> Scanning...`
        state.logs = []
        // renderLogs() // Assuming this function exists or will be added

        // Connect to SSE
        const user = state.currentUser || localStorage.getItem('currentUser')
        const dateFrom = document.getElementById('date-from').value
        const dateTo = document.getElementById('date-to').value // Assuming date-to is also used
        const eventSource = new EventSource(`/api/scan/stream?dateFrom=${dateFrom}&dateTo=${dateTo}&username=${user}`)

        const liveLogsContainer = document.getElementById('liveLogsContainer') // Assuming this element exists or will be added
        const liveLogs = document.getElementById('liveLogs') // Assuming this element exists or will be added
        const scanSpinner = document.getElementById('scanSpinner') // Assuming this element exists or will be added

        if (liveLogsContainer) liveLogsContainer.classList.remove('hidden')
        if (scanSpinner) scanSpinner.classList.remove('hidden')
        if (liveLogs) liveLogs.innerHTML = `<div class="text-slate-500 italic">Connecting to scanner stream...</div>`

        eventSource.onmessage = (event) => {
          const data = JSON.parse(event.data)

          if (data.type === 'log') {
            const line = document.createElement('div')
            line.innerHTML = `<span class="opacity-50">[${new Date().toLocaleTimeString()}]</span> ${data.message}`
            if (liveLogs) {
              liveLogs.appendChild(line)
              liveLogs.scrollTop = liveLogs.scrollHeight // Auto-scroll
            }
          }
          else if (data.type === 'error') {
            const line = document.createElement('div')
            line.className = 'text-red-500 font-bold'
            line.innerText = `ERROR: ${data.message}`
            if (liveLogs) liveLogs.appendChild(line)
            eventSource.close()
            finalizeScan(btn)
          }
          else if (data.type === 'complete') {
            const line = document.createElement('div')
            line.className = 'text-white font-bold mt-4 pt-2 border-t border-slate-700'
            line.innerText = `SCAN COMPLETE. Processed: ${data.summary.processed.length}, Skipped: ${data.summary.skipped.length}, Errors: ${data.summary.errors.length}`
            if (liveLogs) liveLogs.appendChild(line)

            // Update State logs
            if (data.summary.processed.length > 0) {
              const newLogs = data.summary.processed.map(item => ({
                id: item.id || 'N/A',
                supplier: item.supplier || 'Unknown',
                date: item.date || 'N/A',
                amount: typeof item.amount === 'number' ? item.amount.toFixed(2) : item.amount,
                status: 'success',
                fileLink: item.fileLink
              }))
              state.logs = [...newLogs, ...state.logs]
              localStorage.setItem('ops_logs', JSON.stringify(state.logs))
            }

            eventSource.close()
            finalizeScan(btn)
            if (scanSpinner) scanSpinner.classList.add('hidden')

            showToast('Scan Completed')
            // Delay reload so they can read logs
            setTimeout(() => renderDashboard(), 3000)
          }
        }

        eventSource.onerror = (err) => {
          console.error("EventSource failed:", err)
          const line = document.createElement('div')
          line.className = 'text-amber-500'
          line.innerText = `Connection closed (possibly finished or timed out).`
          if (liveLogs) liveLogs.appendChild(line)
          eventSource.close()
          finalizeScan(btn)
        }
      })
    }
  })
}



function finalizeScan(btn) {
  btn.disabled = false
  btn.innerHTML = `<i data-lucide="play" class="w-4 h-4"></i> Start Live Scan`
  createIcons()
}

function showToast(msg) {
  const toast = document.getElementById('toast')
  const toastMsg = document.getElementById('toastMessage')
  if (!toast || !toastMsg) return

  toastMsg.innerText = msg
  toast.classList.remove('translate-y-24')

  setTimeout(() => {
    toast.classList.add('translate-y-24')
  }, 3000)
}

// ==================== INIT ====================
async function checkStatus() {
  const user = state.currentUser || localStorage.getItem('currentUser')
  if (!user) return

  try {
    const res = await fetch(`/api/status?username=${user}`)
    const data = await res.json()
    // Unified status
    state.oauth.connected = data.connected
    state.oauth.email = data.email || null
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
    state.currentUser = localStorage.getItem('currentUser')
    await checkStatus() // Sync with backend
    renderDashboard()
  } else {
    renderLogin()
  }
}

init()
