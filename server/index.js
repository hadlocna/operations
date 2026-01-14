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
    'https://www.googleapis.com/auth/spreadsheets'
]

// Initialize Supabase
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_KEY
)

// Helper: Get Tokens (Consolidated)
async function getTokens() {
    const { data, error } = await supabase
        .from('system_tokens')
        .select('*')
        .eq('service_name', 'google')
        .single()

    // Return unified object for compatibility or just the raw token
    return data ? { google: data.token_json } : { google: null }
}

// Helper: Save Token
async function saveToken(service, token) {
    // Upsert token
    const { error } = await supabase
        .from('system_tokens')
        .upsert({ service_name: service, token_json: token }, { onConflict: 'service_name' })

    if (error) console.error(`Error saving ${service} token:`, error)
}

// Helper: Delete Token
async function deleteToken(service) {
    const { error } = await supabase
        .from('system_tokens')
        .delete()
        .eq('service_name', service)

    if (error) console.error(`Error deleting ${service} token:`, error)
}

// Routes
app.get('/api/health', (req, res) => res.json({ status: 'ok', timestamp: new Date() }))

app.get('/api/status', async (req, res) => {
    const tokens = await getTokens()
    res.json({
        connected: !!tokens.google
    })
})

const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
)

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

        // Save single token for all services
        await saveToken('google', newTokens)

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

// Scan Endpoint
app.post('/api/scan', async (req, res) => {
    try {
        // Fetch the single master token
        const tokenContainer = await getTokens()
        const googleToken = tokenContainer.google

        if (!googleToken) return res.status(401).json({ error: 'Google Account not connected' })

        // Re-use same credentials for all clients
        const auth = new google.auth.OAuth2()
        auth.setCredentials(googleToken)

        const gmail = google.gmail({ version: 'v1', auth })

        const { dateFrom } = req.body
        const query = dateFrom
            ? `has:attachment filename:pdf after:${new Date(dateFrom).getTime() / 1000}`
            : 'has:attachment filename:pdf newer_than:1d'

        console.log(`[SCAN_INIT] Starting scan with query: "${query}"`)

        const response = await gmail.users.messages.list({
            userId: 'me',
            q: query
        })

        const messages = response.data.messages || []
        const results = []
        console.log(`[SCAN_FOUND] Found ${messages.length} potential email matches.`)

        if (messages.length === 0) {
            console.log('[SCAN_INFO] No messages found matching query.')
        }

        const BATCH_SIZE = 3
        for (let i = 0; i < messages.length; i += BATCH_SIZE) {
            const batch = messages.slice(i, i + BATCH_SIZE)
            await Promise.all(batch.map(msg => processMessage(gmail, msg, results, googleToken)))
        }

        async function processMessage(gmail, msg, results, googleToken) {
            try {
                const message = await gmail.users.messages.get({ userId: 'me', id: msg.id })
                const parts = message.data.payload.parts || []

                // Detailed debug for attachments
                console.log(`[MSG_DEBUG] ID: ${msg.id}, Parts: ${parts.length}`)

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
                    const attachment = await gmail.users.messages.attachments.get({
                        userId: 'me',
                        messageId: msg.id,
                        id: pdfPart.body.attachmentId
                    })

                    const filename = pdfPart.filename
                    const pdfBuffer = Buffer.from(attachment.data.data, 'base64')
                    console.log(`[PROC_START] Processing attachment: ${filename}`)

                    const processingResult = await processInvoice(pdfBuffer, filename)

                    if (processingResult.success) {
                        const invoiceData = processingResult.data
                        console.log(`[PROC_SUCCESS] Identified Invoice: ${invoiceData.invoice_number} from ${invoiceData.supplier_name}`)

                        // Upload Drive (Reuse auth)
                        const driveAuth = new google.auth.OAuth2()
                        driveAuth.setCredentials(googleToken)

                        const driveResult = await uploadToDrive(
                            driveAuth,
                            pdfBuffer,
                            filename,
                            invoiceData.routing,
                            invoiceData.issue_date
                        )

                        // Sheets (Reuse auth)
                        const sheetsAuth = new google.auth.OAuth2()
                        sheetsAuth.setCredentials(googleToken)

                        await appendToSheet(sheetsAuth, invoiceData, driveResult.webViewLink)

                        results.push({
                            status: 'success',
                            id: invoiceData.invoice_number,
                            supplier: invoiceData.supplier_name,
                            amount: invoiceData.total_amount,
                            date: invoiceData.issue_date,
                            fileLink: driveResult.webViewLink
                        })
                    } else {
                        console.log(`[PROC_SKIP] Document skipped. Reason: ${processingResult.reason}`)
                        results.push({ status: 'skipped', reason: processingResult.reason, filename })
                    }
                } else {
                    console.log(`[MSG_SKIP] No PDF attachment found in message ${msg.id}`)
                }
            } catch (err) {
                console.error(`[PROC_ERROR] Error processing message ${msg.id}:`, err)
                results.push({ status: 'error', messageId: msg.id, error: err.message })
            }
        }

        res.json({
            success: true,
            processed: results.filter(r => r.status === 'success'),
            skipped: results.filter(r => r.status === 'skipped'),
            errors: results.filter(r => r.status === 'error'),
            debug: { query, totalFound: messages.length }
        })

    } catch (error) {
        console.error('[SCAN_CRITICAL] Scan execution failed:', error)
        res.status(500).json({ error: 'Scan failed' })
    }
})

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
