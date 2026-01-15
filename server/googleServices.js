import { google } from 'googleapis'
import { config } from 'dotenv'
import { Readable } from 'stream'

config()

/**
 * Upload a file to Google Drive with dynamic routing
 * @param {Object} auth - OAuth2 client
 * @param {Buffer} fileBuffer - File buffer
 * @param {string} filename - File name
 * @param {Object} routingData - Routing info { category, folderName }
 * @param {string} issueDate - Invoice date for subfolder
 * @returns {Object} Upload result with file ID and link
 */
export async function uploadToDrive(auth, fileBuffer, filename, routingData, issueDate) {
    const drive = google.drive({ version: 'v3', auth })

    // Parse Date for Month Folder
    // Format: "MM - MonthName" (e.g., "03 - March")
    const dateObj = issueDate ? new Date(issueDate) : new Date()
    const monthNum = String(dateObj.getMonth() + 1).padStart(2, '0')
    const monthName = dateObj.toLocaleString('default', { month: 'long' })
    const monthFolder = `${monthNum} - ${monthName}`

    const rootFolderId = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID

    if (!rootFolderId) {
        throw new Error('GOOGLE_DRIVE_ROOT_FOLDER_ID environment variable is not set')
    }

    console.log(`[DRIVE] Starting upload. Root: ${rootFolderId}, Category: ${routingData.category}, Company: ${routingData.folderName}, Month: ${monthFolder}`)

    // 1. Get/Create Category Folder (e.g., "SPVs_AgriOps")
    const categoryFolderId = await getOrCreateFolder(drive, routingData.category, rootFolderId)
    console.log(`[DRIVE] Category folder: ${categoryFolderId}`)

    // 2. Get/Create Company Folder (e.g., "AMANDEL")
    const companyFolderId = await getOrCreateFolder(drive, routingData.folderName, categoryFolderId)
    console.log(`[DRIVE] Company folder: ${companyFolderId}`)

    // 3. Get/Create Month Folder (e.g., "03 - March")
    const finalFolderId = await getOrCreateFolder(drive, monthFolder, companyFolderId)
    console.log(`[DRIVE] Month folder: ${finalFolderId}`)

    // 4. Upload File
    const fileMetadata = {
        name: filename,
        parents: [finalFolderId]
    }

    const media = {
        mimeType: 'application/pdf',
        body: Readable.from(fileBuffer)
    }

    const file = await drive.files.create({
        resource: fileMetadata,
        media: media,
        fields: 'id, webViewLink, parents',
        supportsAllDrives: true
    })

    return {
        fileId: file.data.id,
        webViewLink: file.data.webViewLink,
        folderPath: `${routingData.category}/${routingData.folderName}/${monthFolder}/${filename}`,
        finalFolderId: finalFolderId
    }
}

/**
 * Get or create a folder in Drive
 */
async function getOrCreateFolder(drive, folderName, parentId) {
    if (!parentId) {
        throw new Error('Parent Folder ID is required for ' + folderName)
    }

    // Search for existing folder
    const query = `name='${folderName}' and mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false`

    try {
        const response = await drive.files.list({
            q: query,
            fields: 'files(id, name)',
            spaces: 'drive',
            supportsAllDrives: true,
            includeItemsFromAllDrives: true
        })

        if (response.data.files.length > 0) {
            return response.data.files[0].id
        }

        // Create new folder
        const folderMetadata = {
            name: folderName,
            mimeType: 'application/vnd.google-apps.folder',
            parents: [parentId]
        }

        const folder = await drive.files.create({
            resource: folderMetadata,
            fields: 'id',
            supportsAllDrives: true
        })

        return folder.data.id
    } catch (e) {
        console.error(`Error finding/creating folder ${folderName}:`, e)
        throw e
    }
}

/**
 * Append invoice data to Google Sheet
 */
export async function appendToSheet(auth, invoiceData, driveLink, senderEmail) {
    const sheets = google.sheets({ version: 'v4', auth })
    const spreadsheetId = process.env.GOOGLE_SHEET_ID

    // Format date: YYYY-MM-DD -> DD-MMM-YYYY (e.g. 14-Jan-2025)
    let formattedDate = ''
    if (invoiceData.issue_date) {
        const d = new Date(invoiceData.issue_date)
        const day = String(d.getDate()).padStart(2, '0')
        const month = d.toLocaleString('default', { month: 'short' })
        const year = d.getFullYear()
        formattedDate = `${day}-${month}-${year}`
    }

    // Prepare row data (Columns A-K)
    const rowData = [
        invoiceData.routing.folderName || 'Unknown',      // A: Company
        invoiceData.supplier_name || '',                  // B: Supplier
        invoiceData.invoice_number || '',                 // C: Invoice #
        formattedDate || '',                              // D: Issue Date
        (invoiceData.description || '').split(' ').slice(0, 5).join(' '), // E: Description (Max 5 words)
        invoiceData.amount_excl_vat || 0,                 // F: Excl VAT
        invoiceData.vat_amount || 0,                      // G: VAT Amount
        invoiceData.total_amount || 0,                    // H: Incl VAT
        driveLink || '',                                  // I: Invoice Link
        invoiceData.notes || '',                          // J: Notes
        senderEmail || ''                                 // K: Sender Email
    ]

    try {
        const response = await sheets.spreadsheets.values.append({
            spreadsheetId,
            range: 'Sheet1!A3:J', // Append starting from A3 (implies headers in 1-2)
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
    } catch (e) {
        console.error('Sheet Append Error:', e)
        // Don't fail the whole process if sheet fails
        return { error: e.message }
    }
}

/**
 * Check if invoice number already exists in Google Sheet (Column C)
 */
export async function checkIfInvoiceExists(auth, invoiceNumber) {
    if (!invoiceNumber) return false // Cannot check without number

    // Normalize string for comparison
    const target = String(invoiceNumber).trim().toLowerCase()

    try {
        const sheets = google.sheets({ version: 'v4', auth })
        const spreadsheetId = process.env.GOOGLE_SHEET_ID

        // Fetch Column C (Invoice Numbers)
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range: 'Sheet1!C:C',
        })

        const rows = response.data.values || []
        // Flatten and search
        const exists = rows.flat().some(cell => String(cell).trim().toLowerCase() === target)

        return exists
    } catch (e) {
        console.error('Duplicate Check Error:', e.message)
        return false // Fail open (don't block if check fails)
    }
}
