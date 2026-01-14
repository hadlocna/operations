import OpenAI from 'openai'
import { config } from 'dotenv'

config()

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
})

/**
 * Classify if a document is an invoice
 * @param {Buffer} pdfBuffer - PDF file as buffer
 * @param {string} filename - Original filename
 * @returns {Object} Classification result with confidence
 */
export async function classifyDocument(pdfBuffer, filename) {
    // Convert PDF to base64 for vision API
    const base64Pdf = pdfBuffer.toString('base64')

    const response = await openai.chat.completions.create({
        model: 'gpt-5.2',
        messages: [
            {
                role: 'system',
                content: `You are an invoice detection system specialized in Portuguese invoices. 
Portuguese invoices (faturas) have mandatory elements:
- QR code (required by Portuguese tax authority since 2022)
- NIF (tax identification number)
- Invoice number format (e.g., FT 2025/001)
- VAT breakdown (IVA)

Classify whether this document is an invoice, credit note, tax payment, or other document.`
            },
            {
                role: 'user',
                content: [
                    {
                        type: 'text',
                        text: `Analyze this PDF document (filename: ${filename}). Is this a Portuguese invoice, credit note, tax payment document, or something else? Return JSON with:
{
  "isInvoice": boolean,
  "documentType": "invoice" | "credit_note" | "tax_payment" | "other",
  "confidence": 0-100,
  "hasQRCode": boolean,
  "reasoning": "brief explanation"
}`
                    },
                    {
                        type: 'image_url',
                        image_url: {
                            url: `data:application/pdf;base64,${base64Pdf}`
                        }
                    }
                ]
            }
        ],
        response_format: { type: 'json_object' },
        max_tokens: 500
    })

    return JSON.parse(response.choices[0].message.content)
}

/**
 * Extract all fields from an invoice
 * @param {Buffer} pdfBuffer - PDF file as buffer
 * @param {string} filename - Original filename
 * @returns {Object} Extracted invoice data
 */
export async function extractInvoiceData(pdfBuffer, filename) {
    const base64Pdf = pdfBuffer.toString('base64')

    const response = await openai.chat.completions.create({
        model: 'gpt-5.2',
        messages: [
            {
                role: 'system',
                content: `You are a Portuguese invoice data extraction system. Extract all relevant fields from invoices.

SPECIAL HANDLING RULES:
1. Credit Notes: All amounts should be NEGATIVE, add "CREDIT NOTE" to notes
2. Retenção na Fonte (Tax Withholding): 
   - amount_excl_vat = gross before withholding
   - amount_incl_vat = net after withholding
   - Add "Retenção na fonte: X%" to notes
3. Tax Payment Documents (Segurança Social, IRS, IMI):
   - supplier = Tax authority name
   - invoice_number = Document reference
   - vat_amount = 0.00
   - Add "Tax payment" to notes
4. Payment Discounts: Include discount terms in notes (e.g., "2% if paid within 15 days")

Date format: DD-MMM-YYYY (e.g., 10-JAN-2025)
Description: Maximum 5 words summarizing the invoice content`
            },
            {
                role: 'user',
                content: [
                    {
                        type: 'text',
                        text: `Extract all invoice data from this Portuguese invoice (filename: ${filename}). Return JSON:
{
  "company": "string - recipient entity name",
  "supplier": "string - vendor/supplier name",
  "invoice_number": "string - exact invoice number",
  "issue_date": "DD-MMM-YYYY format",
  "description": "max 5 words describing services/items",
  "amount_excl_vat": number,
  "vat_amount": number,
  "amount_incl_vat": number,
  "notes": "string - discounts, special terms, flags",
  "document_type": "invoice" | "credit_note" | "tax_payment",
  "supplier_nif": "string - supplier tax ID",
  "company_nif": "string - company tax ID",
  "has_qr_code": boolean,
  "currency": "EUR",
  "raw_line_items": [{"description": "string", "quantity": number, "unit_price": number, "total": number}]
}`
                    },
                    {
                        type: 'image_url',
                        image_url: {
                            url: `data:application/pdf;base64,${base64Pdf}`
                        }
                    }
                ]
            }
        ],
        response_format: { type: 'json_object' },
        max_tokens: 2000
    })

    return JSON.parse(response.choices[0].message.content)
}

/**
 * Process a complete invoice - classify and extract
 * @param {Buffer} pdfBuffer - PDF file as buffer
 * @param {string} filename - Original filename
 * @returns {Object} Complete processing result
 */
export async function processInvoice(pdfBuffer, filename) {
    // First classify the document
    const classification = await classifyDocument(pdfBuffer, filename)

    if (!classification.isInvoice && classification.documentType === 'other') {
        return {
            success: false,
            classification,
            data: null,
            message: 'Document is not an invoice'
        }
    }

    // Extract data if it's a valid document type
    const extractedData = await extractInvoiceData(pdfBuffer, filename)

    return {
        success: true,
        classification,
        data: extractedData,
        processedAt: new Date().toISOString()
    }
}
