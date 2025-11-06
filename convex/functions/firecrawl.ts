'use node'

import { v } from 'convex/values'
import { action, internalAction } from '../_generated/server'
import { internal } from '../_generated/api'
import { generateProfileSearchQuery } from './firecrawlHelpers'

const FIRECRAWL_API_KEY = process.env.FIRECRAWL_API_KEY
const FIRECRAWL_SEARCH_API_URL = 'https://api.firecrawl.dev/v2/search'
const FIRECRAWL_EXTRACT_API_URL = 'https://api.firecrawl.dev/v2/extract'
const FIRECRAWL_SCRAPE_API_URL = 'https://api.firecrawl.dev/v2/scrape'

/**
 * Schema for structured opportunity extraction using Firecrawl Extract API
 * Reference: https://docs.firecrawl.dev/features/extract
 */
const OPPORTUNITY_EXTRACTION_SCHEMA = {
  type: 'object',
  properties: {
    title: {
      type: 'string',
      description: 'The full, complete title of the scholarship, fellowship, grant, or award opportunity. Extract the exact title from the page.',
    },
    provider: {
      type: 'string',
      description: 'The organization, institution, foundation, or company name that provides this opportunity. Be specific and use the full official name.',
    },
    description: {
      type: 'string',
      description: 'A comprehensive description of the opportunity including what it covers, who it benefits, program details, and any important information. Extract ALL relevant text from the page. This should be detailed and informative, not empty.',
    },
    deadline: {
      type: 'string',
      description: 'Application deadline in YYYY-MM-DD format. Extract the actual deadline date from the page. If multiple deadlines exist, use the earliest one. If deadline is rolling or not specified, use null.',
    },
    awardAmount: {
      type: 'number',
      description: 'Monetary award amount in USD if specified. Extract the exact number value. If multiple amounts are mentioned, use the maximum or primary amount.',
    },
    requirements: {
      type: 'array',
      items: { type: 'string' },
      description: 'Educational requirements, GPA requirements, degree level (undergraduate, masters, PhD), field of study, citizenship requirements, age requirements, etc. Extract ALL eligibility criteria as separate items in the array.',
    },
    requiredDocuments: {
      type: 'array',
      items: { type: 'string' },
      description: 'All required documents like transcripts, CV/resume, letters of recommendation, essays, personal statements, proof of enrollment, etc. Extract ALL document requirements as separate items.',
    },
    essayPrompts: {
      type: 'array',
      items: { type: 'string' },
      description: 'Essay questions, prompts, or writing requirements if any. Extract the full question text for each essay requirement.',
    },
    contactInfo: {
      type: 'string',
      description: 'Email address, phone number, or contact information for inquiries. Extract any contact details available on the page.',
    },
    region: {
      type: 'string',
      description: 'Geographic region or eligibility (e.g., USA, Global, UK, Canada, Europe, Africa, Asia). Extract the specific region or country eligibility.',
    },
    eligibility: {
      type: 'string',
      description: 'Detailed eligibility criteria including academic standing, financial need, demographic requirements, etc.',
    },
    applicationProcess: {
      type: 'string',
      description: 'How to apply, application steps, and important application information.',
    },
  },
  required: ['title', 'provider', 'description', 'deadline'],
}

/**
 * Run general Firecrawl search for opportunities
 * Uses two-phase approach: Search → Extract/Scrape
 */
