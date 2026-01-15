import express from 'express'
import cors from 'cors'
import { config } from 'dotenv'
import { google } from 'googleapis'
import { createClient } from '@supabase/supabase-js'
import path from 'path'
import { fileURLToPath } from 'url'
import { processInvoice } from './invoiceProcessor.js'
import { uploadToDrive, appendToSheet } from './googleServices.js'

config()

const app = express()
const PORT = process.env.PORT || 3001

// Middleware
app.use(cors({ origin: 'http://localhost:5173', credentials: true }))
app.use(express.json())

// Google Auth Config
const SCOPES = [
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/gmail.labels',
    'https://www.googleapis.com/auth/drive',
    'https://www.googleapis.com/auth/spreadsheets',
    'https://www.googleapis.com/auth/userinfo.email'
]

// Initialize Supabase
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_KEY
)

// Helper: Get Tokens (Consolidated)
async function getTokens() {
    console.log('[DB] Fetching tokens from Supabase...')
    const { data, error } = await supabase
        .from('system_tokens')
        .select('*')
        .eq('service_name', 'google')
        .single()

    if (error) {
        console.log('[DB] getTokens error:', error.message)
    } else {
        console.log('[DB] getTokens result:', data ? `Found token for ${data.token_json?.email || 'unknown'}` : 'No token found')
    }

    return data ? { google: data.token_json } : { google: null }
}

async function saveToken(service, token) {
    console.log(`[DB] Saving ${service} token for ${token.email || 'unknown'}...`)
    const { data, error } = await supabase
        .from('system_tokens')
        .upsert({ service_name: service, token_json: token }, { onConflict: 'service_name' })
        .select()

    if (error) {
        console.error(`[DB] Error saving ${service} token:`, error)
    } else {
        console.log(`[DB] Token saved successfully:`, data)
    }
}

// Helper: Delete Token
async function deleteToken(service) {
    const { error } = await supabase
        .from('system_tokens')
        .delete()
        .eq('service_name', service)

    if (error) console.error(`Error deleting ${service} token:`, error)
}

// OAuth2 Client (must be defined early for helper functions)
const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
)

// Helper: Get authenticated client with automatic token refresh
async function getAuthenticatedClient() {
    const tokenContainer = await getTokens()
    const googleToken = tokenContainer.google

    if (!googleToken) {
        throw new Error('Google Account not connected')
    }

    // Set credentials on the configured client (with client ID/secret)
    oauth2Client.setCredentials(googleToken)

    // Check if access token is expired and we have a refresh token
    const now = Date.now()
    const expiryDate = googleToken.expiry_date || 0

    if (now >= expiryDate && googleToken.refresh_token) {
        console.log('[AUTH] Access token expired, refreshing...')
        try {
            const { credentials } = await oauth2Client.refreshAccessToken()

            // Merge the new tokens (keep refresh_token if not returned)
            const updatedTokens = {
                ...googleToken,
                ...credentials,
                refresh_token: credentials.refresh_token || googleToken.refresh_token
            }

            // Save the refreshed tokens
            await saveToken('google', updatedTokens)
            oauth2Client.setCredentials(updatedTokens)

            console.log('[AUTH] Token refreshed successfully')
        } catch (refreshError) {
            console.error('[AUTH] Token refresh failed:', refreshError.message)
            throw new Error('Token refresh failed. Please re-authenticate.')
        }
    }

    return oauth2Client
}

// Routes
app.get('/api/health', (req, res) => res.json({ status: 'ok', timestamp: new Date() }))

app.get('/api/status', async (req, res) => {
    const tokens = await getTokens()
    res.json({
        connected: !!tokens.google,
        email: tokens.google?.email || null
    })
})

// Auth Routes
app.get('/auth/google', (req, res) => {
    const authUrl = oauth2Client.generateAuthUrl({
        access_type: 'offline', // Crucial for refresh tokens
        scope: SCOPES,
        prompt: 'consent' // Force refresh token generation
    })
    res.redirect(authUrl)
})

