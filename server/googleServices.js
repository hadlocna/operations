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

    // 1. Get/Create Category Folder (e.g., "SPVs_AgriOps")
    const categoryFolderId = await getOrCreateFolder(drive, routingData.category, rootFolderId)

    // 2. Get/Create Company Folder (e.g., "AMANDEL")
    const companyFolderId = await getOrCreateFolder(drive, routingData.folderName, categoryFolderId)

    // 3. Get/Create Month Folder (e.g., "03 - March")
    const finalFolderId = await getOrCreateFolder(drive, monthFolder, companyFolderId)

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
        fields: 'id, webViewLink, parents'
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
            spaces: 'drive'
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
            fields: 'id'
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
export async function appendToSheet(auth, invoiceData, driveLink) {
    const sheets = google.sheets({ version: 'v4', auth })
    const spreadsheetId = process.env.GOOGLE_SHEET_ID

    // Format date for Sheet (DD-MMM-YYYY or ISO preferred by user?)
    // Using simple YYYY-MM-DD for now as per invoiceData
    const formattedDate = invoiceData.issue_date

    // Prepare row data
    const rowData = [
        invoiceData.routing.folderName || 'Unknown', // Company (Entity)
        invoiceData.supplier_name || '',   // Supplier
        invoiceData.invoice_number || '', // Invoice #
        formattedDate || '',              // Date
        invoiceData.description || '',    // Description
        invoiceData.total_amount || 0,    // Total
        invoiceData.currency || 'EUR',    // Currency
        driveLink || '',                  // PDF Link
        invoiceData.confidence || '',     // Confidence
        new Date().toISOString()          // Processed At
    ]

    try {
        const response = await sheets.spreadsheets.values.append({
            spreadsheetId,
            range: 'Sheet1!A:J', // Adjust if columns change
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