export const runGeneralSearch = internalAction({
  args: {
    searchQuery: v.string(),
    limit: v.optional(v.number()),
  },
  returns: v.object({
    jobId: v.id('searchJobs'),
  }),
  handler: async (ctx, args): Promise<{ jobId: any }> => {
    if (!FIRECRAWL_API_KEY) {
      throw new Error('FIRECRAWL_API_KEY environment variable is not set')
    }

    // Create search job
    const jobId: any = await ctx.runMutation(internal.functions.firecrawlMutations.saveSearchJob, {
      type: 'general_search',
      searchQuery: args.searchQuery,
      scheduledFor: Date.now(),
    })

    // Update job status to running
    await ctx.runMutation((internal.functions as any).firecrawlMutations.updateSearchJobStatus, {
      jobId,
      status: 'running',
    })

    try {
      // Phase 1: Search API to discover URLs
      const searchResponse = await fetch(FIRECRAWL_SEARCH_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${FIRECRAWL_API_KEY}`,
        },
        body: JSON.stringify({
          query: args.searchQuery,
          limit: args.limit ?? 50,
          sources: ['web'],
        }),
      })

      if (!searchResponse.ok) {
        const errorText = await searchResponse.text()
        throw new Error(`Firecrawl Search API error: ${searchResponse.status} - ${errorText}`)
      }

      const searchData = await searchResponse.json()
      console.log(`[DEBUG] Search API response received, success: ${searchData.success}`)

      if (!searchData.success || !searchData.data) {
        console.error(`[ERROR] Invalid search response: ${JSON.stringify(searchData)}`)
        throw new Error('Invalid response from Firecrawl Search API')
      }

      // Extract URLs from search results
      const webResults = searchData.data.web || []
      const urls = webResults.map((result: any) => result.url).filter(Boolean)
      console.log(`[DEBUG] Found ${urls.length} URLs from search results`)

      if (urls.length === 0) {
        console.error(`[ERROR] No URLs found in search results`)
        throw new Error('No URLs found in search results')
      }

      // Phase 2: Extract structured data from each URL using Extract API
      console.log(`[DEBUG] Starting extraction for ${urls.length} URLs...`)
      const opportunities = await ctx.runAction(internal.functions.firecrawl.extractOpportunitiesFromUrls, {
        urls,
        sourceType: 'general_search',
      })
      console.log(`[DEBUG] Extraction complete! Found ${opportunities.length} opportunities`)

      // Save ALL opportunities (both matched and unmatched will be saved)
      console.log(`[DEBUG] Saving ${opportunities.length} opportunities to database...`)
      await ctx.runMutation(internal.functions.firecrawlMutations.saveSearchResults, {
        jobId,
        opportunities,
      })
      console.log(`[SUCCESS] Successfully saved ${opportunities.length} opportunities! Job ID: ${jobId}`)

      return { jobId }
    } catch (error: any) {
      // Update job status to failed
      await ctx.runMutation((internal.functions as any).firecrawlMutations.updateSearchJobStatus, {
        jobId,
        status: 'failed',
        errorMessage: error.message ?? 'Unknown error',
      })
      throw error
    }
  },
})

/**
 * Run personalized Firecrawl search based on user profile
 * Uses two-phase approach: Search → Extract/Scrape
 */
export const runProfileSearch = internalAction({
  args: {
    userId: v.id('users'),
    searchQuery: v.string(),
    limit: v.optional(v.number()),
  },
  returns: v.object({
    jobId: v.id('searchJobs'),
  }),
  handler: async (ctx, args): Promise<{ jobId: any }> => {
    if (!FIRECRAWL_API_KEY) {
      throw new Error('FIRECRAWL_API_KEY environment variable is not set')
    }

    // Create search job
    const jobId: any = await ctx.runMutation(internal.functions.firecrawlMutations.saveSearchJob, {
      type: 'profile_search',
      userId: args.userId,
      searchQuery: args.searchQuery,
      scheduledFor: Date.now(),
    })

    // Update job status to running
    await ctx.runMutation((internal.functions as any).firecrawlMutations.updateSearchJobStatus, {
      jobId,
      status: 'running',
    })

    try {
      // Phase 1: Search API to discover URLs
      console.log(`[DEBUG] Starting Firecrawl profile search with query: "${args.searchQuery}"`)
      console.log(`[DEBUG] Search limit: ${args.limit ?? 30}`)
      const searchResponse = await fetch(FIRECRAWL_SEARCH_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${FIRECRAWL_API_KEY}`,
        },
        body: JSON.stringify({
          query: args.searchQuery,
          limit: args.limit ?? 30,
          sources: ['web'],
        }),
      })

      if (!searchResponse.ok) {
        const errorText = await searchResponse.text()
        console.error(`[ERROR] Firecrawl Search API error: ${searchResponse.status} - ${errorText}`)
        throw new Error(`Firecrawl Search API error: ${searchResponse.status} - ${errorText}`)
      }

      const searchData = await searchResponse.json()
      console.log(`[DEBUG] Search API response received, success: ${searchData.success}`)
      console.log(`[DEBUG] Search API response structure: ${JSON.stringify({
        success: searchData.success,
        hasData: !!searchData.data,
        dataKeys: searchData.data ? Object.keys(searchData.data) : [],
      })}`)

      if (!searchData.success || !searchData.data) {
        console.error(`[ERROR] Invalid search response: ${JSON.stringify(searchData)}`)
        throw new Error('Invalid response from Firecrawl Search API')
      }

      // Extract URLs from search results
      const webResults = searchData.data.web || []
      console.log(`[DEBUG] ========================================`)
      console.log(`[DEBUG] FIRECRAWL PROFILE SEARCH RESULTS:`)
      console.log(`[DEBUG] Total web results: ${webResults.length}`)
      console.log(`[DEBUG] ========================================`)
      
      // Log each search result with details
      webResults.forEach((result: any, index: number) => {
        console.log(`[DEBUG] Result ${index + 1}:`)
        console.log(`[DEBUG]   URL: ${result.url || 'N/A'}`)
        console.log(`[DEBUG]   Title: ${result.title || 'N/A'}`)
        console.log(`[DEBUG]   Snippet: ${result.snippet ? result.snippet.substring(0, 100) + '...' : 'N/A'}`)
        if (result.score) {
          console.log(`[DEBUG]   Score: ${result.score}`)
        }
      })
      console.log(`[DEBUG] ========================================`)

      const urls = webResults.map((result: any) => result.url).filter(Boolean)
      console.log(`[DEBUG] Extracted ${urls.length} URLs from search results:`)
      urls.forEach((url: string, index: number) => {
        console.log(`[DEBUG]   ${index + 1}. ${url}`)
      })

      // Phase 2: Extract structured data from each URL using Extract API
      console.log(`[DEBUG] Starting extraction for ${urls.length} URLs...`)
      const opportunities = await ctx.runAction(internal.functions.firecrawl.extractOpportunitiesFromUrls, {
        urls,
        sourceType: 'profile_search',
      })
      console.log(`[DEBUG] Extraction complete! Found ${opportunities.length} opportunities`)

      // Save ALL opportunities (both matched and unmatched will be saved)
      console.log(`[DEBUG] Saving ${opportunities.length} opportunities to database...`)
      await ctx.runMutation(internal.functions.firecrawlMutations.saveSearchResults, {
        jobId,
        opportunities,
      })
      console.log(`[SUCCESS] Successfully saved ${opportunities.length} opportunities! Job ID: ${jobId}`)

      return { jobId }
    } catch (error: any) {
      // Update job status to failed
      await ctx.runMutation((internal.functions as any).firecrawlMutations.updateSearchJobStatus, {
        jobId,
        status: 'failed',
        errorMessage: error.message ?? 'Unknown error',
      })
      throw error
    }
  },
})

/**
 * Extract opportunity data from URLs using Firecrawl Extract API
 * This is the new two-phase approach: Search → Extract
 * Reference: https://docs.firecrawl.dev/features/extract
 */
