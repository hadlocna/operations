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

import pdf2img from 'pdf-img-convert'

// ...

export async function processInvoice(fileBuffer, originalFilename) {
    try {
        // 1. Convert PDF to Images (PNG)
        // Returns an array of Uint8Array or Buffer
        const pngPages = await pdf2img.convert(fileBuffer, {
            width: 1536, // High resolution for readability
            height: 2048,
            page_numbers: [1, 2] // Limit to first 2 pages to save tokens/time
        })

        if (pngPages.length === 0) {
            return { success: false, reason: "Could not convert PDF to image" }
        }

        // Prepare content array for GPT-4o
        // Start with the system/user instruction prompt
        const content = [
            { type: "text", text: "Extract data from this invoice. If it is multi-page, treat it as a single document." }
        ]

        // Add each page as an image
        for (const pageBuffer of pngPages) {
            const base64Image = Buffer.from(pageBuffer).toString('base64')
            content.push({
                type: "image_url",
                image_url: {
                    url: `data:image/png;base64,${base64Image}`
                }
            })
        }

        // 2. Extract Data with GPT-4o
        const completion = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
                {
                    role: "system",
                    content: `You are an invoice processing assistant. 
                    Analyze the document images and extract the following JSON fields:
                    - is_invoice_document (boolean): true if it looks like an invoice/receipt
                    - invoice_number (string or null)
                    - issue_date (YYYY-MM-DD or null)
                    - total_amount (number or null): Amount INCL VAT. Look for "Total", "TOTAL", "Montante Total".
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
                    content: content
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