app.get('/auth/google/callback', async (req, res) => {
    const { code } = req.query
    try {
        const { tokens: newTokens } = await oauth2Client.getToken(code)
        oauth2Client.setCredentials(newTokens)

        // Fetch user info to get email
        const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client })
        const userInfo = await oauth2.userinfo.get()
        const email = userInfo.data.email

        console.log(`[AUTH] Connected as: ${email}`)

        // Save token with email for display
        await saveToken('google', { ...newTokens, email })

        console.log('Tokens acquired and saved')
        res.redirect('/?oauth=success')
    } catch (error) {
        console.error('Error in auth callback:', error)
        res.redirect('/?error=auth_failed')
    }
})

app.post('/api/oauth/revoke', async (req, res) => {
    await deleteToken('google')
    res.json({ success: true })
})

// === SSE STREAMING SCAN ENDPOINT ===
app.get('/api/scan/stream', async (req, res) => {
    // SSE Headers
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')

    const sendEvent = (data) => {
        res.write(`data: ${JSON.stringify(data)}\n\n`)
    }

    try {
        const { dateFrom } = req.query

        sendEvent({ type: 'log', message: 'Initializing Scan Process...' })

        // Get authenticated client with automatic token refresh
        let auth
        try {
            auth = await getAuthenticatedClient()
        } catch (authError) {
            sendEvent({ type: 'error', message: authError.message })
            return res.end()
        }

        const gmail = google.gmail({ version: 'v1', auth })
        const drive = google.drive({ version: 'v3', auth })

        // Pre-flight Check: Verify Drive folder access
        const rootFolderId = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID
        if (!rootFolderId) {
            sendEvent({ type: 'error', message: 'GOOGLE_DRIVE_ROOT_FOLDER_ID is not configured.' })
            return res.end()
        }

        try {
            sendEvent({ type: 'log', message: `Verifying access to Drive folder...` })
            const folderCheck = await drive.files.get({
                fileId: rootFolderId,
                fields: 'id, name, mimeType',
                supportsAllDrives: true  // Required for Shared Drives
            })
            sendEvent({ type: 'log', message: `✓ Drive folder verified: "${folderCheck.data.name}"` })
        } catch (driveError) {
            console.error('[DRIVE] Folder access check failed:', driveError.message)
            sendEvent({ type: 'error', message: `Cannot access Drive folder (${rootFolderId}). Please ensure the connected Google account (${(await getTokens()).google?.email || 'unknown'}) has access to this folder.` })
            return res.end()
        }

        const query = dateFrom
            ? `has:attachment filename:pdf after:${dateFrom}`
            : 'has:attachment filename:pdf newer_than:1d'

        sendEvent({ type: 'log', message: `Querying Gmail: "${query}"` })

        const response = await gmail.users.messages.list({
            userId: 'me',
            q: query
        })

        const messages = response.data.messages || []
        sendEvent({ type: 'log', message: `Found ${messages.length} potential emails.` })

        const results = [] // Store summary for final reporting

        if (messages.length === 0) {
            sendEvent({ type: 'log', message: 'No messages found.' })
        }

        const BATCH_SIZE = 1 // Process 1 by 1 for better streaming feel? Or keep batch but log carefully.
        // Let's do serial or small batch execution to ensure logs stream nicely
        for (const msg of messages) {
            await processMessage(gmail, msg, results, auth, sendEvent)
        }

        // Final Summary
        const processed = results.filter(r => r.status === 'success')
        const skipped = results.filter(r => r.status === 'skipped')
        const errors = results.filter(r => r.status === 'error')

        sendEvent({
            type: 'complete',
            summary: { processed, skipped, errors }
        })
        res.end()

    } catch (error) {
        console.error('Scan Error (Full):', JSON.stringify(error, Object.getOwnPropertyNames(error), 2))

        // Extract detailed error info
        let errorMsg = error.message || 'Unknown error'
        if (error.response && error.response.data) {
            console.error('API Response Data:', JSON.stringify(error.response.data, null, 2))
            errorMsg = `${error.response.data.error || errorMsg} - ${error.response.data.error_description || ''}`
        }
        if (error.errors && error.errors.length > 0) {
            errorMsg = error.errors.map(e => `${e.reason}: ${e.message}`).join('; ')
        }

        sendEvent({ type: 'error', message: `Critical Scan Fail: ${errorMsg}` })
        res.end()
    }
})