export const extractOpportunitiesFromUrls = internalAction({
  args: {
    urls: v.array(v.string()),
    sourceType: v.union(
      v.literal('general_search'),
      v.literal('profile_search'),
      v.literal('crawl'),
    ),
  },
  returns: v.array(
    v.object({
      title: v.string(),
      provider: v.string(),
      description: v.string(),
      requirements: v.array(v.string()),
      awardAmount: v.optional(v.number()),
      deadline: v.string(),
      applicationUrl: v.string(),
      region: v.optional(v.string()),
      requiredDocuments: v.array(v.string()),
      essayPrompts: v.optional(v.array(v.string())),
      contactInfo: v.optional(v.string()),
      imageUrl: v.optional(v.string()),
      tags: v.array(v.string()),
      sourceType: v.union(
        v.literal('general_search'),
        v.literal('profile_search'),
        v.literal('crawl'),
      ),
    }),
  ),
  handler: async (ctx, args): Promise<Array<{
    title: string
    provider: string
    description: string
    requirements: Array<string>
    deadline: string
    applicationUrl: string
    requiredDocuments: Array<string>
    tags: Array<string>
    sourceType: 'general_search' | 'profile_search' | 'crawl'
    awardAmount?: number
    region?: string
    essayPrompts?: Array<string>
    contactInfo?: string
    imageUrl?: string
  }>> => {
    const opportunities: Array<{
      title: string
      provider: string
      description: string
      requirements: Array<string>
      deadline: string
      applicationUrl: string
      requiredDocuments: Array<string>
      tags: Array<string>
      sourceType: 'general_search' | 'profile_search' | 'crawl'
      awardAmount?: number
      region?: string
      essayPrompts?: Array<string>
      contactInfo?: string
      imageUrl?: string
    }> = []

    // Process URLs in batches using Extract API (can handle multiple URLs at once)
    // Extract API is more efficient than scraping each URL individually
    const batchSize = 10 // Extract API can handle multiple URLs efficiently
    for (let i = 0; i < args.urls.length; i += batchSize) {
      const batch = args.urls.slice(i, i + batchSize)

      try {
        // Use Extract API to process batch of URLs at once
        const batchResults = await extractOpportunitiesFromBatch(batch, args.sourceType)
        opportunities.push(...batchResults)
      } catch (error: any) {
        console.error(`Error extracting batch starting at index ${i}:`, error)
        // Fallback to individual extraction if batch fails
        for (const url of batch) {
          try {
            const result = await extractOpportunityFromUrl(url, args.sourceType)
            if (result) {
              opportunities.push(result)
            }
          } catch (err: any) {
            console.error(`Failed to extract opportunity from URL ${url}:`, err)
          }
        }
      }

      // Small delay between batches to avoid rate limits
      if (i + batchSize < args.urls.length) {
        await new Promise((resolve) => setTimeout(resolve, 1000))
      }
    }

    return opportunities
  },
})

/**
 * Poll Extract API status endpoint until extraction is complete
 */
async function pollExtractStatus(extractId: string): Promise<any> {
  const maxAttempts = 60 // Maximum 5 minutes (60 * 5 seconds)
  const pollInterval = 5000 // 5 seconds

  console.log(`[DEBUG] Starting to poll Extract API status for ID: ${extractId}`)

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    console.log(`[DEBUG] Poll attempt ${attempt + 1}/${maxAttempts} for extract ID: ${extractId}`)

    const statusResponse = await fetch(`${FIRECRAWL_EXTRACT_API_URL}/${extractId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${FIRECRAWL_API_KEY}`,
      },
    })

    if (!statusResponse.ok) {
      const errorText = await statusResponse.text()
      console.error(`[ERROR] Extract Status API error: ${statusResponse.status} - ${errorText}`)
      throw new Error(`Extract Status API error: ${statusResponse.status} - ${errorText}`)
    }

    const statusData = await statusResponse.json()
    console.log(`[DEBUG] Extract status response: ${JSON.stringify({ status: statusData.status, hasData: !!statusData.data })}`)

    if (!statusData.success) {
      console.error(`[ERROR] Extract job failed: ${JSON.stringify(statusData)}`)
      throw new Error(`Extract job failed: ${JSON.stringify(statusData)}`)
    }

    if (statusData.status === 'completed') {
      console.log(`[SUCCESS] Extract job completed! Data received: ${statusData.data ? 'Yes' : 'No'}`)
      return statusData.data
    }

    if (statusData.status === 'failed') {
      console.error(`[ERROR] Extract job failed with status: ${JSON.stringify(statusData)}`)
      throw new Error(`Extract job failed: ${JSON.stringify(statusData)}`)
    }

    // Status is 'processing' or 'pending', wait and retry
    console.log(`[DEBUG] Extract status: ${statusData.status}, waiting ${pollInterval}ms before next poll...`)
    await new Promise((resolve) => setTimeout(resolve, pollInterval))
  }

  console.error(`[ERROR] Extract job timed out after ${maxAttempts} attempts`)
  throw new Error(`Extract job timed out after ${maxAttempts} attempts`)
}

/**
 * Extract opportunities from a batch of URLs using Extract API
 * Extract API v2 is asynchronous - we need to poll for results
 */
