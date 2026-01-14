import express from 'express'
import cors from 'cors'
import { config } from 'dotenv'
import { google } from 'googleapis'

config()

const app = express()
const PORT = process.env.PORT || 3001

// Middleware
app.use(cors({ origin: 'http://localhost:5173', credentials: true }))
app.use(express.json())

// Store tokens in memory (in production, use a database)
const tokens = {
    gmail: null,
    drive: null,
    sheets: null
}

// OAuth2 Client
const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
)

// Scopes for Gmail, Drive, and Sheets
const SCOPES = [
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/drive.file',
    'https://www.googleapis.com/auth/spreadsheets'
]

// ==================== ROUTES ====================

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// Get OAuth status
app.get('/api/oauth/status', (req, res) => {
    res.json({
        gmail: !!tokens.gmail,
        drive: !!tokens.drive,
        sheets: !!tokens.sheets
    })
})

// Initiate OAuth flow
app.get('/auth/google', (req, res) => {
    const authUrl = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: SCOPES,
        prompt: 'consent'
    })
    res.redirect(authUrl)
})

// OAuth callback
app.get('/auth/google/callback', async (req, res) => {
    const { code } = req.query

    try {
        const { tokens: newTokens } = await oauth2Client.getToken(code)
        oauth2Client.setCredentials(newTokens)

        // Store tokens for all services
        tokens.gmail = newTokens
        tokens.drive = newTokens
        tokens.sheets = newTokens

        console.log('OAuth tokens received and stored')

        // Redirect back to frontend
        res.redirect('http://localhost:5173?oauth=success')
    } catch (error) {
        console.error('OAuth error:', error)
        res.redirect('http://localhost:5173?oauth=error')
    }
})

// Revoke OAuth
app.post('/api/oauth/revoke', (req, res) => {
    const { service } = req.body
    if (service && tokens[service]) {
        tokens[service] = null
        res.json({ success: true, message: `${service} disconnected` })
    } else {
        res.status(400).json({ success: false, message: 'Invalid service' })
    }
})

// Get emails with attachments
app.get('/api/emails', async (req, res) => {
    if (!tokens.gmail) {
        return res.status(401).json({ error: 'Gmail not connected' })
    }

    try {
        oauth2Client.setCredentials(tokens.gmail)
        const gmail = google.gmail({ version: 'v1', auth: oauth2Client })

        const { dateFrom, dateTo } = req.query
        let query = 'has:attachment filename:pdf'

        if (dateFrom) query += ` after:${dateFrom}`
        if (dateTo) query += ` before:${dateTo}`

        const response = await gmail.users.messages.list({
            userId: 'me',
            q: query,
            maxResults: 50
        })

        const messages = response.data.messages || []

        // Get details for each message
        const emailDetails = await Promise.all(
            messages.slice(0, 20).map(async (msg) => {
                const detail = await gmail.users.messages.get({
                    userId: 'me',
                    id: msg.id,
                    format: 'metadata',
                    metadataHeaders: ['From', 'Subject', 'Date']
                })

                const headers = detail.data.payload.headers
                return {
                    id: msg.id,
                    from: headers.find(h => h.name === 'From')?.value || '',
                    subject: headers.find(h => h.name === 'Subject')?.value || '',
                    date: headers.find(h => h.name === 'Date')?.value || '',
                    hasAttachment: true
                }
            })
        )

        res.json({ emails: emailDetails, total: messages.length })
    } catch (error) {
        console.error('Gmail API error:', error)
        res.status(500).json({ error: 'Failed to fetch emails' })
    }
})

// Scan trigger endpoint (placeholder for invoice processing)
app.post('/api/scan', async (req, res) => {
    if (!tokens.gmail) {
        return res.status(401).json({ error: 'Gmail not connected' })
    }

    // TODO: Implement actual scanning logic
    res.json({
        success: true,
        message: 'Scan initiated',
        scannedAt: new Date().toISOString()
    })
})

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`)
    console.log(`📧 OAuth callback: ${process.env.GOOGLE_REDIRECT_URI}`)
})