async function processMessage(gmail, msg, results, auth, sendEvent) {
    try {
        // Log "Processing Message ID..."
        // sendEvent({ type: 'log', message: `checking msg ${msg.id.substring(0,5)}...` })

        const message = await gmail.users.messages.get({ userId: 'me', id: msg.id })
        const parts = message.data.payload.parts || []

        // Recursive function to find PDF in multipart structure
        function findPdfPart(parts) {
            for (const p of parts) {
                if (p.mimeType === 'application/pdf' && p.filename) return p
                if (p.parts) { // check nested parts
                    const nested = findPdfPart(p.parts)
                    if (nested) return nested
                }
            }
            return null
        }

        const pdfPart = findPdfPart(parts)

        if (pdfPart && pdfPart.body.attachmentId) {
            const filename = pdfPart.filename
            sendEvent({ type: 'log', message: `📄 Found PDF: "${filename}" - Downloading...` })

            const attachment = await gmail.users.messages.attachments.get({
                userId: 'me',
                messageId: msg.id,
                id: pdfPart.body.attachmentId
            })

            const pdfBuffer = Buffer.from(attachment.data.data, 'base64')
            sendEvent({ type: 'log', message: `🤖 Analyzing "${filename}" with GPT-4o...` })

            const processingResult = await processInvoice(pdfBuffer, filename)

            if (processingResult.success) {
                const invoiceData = processingResult.data
                sendEvent({ type: 'log', message: `✅ Valid Invoice Identified: #${invoiceData.invoice_number}` })
                sendEvent({ type: 'log', message: `   Supplier: ${invoiceData.supplier_name} | Amount: ${invoiceData.total_amount}` })

                // Upload Drive (Reuse same auth client)
                sendEvent({ type: 'log', message: `   Uploading to Drive...` })
                const driveResult = await uploadToDrive(
                    auth,
                    pdfBuffer,
                    filename,
                    invoiceData.routing,
                    invoiceData.issue_date
                )

                // Sheets (Reuse same auth client)
                sendEvent({ type: 'log', message: `   Appending to Sheets...` })
                await appendToSheet(auth, invoiceData, driveResult.webViewLink)

                results.push({
                    status: 'success',
                    id: invoiceData.invoice_number,
                    supplier: invoiceData.supplier_name,
                    amount: invoiceData.total_amount,
                    date: invoiceData.issue_date,
                    fileLink: driveResult.webViewLink
                })
            } else {
                const reason = processingResult.reason || "Unknown Reason"
                sendEvent({ type: 'log', message: `⚠️ Skipped "${filename}": ${reason}` })
                results.push({ status: 'skipped', reason: reason, filename })
            }
        } else {
            // sendEvent({ type: 'log', message: `(Skipping msg ${msg.id}: No PDF attachment)` })
        }
    } catch (err) {
        console.error(`Processing error:`, err)
        sendEvent({ type: 'error', message: `Error processing ${msg.id}: ${err.message}` })
        results.push({ status: 'error', messageId: msg.id, error: err.message })
    }
}


// Serve static in production
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const distPath = path.join(__dirname, '../dist')
app.use(express.static(distPath))

// SPA Fallback
app.get(/(.*)/, (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'))
})

app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`)
})