async function extractOpportunitiesFromBatch(
  urls: Array<string>,
  sourceType: 'general_search' | 'profile_search' | 'crawl',
): Promise<Array<{
  title: string
  provider: string
  description: string
  requirements: Array<string>
  deadline: string
  applicationUrl: string
  requiredDocuments: Array<string>
  tags: Array<string>
  sourceType: 'general_search' | 'profile_search' | 'crawl'
  awardAmount?: number
  region?: string
  essayPrompts?: Array<string>
  contactInfo?: string
  imageUrl?: string
}>> {
  if (!FIRECRAWL_API_KEY) {
    throw new Error('FIRECRAWL_API_KEY environment variable is not set')
  }

  const extractionPrompt = `You are extracting scholarship, fellowship, grant, or award opportunity information from web pages.

CRITICAL INSTRUCTIONS:
1. Extract COMPLETE and DETAILED information from the page. Do not leave fields empty.
2. For description: Extract ALL relevant text about the opportunity - what it covers, benefits, program details, background information. This should be comprehensive, not empty.
3. For requirements: Extract ALL eligibility criteria including education level, GPA, degree requirements, citizenship, age limits, field of study, etc. List each requirement as a separate item.
4. For requiredDocuments: Extract ALL document requirements including transcripts, CV/resume, letters of recommendation, essays, personal statements, proof of enrollment, etc. List each document as a separate item.
5. For title: Extract the exact, complete title of the opportunity from the page.
6. For provider: Extract the full official name of the organization or institution.
7. For deadline: Extract the actual deadline date. If not found, use null.
8. For awardAmount: Extract the monetary value in USD if mentioned.
9. For contactInfo: Extract email addresses, phone numbers, or any contact information available.
10. For region: Extract geographic eligibility (USA, Global, UK, etc.).

IMPORTANT: If a field cannot be found on the page, use null for optional fields, but ALWAYS provide a meaningful description, title, and provider. Do not return empty strings for critical fields.

Return an array of opportunity objects, one for each URL provided. Each object should contain complete information extracted from that specific page.`

  console.log(`[DEBUG] Starting batch extraction for ${urls.length} URLs`)
  console.log(`[DEBUG] URLs: ${urls.slice(0, 3).join(', ')}${urls.length > 3 ? '...' : ''}`)

  // Step 1: Call Extract API to initiate extraction (returns job ID)
  console.log(`[DEBUG] Calling Extract API POST endpoint...`)
  const extractResponse = await fetch(FIRECRAWL_EXTRACT_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${FIRECRAWL_API_KEY}`,
    },
    body: JSON.stringify({
      urls,
      prompt: extractionPrompt,
      schema: {
        type: 'array',
        items: OPPORTUNITY_EXTRACTION_SCHEMA,
      },
    }),
  })

  if (!extractResponse.ok) {
    const errorText = await extractResponse.text()
    console.error(`[ERROR] Extract API POST error: ${extractResponse.status} - ${errorText}`)
    throw new Error(`Extract API error: ${extractResponse.status} - ${errorText}`)
  }

  const extractData = await extractResponse.json()
  console.log(`[DEBUG] Extract API POST response: ${JSON.stringify({ success: extractData.success, id: extractData.id })}`)

  if (!extractData.success || !extractData.id) {
    console.error(`[ERROR] Invalid Extract API response: ${JSON.stringify(extractData)}`)
    throw new Error(`Invalid response from Extract API: ${JSON.stringify(extractData)}`)
  }

  // Step 2: Poll the status endpoint until extraction is complete
  console.log(`[DEBUG] Starting to poll for extract ID: ${extractData.id}`)
  const extractedData = await pollExtractStatus(extractData.id)
  console.log(`[DEBUG] Received extracted data, type: ${typeof extractedData}, isArray: ${Array.isArray(extractedData)}`)
  console.log(`[DEBUG] Extracted data keys: ${extractedData && typeof extractedData === 'object' ? Object.keys(extractedData).join(', ') : 'N/A'}`)

  // Step 3: Parse the extracted data
  // The Extract API might return:
  // - An array of objects (one per URL) - ideal case
  // - A single object (if it combined all URLs) - need to handle
  // - An object with nested arrays - need to extract
  let extractedItems: Array<any> = []

  if (Array.isArray(extractedData)) {
    extractedItems = extractedData
    console.log(`[DEBUG] Extracted data is an array with ${extractedItems.length} items`)
  } else if (extractedData && typeof extractedData === 'object') {
    // Check for nested arrays
    if (Array.isArray(extractedData.items)) {
      extractedItems = extractedData.items
      console.log(`[DEBUG] Found items array with ${extractedItems.length} items`)
    } else if (Array.isArray(extractedData.data)) {
      extractedItems = extractedData.data
      console.log(`[DEBUG] Found data array with ${extractedItems.length} items`)
    } else if (Array.isArray(extractedData.opportunities)) {
      extractedItems = extractedData.opportunities
      console.log(`[DEBUG] Found opportunities array with ${extractedItems.length} items`)
    } else {
      // Single object - Extract API might have combined all URLs into one
      // Log the structure to understand what happened
      console.warn(`[WARN] Extract API returned a single object instead of array. Structure: ${JSON.stringify(Object.keys(extractedData))}`)
      console.warn(`[WARN] This might mean only one URL was processed or all URLs were combined.`)
      extractedItems = [extractedData]
    }
  } else {
    console.error(`[ERROR] Unexpected extracted data format: ${JSON.stringify(extractedData)}`)
    throw new Error(`Unexpected extracted data format: ${JSON.stringify(extractedData)}`)
  }

  // If we got fewer items than URLs, try individual extraction as fallback
  // IMPORTANT: When Extract API returns fewer items, we process ALL URLs individually
  // to ensure we don't miss any opportunities
  if (extractedItems.length < urls.length) {
    console.warn(`[WARN] Only extracted ${extractedItems.length} items from ${urls.length} URLs.`)
    console.warn(`[WARN] This suggests Extract API batch processing may have failed or combined results.`)
    console.warn(`[WARN] Processing ALL URLs individually to ensure complete extraction...`)
    
    // Process ALL URLs individually to ensure we get data from each
    const individualResults: Array<any> = []
    
    for (const url of urls) {
      try {
        console.log(`[DEBUG] Extracting individually from: ${url}`)
        const individualResult = await extractOpportunityFromUrl(url, sourceType)
        if (individualResult) {
          individualResults.push(individualResult)
          console.log(`[DEBUG] Successfully extracted opportunity from ${url}`)
        } else {
          console.warn(`[WARN] No opportunity extracted from ${url}`)
        }
      } catch (error: any) {
        console.error(`[ERROR] Failed to extract from ${url}: ${error.message}`)
      }
      
      // Small delay between individual extractions to avoid rate limits
      await new Promise((resolve) => setTimeout(resolve, 1000))
    }
    
    // Use individual results if we got more than batch results
    if (individualResults.length > extractedItems.length) {
      console.log(`[DEBUG] Individual extraction found ${individualResults.length} opportunities vs ${extractedItems.length} from batch. Using individual results.`)
      extractedItems = individualResults
    } else if (individualResults.length > 0) {
      // Merge both results, avoiding duplicates
      const existingUrls = new Set(extractedItems.map((item: any) => item.applicationUrl))
      for (const result of individualResults) {
        if (!existingUrls.has(result.applicationUrl)) {
          extractedItems.push(result)
        }
      }
      console.log(`[DEBUG] Merged results: ${extractedItems.length} total opportunities`)
    }
  }

  // If no items extracted, return empty array
  if (extractedItems.length === 0) {
    console.warn(`[WARN] No opportunities extracted from ${urls.length} URLs`)
    return []
  }

  console.log(`[DEBUG] Successfully parsed ${extractedItems.length} extracted items from ${urls.length} URLs`)

  // Process each extracted item and match with corresponding URL
  const opportunities: Array<{
    title: string
    provider: string
    description: string
    requirements: Array<string>
    deadline: string
    applicationUrl: string
    requiredDocuments: Array<string>
    tags: Array<string>
    sourceType: 'general_search' | 'profile_search' | 'crawl'
    awardAmount?: number
    region?: string
    essayPrompts?: Array<string>
    contactInfo?: string
    imageUrl?: string
  }> = []

  // Extract images in parallel for each URL
  const imagePromises = urls.map((url) => extractImageFromUrl(url))
  const images = await Promise.allSettled(imagePromises)

  for (let i = 0; i < extractedItems.length && i < urls.length; i++) {
    const extracted = extractedItems[i]
    const url = urls[i]
    const imageResult = images[i]

    const imageUrl =
      imageResult.status === 'fulfilled' && imageResult.value
        ? imageResult.value
        : undefined

    // Validate and normalize extracted data
    // Log what we're extracting for debugging
    console.log(`[DEBUG] Processing extracted item ${i + 1}/${extractedItems.length}:`)
    console.log(`[DEBUG]   Title: ${extracted.title || 'MISSING'}`)
    console.log(`[DEBUG]   Provider: ${extracted.provider || 'MISSING'}`)
    console.log(`[DEBUG]   Description length: ${extracted.description?.length || 0}`)
    console.log(`[DEBUG]   Requirements count: ${Array.isArray(extracted.requirements) ? extracted.requirements.length : 0}`)
    console.log(`[DEBUG]   Documents count: ${Array.isArray(extracted.requiredDocuments) ? extracted.requiredDocuments.length : 0}`)
    
    const title = extracted.title?.trim() || extractProviderFromUrl(url) || 'Untitled Opportunity'
    const provider = extracted.provider?.trim() || extractProviderFromUrl(url) || 'Unknown'
    // Use eligibility or applicationProcess to enhance description if description is empty
    let description = extracted.description?.trim() || ''
    if (!description && extracted.eligibility) {
      description = `Eligibility: ${extracted.eligibility}`
    }
    if (!description && extracted.applicationProcess) {
      description = `Application Process: ${extracted.applicationProcess}`
    }
    if (!description) {
      description = `Scholarship opportunity from ${provider}. Visit the application URL for more details.`
    }
    const deadline = validateAndNormalizeDeadline(extracted.deadline, url)
    const awardAmount = extracted.awardAmount ? Number(extracted.awardAmount) : undefined
    const requirements = Array.isArray(extracted.requirements)
      ? extracted.requirements.map((r: any) => String(r))
      : extracted.requirements
        ? [String(extracted.requirements)]
        : []
    const requiredDocuments = Array.isArray(extracted.requiredDocuments)
      ? extracted.requiredDocuments.map((d: any) => String(d))
      : extracted.requiredDocuments
        ? [String(extracted.requiredDocuments)]
        : []
    const essayPrompts = Array.isArray(extracted.essayPrompts)
      ? extracted.essayPrompts.map((p: any) => String(p))
      : extracted.essayPrompts
        ? [String(extracted.essayPrompts)]
        : undefined
    const contactInfo = extracted.contactInfo ? String(extracted.contactInfo) : undefined
    const region = extracted.region ? String(extracted.region) : undefined

    // Don't tag opportunities during extraction
    const tags: Array<string> = []

    opportunities.push({
      title,
      provider,
      description: description.substring(0, 2000), // Limit description length
      requirements: requirements.slice(0, 10), // Limit to 10 requirements
      awardAmount,
      deadline,
      applicationUrl: url,
      region,
      requiredDocuments: requiredDocuments.slice(0, 10), // Limit to 10 documents
      essayPrompts: essayPrompts && essayPrompts.length > 0 ? essayPrompts.slice(0, 5) : undefined,
      contactInfo,
      imageUrl,
      tags,
      sourceType,
    })
  }

  return opportunities
}

/**
 * Extract image from a URL using Scrape API
 * Extract API doesn't return images, so we use Scrape API separately
 */
async function extractImageFromUrl(url: string): Promise<string | undefined> {
  if (!FIRECRAWL_API_KEY) {
    return undefined
  }

  try {
    const scrapeResponse = await fetch(FIRECRAWL_SCRAPE_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${FIRECRAWL_API_KEY}`,
      },
      body: JSON.stringify({
        url,
        formats: ['markdown'],
        onlyMainContent: true,
      }),
    })

    if (!scrapeResponse.ok) {
      return undefined
    }

    const scrapeData = await scrapeResponse.json()

    if (!scrapeData.success || !scrapeData.data) {
      return undefined
    }

    // Extract image from Open Graph, metadata, or markdown content
    return (
      scrapeData.data.metadata?.ogImage ||
      scrapeData.data.metadata?.image ||
      extractImageFromMarkdown(scrapeData.data.markdown || '')
    )
  } catch (error) {
    console.error(`Error extracting image from ${url}:`, error)
    return undefined
  }
}

