import OpenAI from 'openai'
import { config } from 'dotenv'
import { Readable } from 'stream'

config()

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
})

// === COMPANY LISTS (Exact folder names from Drive) ===
const COMPANIES = {
    SPVS_AGRIOPS: [
        { match: ['SELVATAREFADA'], folder: 'SELVATAREFADA - UNIPESSOAL LDA' },
        { match: ['CALENDÁRIO VERDE', 'CALENDARIO VERDE'], folder: 'CALENDÁRIO VERDE - LDA' },
        { match: ['BINOMIAL DESTINY'], folder: 'BINOMIAL DESTINY, UNIPESSOAL, LDA' },
        { match: ['AMANDEL'], folder: 'AMANDEL UNIPESSOAL LDA' },
        { match: ['NSA', 'NOVOS SISTEMAS AGRÍCOLAS', 'NOVOS SISTEMAS AGRICOLAS'], folder: 'NSA - NOVOS SISTEMAS AGRÍCOLAS, LDA' },
        { match: ['FAUNOS COSMOPOLITAS'], folder: 'FAUNOS COSMOPOLITAS UNIPESSOAL, LDA' },
        { match: ['KLÖSTERS', 'KLOSTERS'], folder: 'KLÖSTERS PORTUGAL, UNIPESSOAL LDA' },
        { match: ['AGRILAGOON'], folder: 'AGRILAGOON, UNIPESSOAL LDA' }
    ],
    INTERNAL: [
        { match: ['YOUR OWN 2 FEET', 'YOUR OWN TWO FEET'], folder: 'Your Own 2 Feet' },
        { match: ['HEXAGONO CORAJOSO'], folder: 'HEXAGONO CORAJOSO LDA LDA' },
        { match: ['QUIOSQUE D\'ALEGRIA', 'QUIOSQUE D ALEGRIA', 'QUIOSQUE DALEGRIA'], folder: 'Quiosque D\'Alegria - Unipessoal Lda' },
        { match: ['IMPACTO PELA TERRA'], folder: 'IMPACTO PELA TERRA LDA' }
    ]
}

export async function processInvoice(fileBuffer, originalFilename) {
    try {
        // 1. Upload PDF to OpenAI Files API
        // Create a File-like object from the buffer for the OpenAI SDK
        const file = await openai.files.create({
            file: new File([fileBuffer], originalFilename, { type: 'application/pdf' }),
            purpose: 'assistants' // or 'user_data' depending on use case
        })

        console.log(`[OPENAI] File uploaded: ${file.id}`)

        // 2. Use the Responses API with the file
        // GPT-4o can directly process PDFs when passed as file input
        const response = await openai.responses.create({
            model: "gpt-4o",
            input: [
                {
                    role: "user",
                    content: [
                        {
                            type: "input_file",
                            file_id: file.id
                        },
                        {
                            type: "input_text",
                            text: `Analyze this document. Is it a vendor invoice? If yes, extract the following fields as JSON:
                            - is_invoice_document (boolean)
                            - invoice_number (string or null)
                            - issue_date (YYYY-MM-DD or null)
                            - total_amount (number or null): Amount INCL VAT
                            - amount_excl_vat (number or null): Amount BEFORE VAT
                            - vat_amount (number or null): The tax amount
                            - currency (string, e.g. EUR)
                            - supplier_name (string): The vendor/company issuing the invoice
                            - customer_name (string): The company being billed
                            - line_items_present (boolean): true if there are line items
                            - description (string): A short summary. MAX 5 WORDS
                            - notes (string): Any special terms, discounts, or flags
                            
                            If it's NOT an invoice, return: {"is_invoice_document": false, "reason": "brief explanation"}`
                        }
                    ]
                }
            ],
            text: {
                format: {
                    type: "json_schema",
                    name: "invoice_extraction",
                    strict: true,
                    schema: {
                        type: "object",
                        required: ["is_invoice_document", "reason", "invoice_number", "issue_date", "total_amount", "amount_excl_vat", "vat_amount", "currency", "supplier_name", "customer_name", "line_items_present", "description", "notes"],
                        properties: {
                            is_invoice_document: { type: "boolean" },
                            reason: { type: ["string", "null"] },
                            invoice_number: { type: ["string", "null"] },
                            issue_date: { type: ["string", "null"] },
                            total_amount: { type: ["number", "null"] },
                            amount_excl_vat: { type: ["number", "null"] },
                            vat_amount: { type: ["number", "null"] },
                            currency: { type: ["string", "null"] },
                            supplier_name: { type: ["string", "null"] },
                            customer_name: { type: ["string", "null"] },
                            line_items_present: { type: ["boolean", "null"] },
                            description: { type: ["string", "null"] },
                            notes: { type: ["string", "null"] }
                        },
                        additionalProperties: false
                    }
                }
            }
        })

        // 3. Parse the response
        const rawData = JSON.parse(response.output_text)

        // 4. Clean up - delete the uploaded file
        try {
            await openai.files.del(file.id)
            console.log(`[OPENAI] File deleted: ${file.id}`)
        } catch (delErr) {
            console.warn(`[OPENAI] Failed to delete file: ${delErr.message}`)
        }

        // 5. Validation - "3 of 5" Rule
        if (!rawData.is_invoice_document) {
            return { success: false, reason: rawData.reason || "Not identified as invoice" }
        }

        let matchCount = 0
        if (rawData.invoice_number) matchCount++
        if (rawData.issue_date) matchCount++
        if (rawData.supplier_name) matchCount++
        if (rawData.total_amount) matchCount++
        if (rawData.line_items_present) matchCount++

        if (matchCount < 3) {
            return { success: false, reason: `Failed 3-of-5 validation (${matchCount}/5 fields found)` }
        }

        // 6. Company Matching & Routing
        const routerResult = determineRouting(rawData.customer_name, rawData.supplier_name)

        return {
            success: true,
            data: {
                ...rawData,
                routing: routerResult,
                confidence: (matchCount / 5) * 100
            }
        }

    } catch (error) {
        console.error("AI Processing Error:", error)
        return { success: false, reason: `AI Processing Error: ${error.message}` }
    }
}

// === ROUTING LOGIC ===
function determineRouting(customerName, supplierName) {
    const normalize = (str) => {
        if (!str) return ''
        return str.toUpperCase()
            .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, "")
            .replace(/\s{2,}/g, " ")
            .trim()
    }

    const targetName = normalize(customerName) || normalize(supplierName)
    console.log(`[ROUTING] Matching "${targetName}" to company folders...`)

    // Check SPVs_AgriOps
    for (const company of COMPANIES.SPVS_AGRIOPS) {
        for (const pattern of company.match) {
            if (targetName.includes(normalize(pattern))) {
                console.log(`[ROUTING] Matched "${pattern}" → ${company.folder}`)
                return {
                    category: 'SPVs_AgriOps',
                    folderName: company.folder
                }
            }
        }
    }

    // Check Companies_Internal
    for (const company of COMPANIES.INTERNAL) {
        for (const pattern of company.match) {
            if (targetName.includes(normalize(pattern))) {
                console.log(`[ROUTING] Matched "${pattern}" → ${company.folder}`)
                return {
                    category: 'Companies_Internal',
                    folderName: company.folder
                }
            }
        }
    }

    // Default / Fallback - create a new folder
    console.log(`[ROUTING] No match found, using Unsorted`)
    return {
        category: 'Unsorted',
        folderName: targetName || 'Unknown_Entity'
    }
}
