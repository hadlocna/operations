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

    return data ? { google: data.token_json } : { google: null }
}

// Helper: Save Token
async function saveToken(service, token) {
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

        // Fetch Tokens
        const tokenContainer = await getTokens()
        const googleToken = tokenContainer.google

        if (!googleToken) {
            sendEvent({ type: 'error', message: 'Google Account not connected.' })
            return res.end()
        }

        const auth = new google.auth.OAuth2()
        auth.setCredentials(googleToken)
        const gmail = google.gmail({ version: 'v1', auth })

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
            await processMessage(gmail, msg, results, googleToken, sendEvent)
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
        console.error('Scan Error:', error)
        sendEvent({ type: 'error', message: `Critical Scan Fail: ${error.message}` })
        res.end()
    }
})


async function processMessage(gmail, msg, results, googleToken, sendEvent) {
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

                // Upload Drive (Reuse auth)
                const driveAuth = new google.auth.OAuth2()
                driveAuth.setCredentials(googleToken)

                sendEvent({ type: 'log', message: `   Uploading to Drive...` })
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

                sendEvent({ type: 'log', message: `   Appending to Sheets...` })
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
