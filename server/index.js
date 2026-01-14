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
    'https://www.googleapis.com/auth/drive.file',
    'https://www.googleapis.com/auth/spreadsheets'
]

// Initialize Supabase
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_KEY
)

// Helper: Get Tokens
async function getTokens() {
    const { data, error } = await supabase
        .from('system_tokens')
        .select('*')

    const tokens = { gmail: null, drive: null, sheets: null }
    if (data) {
        data.forEach(row => {
            if (tokens.hasOwnProperty(row.service_name)) {
                tokens[row.service_name] = row.token_json
            }
        })
    }
    return tokens
}

// Helper: Save Token
async function saveToken(service, token) {
    // Upsert token
    const { error } = await supabase
        .from('system_tokens')
        .upsert({ service_name: service, token_json: token }, { onConflict: 'service_name' })

    if (error) console.error(`Error saving ${service} token:`, error)
}

// Routes
app.get('/api/health', (req, res) => res.json({ status: 'ok', timestamp: new Date() }))

app.get('/api/status', async (req, res) => {
    const tokens = await getTokens()
    res.json({
        gmail: !!tokens.gmail,
        drive: !!tokens.drive,
        sheets: !!tokens.sheets
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

        // Save tokens for all services
        await saveToken('gmail', newTokens)
        await saveToken('drive', newTokens)
        await saveToken('sheets', newTokens)

        console.log('Tokens acquired and saved')
        res.redirect('/?oauth=success')
    } catch (error) {
        console.error('Error in auth callback:', error)
        res.redirect('/?error=auth_failed')
    }
})

app.post('/api/oauth/revoke', async (req, res) => {
    const { service } = req.body
    await saveToken(service, null)
    res.json({ success: true })
})

// Scan Endpoint
app.post('/api/scan', async (req, res) => {
    try {
        const tokens = await getTokens()
        if (!tokens.gmail) return res.status(401).json({ error: 'Gmail not connected' })

        const gmailAuth = new google.auth.OAuth2()
        gmailAuth.setCredentials(tokens.gmail)
        const gmail = google.gmail({ version: 'v1', auth: gmailAuth })

        const { dateFrom } = req.body
        const query = dateFrom
            ? `has:attachment filename:pdf after:${new Date(dateFrom).getTime() / 1000}`
            : 'has:attachment filename:pdf newer_than:1d'

        console.log(`Scanning emails with query: ${query}`)

        const response = await gmail.users.messages.list({
            userId: 'me',
            q: query
        })

        const messages = response.data.messages || []
        const results = []
        console.log(`Found ${messages.length} messages to scan...`)

        const BATCH_SIZE = 3
        for (let i = 0; i < messages.length; i += BATCH_SIZE) {
            const batch = messages.slice(i, i + BATCH_SIZE)
            await Promise.all(batch.map(msg => processMessage(gmail, msg, results, tokens)))
        }

        async function processMessage(gmail, msg, results, tokens) {
            try {
                const message = await gmail.users.messages.get({ userId: 'me', id: msg.id })
                const parts = message.data.payload.parts || []
                const pdfPart = parts.find(p => p.mimeType === 'application/pdf' && p.filename)

                if (pdfPart && pdfPart.body.attachmentId) {
                    const attachment = await gmail.users.messages.attachments.get({
                        userId: 'me',
                        messageId: msg.id,
                        id: pdfPart.body.attachmentId
                    })

                    const filename = pdfPart.filename
                    const pdfBuffer = Buffer.from(attachment.data.data, 'base64')
                    console.log(`Processing attachment: ${filename}`)

                    const processingResult = await processInvoice(pdfBuffer, filename)

                    if (processingResult.success) {
                        const invoiceData = processingResult.data

                        // Upload Drive
                        const driveAuth = new google.auth.OAuth2()
                        driveAuth.setCredentials(tokens.drive)
                        const driveResult = await uploadToDrive(driveAuth, pdfBuffer, filename, invoiceData.company || 'Unknown', invoiceData.issue_date)

                        // Sheets
                        const sheetsAuth = new google.auth.OAuth2()
                        sheetsAuth.setCredentials(tokens.sheets)
                        await appendToSheet(sheetsAuth, invoiceData, driveResult.webViewLink)

                        results.push({
                            status: 'success',
                            id: invoiceData.invoice_number,
                            supplier: invoiceData.supplier,
                            amount: invoiceData.amount_incl_vat,
                            date: invoiceData.issue_date,
                            fileLink: driveResult.webViewLink
                        })
                    } else {
                        results.push({ status: 'skipped', reason: 'Not an invoice', filename })
                    }
                }
            } catch (err) {
                console.error(`Error processing message ${msg.id}:`, err)
                results.push({ status: 'error', messageId: msg.id, error: err.message })
            }
        }

        res.json({
            success: true,
            processed: results.filter(r => r.status === 'success'),
            skipped: results.filter(r => r.status === 'skipped'),
            errors: results.filter(r => r.status === 'error')
        })

    } catch (error) {
        console.error('Scan error:', error)
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
