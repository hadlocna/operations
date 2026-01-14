import { google } from 'googleapis'
import { config } from 'dotenv'

config()

/**
 * Upload a file to Google Drive
 * @param {Object} auth - OAuth2 client
 * @param {Buffer} fileBuffer - File buffer
 * @param {string} filename - File name
 * @param {string} company - Company name for folder routing
 * @param {string} invoiceDate - Invoice date for subfolder (YYYY-MM)
 * @returns {Object} Upload result with file ID and link
 */
export async function uploadToDrive(auth, fileBuffer, filename, company, invoiceDate) {
    const drive = google.drive({ version: 'v3', auth })

    // Parse date to get year-month
    const date = new Date(invoiceDate)
    const yearMonth = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`

    // Get or create company folder
    const companyFolder = await getOrCreateFolder(drive, company, process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID)

    // Get or create month subfolder
    const monthFolder = await getOrCreateFolder(drive, yearMonth, companyFolder.id)

    // Upload file
    const fileMetadata = {
        name: filename,
        parents: [monthFolder.id]
    }

    const media = {
        mimeType: 'application/pdf',
        body: Buffer.from(fileBuffer)
    }

    // Convert buffer to stream for upload
    const { Readable } = await import('stream')
    const stream = new Readable()
    stream.push(fileBuffer)
    stream.push(null)

    const file = await drive.files.create({
        resource: fileMetadata,
        media: {
            mimeType: 'application/pdf',
            body: stream
        },
        fields: 'id, webViewLink'
    })

    return {
        fileId: file.data.id,
        webViewLink: file.data.webViewLink,
        folderPath: `${company}/${yearMonth}/${filename}`
    }
}

/**
 * Get or create a folder in Drive
 */
async function getOrCreateFolder(drive, folderName, parentId) {
    // Search for existing folder
    const query = parentId
        ? `name='${folderName}' and mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false`
        : `name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`

    const response = await drive.files.list({
        q: query,
        fields: 'files(id, name)',
        spaces: 'drive'
    })

    if (response.data.files.length > 0) {
        return response.data.files[0]
    }

    // Create new folder
    const folderMetadata = {
        name: folderName,
        mimeType: 'application/vnd.google-apps.folder',
        parents: parentId ? [parentId] : []
    }

    const folder = await drive.files.create({
        resource: folderMetadata,
        fields: 'id, name'
    })

    return folder.data
}

/**
 * Append invoice data to Google Sheet
 * @param {Object} auth - OAuth2 client
 * @param {Object} invoiceData - Extracted invoice data
 * @param {string} driveLink - Link to the PDF in Drive
 * @returns {Object} Append result
 */
export async function appendToSheet(auth, invoiceData, driveLink) {
    const sheets = google.sheets({ version: 'v4', auth })
    const spreadsheetId = process.env.GOOGLE_SHEET_ID

    // Format date for sheet (DD-MMM-YYYY)
    const formattedDate = invoiceData.issue_date

    // Prepare row data based on PRD schema
    const rowData = [
        invoiceData.company || '',
        invoiceData.supplier || '',
        invoiceData.invoice_number || '',
        formattedDate || '',
        invoiceData.description || '',
        invoiceData.amount_excl_vat || 0,
        invoiceData.vat_amount || 0,
        invoiceData.amount_incl_vat || 0,
        driveLink || '',
        invoiceData.notes || ''
    ]

    const response = await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: 'Sheet1!A:J',
        valueInputOption: 'USER_ENTERED',
        insertDataOption: 'INSERT_ROWS',
        resource: {
            values: [rowData]
        }
    })

    return {
        updatedRange: response.data.updates.updatedRange,
        updatedRows: response.data.updates.updatedRows
    }
}

/**
 * Get folder structure from Drive
 */
export async function getFolderStructure(auth, parentId = null) {
    const drive = google.drive({ version: 'v3', auth })

    const folderId = parentId || process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID

    const response = await drive.files.list({
        q: `'${folderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
        fields: 'files(id, name)',
        orderBy: 'name'
    })

    return response.data.files
}