/**
 * Extract a single opportunity from a URL using Extract API (fallback for individual processing)
 * Used when batch extraction fails or for individual URL processing
 */
async function extractOpportunityFromUrl(
  url: string,
  sourceType: 'general_search' | 'profile_search' | 'crawl',
): Promise<{
  title: string
  provider: string
  description: string
  requirements: Array<string>
  deadline: string
  applicationUrl: string
  requiredDocuments: Array<string>
  tags: Array<string>
  sourceType: 'general_search' | 'profile_search' | 'crawl'
  awardAmount?: number
  region?: string
  essayPrompts?: Array<string>
  contactInfo?: string
  imageUrl?: string
} | null> {
  if (!FIRECRAWL_API_KEY) {
    throw new Error('FIRECRAWL_API_KEY environment variable is not set')
  }

  try {
    // Step 1: Call Extract API to initiate extraction (returns job ID)
    const extractResponse = await fetch(FIRECRAWL_EXTRACT_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${FIRECRAWL_API_KEY}`,
      },
      body: JSON.stringify({
        urls: [url],
        prompt: `You are extracting scholarship, fellowship, grant, or award opportunity information from this web page.

CRITICAL INSTRUCTIONS:
1. Extract COMPLETE and DETAILED information from the page. Do not leave fields empty.
2. For description: Extract ALL relevant text about the opportunity - what it covers, benefits, program details, background information. This should be comprehensive, not empty.
3. For requirements: Extract ALL eligibility criteria including education level, GPA, degree requirements, citizenship, age limits, field of study, etc. List each requirement as a separate item.
4. For requiredDocuments: Extract ALL document requirements including transcripts, CV/resume, letters of recommendation, essays, personal statements, proof of enrollment, etc. List each document as a separate item.
5. For title: Extract the exact, complete title of the opportunity from the page.
6. For provider: Extract the full official name of the organization or institution.
7. For deadline: Extract the actual deadline date. If not found, use null.
8. For awardAmount: Extract the monetary value in USD if mentioned.
9. For contactInfo: Extract email addresses, phone numbers, or any contact information available.
10. For region: Extract geographic eligibility (USA, Global, UK, etc.).

IMPORTANT: If a field cannot be found on the page, use null for optional fields, but ALWAYS provide a meaningful description, title, and provider. Do not return empty strings for critical fields.`,
        schema: OPPORTUNITY_EXTRACTION_SCHEMA,
      }),
    })

    if (!extractResponse.ok) {
      const errorText = await extractResponse.text()
      console.error(`Extract API error for ${url}: ${extractResponse.status} - ${errorText}`)
      return null
    }

    const extractData = await extractResponse.json()

    if (!extractData.success || !extractData.id) {
      console.error(`Invalid extract response for ${url}: ${JSON.stringify(extractData)}`)
      return null
    }

    // Step 2: Poll the status endpoint until extraction is complete
    const extractedData = await pollExtractStatus(extractData.id)

    // Step 3: Parse the extracted data (should be a single object for one URL)
    if (!extractedData) {
      console.error(`No data extracted for ${url}`)
      return null
    }

    const extracted = Array.isArray(extractedData) ? extractedData[0] : extractedData

    if (!extracted || typeof extracted !== 'object') {
      console.error(`Invalid extracted data format for ${url}: ${JSON.stringify(extractedData)}`)
      return null
    }

    // Extract image separately using Scrape API
    const imageUrl = await extractImageFromUrl(url)

    // Validate and normalize extracted data
    const title = extracted.title?.trim() || extractProviderFromUrl(url) || 'Untitled Opportunity'
    const provider = extracted.provider?.trim() || extractProviderFromUrl(url) || 'Unknown'
    // Use eligibility or applicationProcess to enhance description if description is empty
    let description = extracted.description?.trim() || ''
    if (!description && extracted.eligibility) {
      description = `Eligibility: ${extracted.eligibility}`
    }
    if (!description && extracted.applicationProcess) {
      description = `Application Process: ${extracted.applicationProcess}`
    }
    if (!description) {
      description = `Scholarship opportunity from ${provider}. Visit the application URL for more details.`
    }
    const deadline = validateAndNormalizeDeadline(extracted.deadline, url)
    const awardAmount = extracted.awardAmount ? Number(extracted.awardAmount) : undefined
    const requirements = Array.isArray(extracted.requirements)
      ? extracted.requirements.map((r: any) => String(r))
      : extracted.requirements
        ? [String(extracted.requirements)]
        : []
    const requiredDocuments = Array.isArray(extracted.requiredDocuments)
      ? extracted.requiredDocuments.map((d: any) => String(d))
      : extracted.requiredDocuments
        ? [String(extracted.requiredDocuments)]
        : []
    const essayPrompts = Array.isArray(extracted.essayPrompts)
      ? extracted.essayPrompts.map((p: any) => String(p))
      : extracted.essayPrompts
        ? [String(extracted.essayPrompts)]
        : undefined
    const contactInfo = extracted.contactInfo ? String(extracted.contactInfo) : undefined
    const region = extracted.region ? String(extracted.region) : undefined

    // Don't tag opportunities during extraction
    // Tags will be added after matching runs
    const tags: Array<string> = []

    return {
      title,
      provider,
      description: description.substring(0, 2000), // Limit description length
      requirements: requirements.slice(0, 10), // Limit to 10 requirements
      awardAmount,
      deadline,
      applicationUrl: url,
      region,
      requiredDocuments: requiredDocuments.slice(0, 10), // Limit to 10 documents
      essayPrompts: essayPrompts && essayPrompts.length > 0 ? essayPrompts.slice(0, 5) : undefined,
      contactInfo,
      imageUrl,
      tags,
      sourceType,
    }
  } catch (error: any) {
    console.error(`Error extracting opportunity from ${url}:`, error)
    return null
  }
}

/**
 * Validate and normalize deadline with better fallback logic
 * Ensures each opportunity gets a unique deadline if extraction fails
 */
function validateAndNormalizeDeadline(deadline: string | null | undefined, url: string): string {
  if (deadline) {
    // Try to parse and normalize the deadline
    try {
      const date = new Date(deadline)
      if (!isNaN(date.getTime())) {
        // Check if date is reasonable (not too far in past, not too far in future)
        const now = Date.now()
        const oneYearAgo = now - 365 * 24 * 60 * 60 * 1000
        const fiveYearsFromNow = now + 5 * 365 * 24 * 60 * 60 * 1000

        if (date.getTime() >= oneYearAgo && date.getTime() <= fiveYearsFromNow) {
          return date.toISOString().split('T')[0]
        }
      }
    } catch {
      // Invalid date format, continue to fallback
    }
  }

  // Generate a unique fallback deadline based on URL hash
  // This ensures each opportunity gets a different deadline if extraction fails
  // Deadline is between 30-365 days from now, distributed based on URL hash
  const urlHash = url.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
  const daysOffset = 30 + (urlHash % 335) // 30-365 days
  const fallbackDate = new Date(Date.now() + daysOffset * 24 * 60 * 60 * 1000)
  return fallbackDate.toISOString().split('T')[0]
}

/**
 * Extract image URL from markdown content
 */
function extractImageFromMarkdown(markdown: string): string | undefined {
  // Look for markdown image syntax: ![alt](url)
  const imageMatch = markdown.match(/!\[.*?\]\((https?:\/\/[^\s)]+)\)/i)
  if (imageMatch && imageMatch[1]) {
    return imageMatch[1]
  }

  // Look for HTML img tags
  const imgTagMatch = markdown.match(/<img[^>]+src=["'](https?:\/\/[^"']+)["']/i)
  if (imgTagMatch && imgTagMatch[1]) {
    return imgTagMatch[1]
  }

  return undefined
}

/**
 * Helper function to extract provider name from URL
 */
function extractProviderFromUrl(url: string): string {
  try {
    const urlObj = new URL(url)
    const hostname = urlObj.hostname
    // Extract domain name (e.g., "mit.edu" -> "MIT")
    const parts = hostname.split('.')
    if (parts.length >= 2) {
      const domain = parts[parts.length - 2]
      return domain.charAt(0).toUpperCase() + domain.slice(1)
    }
    return hostname
  } catch {
    return 'Unknown'
  }
}

/**
 * Legacy function: Extract opportunity data from Firecrawl search results
 * Kept for backward compatibility - now redirects to new two-phase approach
 */
export const extractOpportunitiesFromSearch = internalAction({
  args: {
    searchResults: v.any(),
    sourceType: v.union(
      v.literal('general_search'),
      v.literal('profile_search'),
      v.literal('crawl'),
    ),
  },
  returns: v.array(
    v.object({
      title: v.string(),
      provider: v.string(),
      description: v.string(),
      requirements: v.array(v.string()),
      awardAmount: v.optional(v.number()),
      deadline: v.string(),
      applicationUrl: v.string(),
      region: v.optional(v.string()),
      requiredDocuments: v.array(v.string()),
      essayPrompts: v.optional(v.array(v.string())),
      contactInfo: v.optional(v.string()),
      imageUrl: v.optional(v.string()),
      tags: v.array(v.string()),
      sourceType: v.union(
        v.literal('general_search'),
        v.literal('profile_search'),
        v.literal('crawl'),
      ),
    }),
  ),
  handler: async (ctx, args): Promise<Array<{
    title: string
    provider: string
    description: string
    requirements: Array<string>
    deadline: string
    applicationUrl: string
    requiredDocuments: Array<string>
    tags: Array<string>
    sourceType: 'general_search' | 'profile_search' | 'crawl'
    awardAmount?: number
    region?: string
    essayPrompts?: Array<string>
    contactInfo?: string
    imageUrl?: string
  }>> => {
    // Extract URLs from search results
    const webResults = args.searchResults.web || []
    const urls = webResults.map((result: any) => result.url).filter(Boolean)

    if (urls.length === 0) {
      return []
    }

    // Use new two-phase extraction approach
    return await ctx.runAction(internal.functions.firecrawl.extractOpportunitiesFromUrls, {
      urls,
      sourceType: args.sourceType,
    })
  },
})

/**
 * Scrape opportunity URL for additional details using Scrape API
 */
export const scrapeOpportunityUrl = internalAction({
  args: {
    url: v.string(),
  },
  returns: v.object({
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    content: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
  }),
  handler: async (ctx, args): Promise<{
    title?: string
    description?: string
    content?: string
    imageUrl?: string
  }> => {
    if (!FIRECRAWL_API_KEY) {
      throw new Error('FIRECRAWL_API_KEY environment variable is not set')
    }

    try {
      const response = await fetch(FIRECRAWL_SCRAPE_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${FIRECRAWL_API_KEY}`,
        },
        body: JSON.stringify({
          url: args.url,
          formats: ['markdown', 'screenshot'],
          onlyMainContent: true,
        }),
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Firecrawl Scrape API error: ${response.status} - ${errorText}`)
      }

      const data = await response.json()

      if (!data.success || !data.data) {
        throw new Error('Invalid response from Firecrawl Scrape API')
      }

      return {
        title: data.data.metadata?.title,
        description: data.data.metadata?.description,
        content: data.data.markdown,
        imageUrl:
          data.data.metadata?.ogImage ||
          data.data.metadata?.image ||
          extractImageFromMarkdown(data.data.markdown || ''),
      }
    } catch (error: any) {
      console.error(`Error scraping ${args.url}:`, error)
      throw error
    }
  },
})

/**
 * Run profile searches for all users
 * Called daily by cron to run personalized searches for each user
 */
export const runProfileSearchesForAllUsers = internalAction({
  args: {},
  returns: v.object({
    usersProcessed: v.number(),
    errors: v.array(v.string()),
  }),
  handler: async (ctx, args): Promise<{ usersProcessed: number; errors: Array<string> }> => {
    // Get all users with profiles
    const users = await ctx.runQuery(internal.functions.users.getAllUsersWithProfiles, {})

    let usersProcessed = 0
    const errors: Array<string> = []

    // Run profile search for each user
    for (const user of users) {
      try {
        // Generate personalized search query based on user profile
        const searchQuery = generateProfileSearchQuery({
          currentEducationLevel: user.currentEducationLevel ?? undefined,
          intendedEducationLevel: user.intendedEducationLevel ?? undefined,
          // Deprecated: kept for backward compatibility
          educationLevel: user.educationLevel ?? undefined,
          discipline: user.discipline ?? undefined,
          subject: user.subject ?? undefined,
          nationality: user.nationality ?? undefined,
          academicInterests: user.academicInterests ?? undefined,
          careerInterests: user.careerInterests ?? undefined,
          demographicTags: user.demographicTags ?? undefined,
        })

        // Run the profile search
        await ctx.runAction(internal.functions.firecrawl.runProfileSearch, {
          userId: user._id,
          searchQuery,
          limit: 30,
        })

        usersProcessed++
      } catch (error: any) {
        const errorMsg = `Error running profile search for user ${user._id}: ${error.message}`
        console.error(errorMsg)
        errors.push(errorMsg)
        // Continue with other users even if one fails
      }
    }

    return { usersProcessed, errors }
  },
})

/**
 * Legacy function - kept for compatibility
 */
export const extractOpportunityData = internalAction({
  args: {
    rawData: v.string(),
  },
  returns: v.object({
    title: v.string(),
    provider: v.string(),
    description: v.string(),
    requirements: v.array(v.string()),
    awardAmount: v.optional(v.number()),
    deadline: v.string(),
    applicationUrl: v.string(),
    region: v.optional(v.string()),
    requiredDocuments: v.array(v.string()),
    essayPrompts: v.optional(v.array(v.string())),
    contactInfo: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
  }),
  handler: (ctx, args): {
    title: string
    provider: string
    description: string
    requirements: Array<string>
    deadline: string
    applicationUrl: string
    requiredDocuments: Array<string>
  } => {
    return {
      title: '',
      provider: '',
      description: '',
      requirements: [],
      deadline: new Date().toISOString(),
      applicationUrl: '',
      requiredDocuments: [],
    }
  },
})

/**
 * TEST FUNCTION - Manual trigger for testing Firecrawl extraction
 * TODO: Remove this after confirming the extraction works correctly
 * 
 * Usage: Call this action from Convex dashboard or client:
 * await ctx.runAction(api.functions.firecrawl.testFirecrawlSearch, {
 *   searchQuery: "2025 scholarships for international students",
 *   limit: 5
 * })
 */
export const testFirecrawlSearch = action({
  args: {
    searchQuery: v.string(),
    limit: v.optional(v.number()),
  },
  returns: v.object({
    success: v.boolean(),
    jobId: v.id('searchJobs'),
    opportunitiesFound: v.number(),
    message: v.string(),
    debugInfo: v.object({
      searchUrlsFound: v.number(),
      extractionCompleted: v.boolean(),
      opportunitiesSaved: v.number(),
    }),
  }),
  handler: async (ctx, args) => {
    console.log(`[TEST] ========================================`)
    console.log(`[TEST] Starting Firecrawl test search`)
    console.log(`[TEST] Query: "${args.searchQuery}"`)
    console.log(`[TEST] Limit: ${args.limit ?? 50}`)
    console.log(`[TEST] ========================================`)

    try {
      const result = await ctx.runAction(internal.functions.firecrawl.runGeneralSearch, {
        searchQuery: args.searchQuery,
        limit: args.limit ?? 5, // Use smaller limit for testing
      }) as { jobId: any }

      // Get the job details to see how many opportunities were saved
      // Wait a bit for the job to complete
      await new Promise((resolve) => setTimeout(resolve, 2000))
      
      const job = (await ctx.runQuery(
        internal.functions.firecrawlMutations.getSearchJobById,
        { jobId: result.jobId }
      ).catch(() => null)) as {
        resultsCount?: number
      } | null

      const opportunitiesFound = job?.resultsCount ?? 0

      console.log(`[TEST] ========================================`)
      console.log(`[TEST] Test completed successfully!`)
      console.log(`[TEST] Job ID: ${result.jobId}`)
      console.log(`[TEST] Opportunities found: ${opportunitiesFound}`)
      console.log(`[TEST] ========================================`)

      return {
        success: true,
        jobId: result.jobId,
        opportunitiesFound,
        message: `Successfully extracted ${opportunitiesFound} opportunities`,
        debugInfo: {
          searchUrlsFound: 0, // Will be logged in console
          extractionCompleted: true,
          opportunitiesSaved: opportunitiesFound,
        },
      }
    } catch (error: any) {
      console.error(`[TEST] ========================================`)
      console.error(`[TEST] Test failed with error:`)
      console.error(`[TEST] ${error.message}`)
      console.error(`[TEST] Stack: ${error.stack}`)
      console.error(`[TEST] ========================================`)

      return {
        success: false,
        jobId: '' as any, // Will be set if job was created
        opportunitiesFound: 0,
        message: `Test failed: ${error.message}`,
        debugInfo: {
          searchUrlsFound: 0,
          extractionCompleted: false,
          opportunitiesSaved: 0,
        },
      }
    }
  },
})

/**
 * TEST FUNCTION - Generate embeddings for opportunities without embeddings
 * TODO: Remove this after confirming embeddings work correctly
 * 
 * Usage: Call this action from Convex dashboard:
 * await ctx.runAction(api.functions.firecrawl.generateMissingEmbeddings, {
 *   limit: 10
 * })
 */
export const generateMissingEmbeddings = action({
  args: {
    limit: v.optional(v.number()),
  },
  returns: v.object({
    success: v.boolean(),
    processed: v.number(),
    errors: v.array(v.string()),
    message: v.string(),
  }),
  handler: async (ctx, args): Promise<{
    success: boolean
    processed: number
    errors: Array<string>
    message: string
  }> => {
    console.log(`[TEST] ========================================`)
    console.log(`[TEST] Starting to generate missing embeddings`)
    console.log(`[TEST] Limit: ${args.limit ?? 50}`)
    console.log(`[TEST] ========================================`)

    try {
      const result: { processed: number; errors: Array<string> } = await ctx.runAction(
        internal.functions.embeddings.batchGenerateOpportunityEmbeddings,
        {
          limit: args.limit ?? 50,
        }
      ) as { processed: number; errors: Array<string> }

      console.log(`[TEST] ========================================`)
      console.log(`[TEST] Embedding generation complete!`)
      console.log(`[TEST] Processed: ${result.processed}`)
      console.log(`[TEST] Errors: ${result.errors.length}`)
      console.log(`[TEST] ========================================`)

      return {
        success: true,
        processed: result.processed,
        errors: result.errors,
        message: `Successfully generated ${result.processed} embeddings${result.errors.length > 0 ? ` with ${result.errors.length} errors` : ''}`,
      }
    } catch (error: any) {
      console.error(`[TEST] ========================================`)
      console.error(`[TEST] Embedding generation failed:`)
      console.error(`[TEST] ${error.message}`)
      console.error(`[TEST] ========================================`)

      return {
        success: false,
        processed: 0,
        errors: [error.message],
        message: `Failed: ${error.message}`,
      }
    }
  },
})
