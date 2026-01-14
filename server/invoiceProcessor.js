import OpenAI from 'openai'
import { config } from 'dotenv'

config()

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
})

// === COMPANY LISTS ===
const COMPANIES = {
    SPVS_AGRIOPS: [
        'SELVATAREFADA',
        'CALENDÁRIO VERDE',
        'BINOMIAL DESTINY',
        'AMANDEL',
        'NSA',
        'NOVOS SISTEMAS AGRÍCOLAS',
        'FAUNOS COSMOPOLITAS',
        'KLÖSTERS PORTUGAL',
        'AGRILAGOON'
    ],
    INTERNAL: [
        'YOUR OWN 2 FEET',
        'HEXAGONO CORAJOSO',
        "QUIOSQUE D'ALEGRIA",
        'QUIOSQUE D ALEGRIA', // Variant
        'IMPACTO PELA TERRA'
    ]
}

export async function processInvoice(fileBuffer, originalFilename) {
    try {
        const base64Image = fileBuffer.toString('base64')

        // 1. Extract Data with GPT-4o
        const completion = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
                {
                    role: "system",
                    content: `You are an invoice processing assistant. 
                    Analyze the document and extract the following JSON fields:
                    - is_invoice_document (boolean): true if it looks like an invoice/receipt
                    - invoice_number (string or null)
                    - issue_date (YYYY-MM-DD or null)
                    - total_amount (number or null): Amount INCL VAT
                    - amount_excl_vat (number or null): Amount BEFORE VAT
                    - vat_amount (number or null): The tax amount
                    - currency (string, e.g. EUR)
                    - supplier_name (string): The vendor/company issuing the invoice.
                    - customer_name (string): The company being billed.
                    - line_items_present (boolean): true if there are line items.
                    - description (string): A short summary of services/items. MAX 5 WORDS.
                    - notes (string): Any special terms, discounts, or flags.
                    `
                },
                {
                    role: "user",
                    content: [
                        { type: "text", text: "Extract data from this invoice." },
                        { type: "image_url", image_url: { url: `data:image/jpeg;base64,${base64Image}` } }
                    ]
                }
            ],
            response_format: { type: "json_object" }
        })

        const rawData = JSON.parse(completion.choices[0].message.content)

        // 2. "3 of 5" Validation Rule
        let matchCount = 0
        if (rawData.invoice_number) matchCount++
        if (rawData.issue_date) matchCount++
        if (rawData.supplier_name) matchCount++
        if (rawData.total_amount) matchCount++
        if (rawData.line_items_present) matchCount++

        // Also check boolean flag from LLM
        if (matchCount < 3 && !rawData.is_invoice_document) {
            return { success: false, reason: "Failed 3-of-5 validation rule" }
        }

        // 3. Company Matching & Routing
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
    // We primarily route based on the CUSTOMER (Who is paying?), 
    // but sometimes the specification implies matching the Entity name found on the doc.
    // Assuming "Company Name Matching" refers to the entity IN the system (Pela Terra's SPVs).

    // Normalize string helper
    const normalize = (str) => {
        if (!str) return ''
        return str.toUpperCase()
            .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, "") // Remove punctuation
            .replace(/\s{2,}/g, " ") // Remove double spaces
            .replace(/\s(LDA|UNIPESSOAL|SA|LIMITADA)$/, "") // Remove suffixes
            .trim()
    }

    const targetName = normalize(customerName) || normalize(supplierName) // Fallback

    // Check SPVs
    for (const company of COMPANIES.SPVS_AGRIOPS) {
        if (targetName.includes(normalize(company))) {
            return {
                category: 'SPVs_AgriOps',
                folderName: company // Use canonical name
            }
        }
    }

    // Check Internal
    for (const company of COMPANIES.INTERNAL) {
        if (targetName.includes(normalize(company))) {
            return {
                category: 'Companies_Internal',
                folderName: company // Use canonical name
            }
        }
    }

    // Default / Fallback
    return {
        category: 'Unsorted',
        folderName: targetName || 'Unknown_Entity'
    }
}
