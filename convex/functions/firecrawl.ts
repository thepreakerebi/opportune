'use node'

import { v } from 'convex/values'
import { internalAction } from '../_generated/server'
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
    title: { type: 'string' },
    provider: { type: 'string', description: 'Organization or institution name' },
    description: { type: 'string', description: 'Full description of the opportunity' },
    deadline: {
      type: 'string',
      description: 'Application deadline in YYYY-MM-DD format. Extract the actual deadline date from the page.',
    },
    awardAmount: {
      type: 'number',
      description: 'Monetary award amount in USD if specified',
    },
    requirements: {
      type: 'array',
      items: { type: 'string' },
      description: 'Educational requirements, GPA, degree level, etc.',
    },
    requiredDocuments: {
      type: 'array',
      items: { type: 'string' },
      description: 'Required documents like CV, transcripts, letters of recommendation',
    },
    essayPrompts: {
      type: 'array',
      items: { type: 'string' },
      description: 'Essay questions or prompts if any',
    },
    contactInfo: {
      type: 'string',
      description: 'Email address or contact information',
    },
    region: {
      type: 'string',
      description: 'Geographic region or eligibility (e.g., USA, Global, UK)',
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

      if (!searchData.success || !searchData.data) {
        throw new Error('Invalid response from Firecrawl Search API')
      }

      // Extract URLs from search results
      const webResults = searchData.data.web || []
      const urls = webResults.map((result: any) => result.url).filter(Boolean)

      if (urls.length === 0) {
        throw new Error('No URLs found in search results')
      }

      // Phase 2: Extract structured data from each URL using Extract API
      const opportunities = await ctx.runAction(internal.functions.firecrawl.extractOpportunitiesFromUrls, {
        urls,
        sourceType: 'general_search',
      })

      // Save ALL opportunities (both matched and unmatched will be saved)
      await ctx.runMutation(internal.functions.firecrawlMutations.saveSearchResults, {
        jobId,
        opportunities,
      })

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
        throw new Error(`Firecrawl Search API error: ${searchResponse.status} - ${errorText}`)
      }

      const searchData = await searchResponse.json()

      if (!searchData.success || !searchData.data) {
        throw new Error('Invalid response from Firecrawl Search API')
      }

      // Extract URLs from search results
      const webResults = searchData.data.web || []
      const urls = webResults.map((result: any) => result.url).filter(Boolean)

      if (urls.length === 0) {
        throw new Error('No URLs found in search results')
      }

      // Phase 2: Extract structured data from each URL using Extract API
      const opportunities = await ctx.runAction(internal.functions.firecrawl.extractOpportunitiesFromUrls, {
        urls,
        sourceType: 'profile_search',
      })

      // Save ALL opportunities (both matched and unmatched will be saved)
      await ctx.runMutation(internal.functions.firecrawlMutations.saveSearchResults, {
        jobId,
        opportunities,
      })

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
 * Extract opportunities from a batch of URLs using Extract API
 * Extract API can process multiple URLs efficiently in one call
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

  const extractionPrompt = `Extract scholarship, fellowship, grant, or award opportunity information from each page. 
    Focus on finding the actual application deadline date, award amount, requirements, and all relevant details.
    If the deadline is not explicitly stated, try to infer it from context or return null if truly unavailable.
    For requirements, include education level (undergraduate, masters, PhD), GPA requirements, degree requirements, etc.
    For requiredDocuments, list all documents needed (transcripts, CV, letters of recommendation, essays, etc).
    Extract contact information including email addresses if available.
    Return an array of opportunity objects, one for each URL provided.`

  // Call Extract API with batch of URLs
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
    throw new Error(`Extract API error: ${extractResponse.status} - ${errorText}`)
  }

  const extractData = await extractResponse.json()

  if (!extractData.success || !extractData.data) {
    throw new Error('Invalid response from Extract API')
  }

  // Extract API returns data directly (or array of data if multiple URLs)
  const extractedItems = Array.isArray(extractData.data) ? extractData.data : [extractData.data]

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
    const title = extracted.title || extractProviderFromUrl(url) || 'Untitled Opportunity'
    const provider = extracted.provider || extractProviderFromUrl(url) || 'Unknown'
    const description = extracted.description || ''
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
    // Use Extract API for structured data extraction
    const extractResponse = await fetch(FIRECRAWL_EXTRACT_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${FIRECRAWL_API_KEY}`,
      },
      body: JSON.stringify({
        urls: [url],
        prompt: `Extract scholarship, fellowship, grant, or award opportunity information from this page. 
            Focus on finding the actual application deadline date, award amount, requirements, and all relevant details.
            If the deadline is not explicitly stated, try to infer it from context or return null if truly unavailable.
            For requirements, include education level (undergraduate, masters, PhD), GPA requirements, degree requirements, etc.
            For requiredDocuments, list all documents needed (transcripts, CV, letters of recommendation, essays, etc).
            Extract contact information including email addresses if available.`,
        schema: OPPORTUNITY_EXTRACTION_SCHEMA,
      }),
    })

    if (!extractResponse.ok) {
      const errorText = await extractResponse.text()
      console.error(`Extract API error for ${url}: ${extractResponse.status} - ${errorText}`)
      return null
    }

    const extractData = await extractResponse.json()

    if (!extractData.success || !extractData.data) {
      console.error(`Invalid extract response for ${url}`)
      return null
    }

    // Extract API returns data directly
    const extracted = extractData.data

    // Extract image separately using Scrape API
    const imageUrl = await extractImageFromUrl(url)

    // Validate and normalize extracted data
    const title = extracted.title || extractProviderFromUrl(url) || 'Untitled Opportunity'
    const provider = extracted.provider || extractProviderFromUrl(url) || 'Unknown'
    const description = extracted.description || ''
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
