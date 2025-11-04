'use node'

import { v } from 'convex/values'
import { internalAction, internalMutation } from '../_generated/server'
import { internal } from '../_generated/api'
import { generateProfileSearchQuery } from './firecrawlHelpers'

const FIRECRAWL_API_KEY = process.env.FIRECRAWL_API_KEY
const FIRECRAWL_API_URL = 'https://api.firecrawl.dev/v2/search'

/**
 * Run general Firecrawl search for opportunities
 * Based on Opportune.md: Scheduled jobs run broad "catch-all" search prompts
 * Uses Firecrawl search API with scrape options as per https://docs.firecrawl.dev/features/search
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
      // Call Firecrawl search API with scrape options
      // Reference: https://docs.firecrawl.dev/features/search
      const response = await fetch(FIRECRAWL_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${FIRECRAWL_API_KEY}`,
        },
        body: JSON.stringify({
          query: args.searchQuery,
          limit: args.limit ?? 50,
          sources: ['web'],
          scrapeOptions: {
            formats: ['markdown', 'json', 'screenshot'],
            onlyMainContent: true,
          },
        }),
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Firecrawl API error: ${response.status} - ${errorText}`)
      }

      const data = await response.json()

      if (!data.success || !data.data) {
        throw new Error('Invalid response from Firecrawl API')
      }

      // Extract opportunities from search results
      const opportunities = await ctx.runAction(internal.functions.firecrawl.extractOpportunitiesFromSearch, {
        searchResults: data.data,
        sourceType: 'general_search',
      })

      // Save ALL opportunities (both matched and unmatched will be saved)
      // Matching and tagging happens separately after all searches complete
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
 * Based on Opportune.md: Upon onboarding/update, generate profile-tailored prompts
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
      // Call Firecrawl search API with scrape options
      const response = await fetch(FIRECRAWL_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${FIRECRAWL_API_KEY}`,
        },
        body: JSON.stringify({
          query: args.searchQuery,
          limit: args.limit ?? 30,
          sources: ['web'],
          scrapeOptions: {
            formats: ['markdown', 'json', 'screenshot'],
            onlyMainContent: true,
          },
        }),
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Firecrawl API error: ${response.status} - ${errorText}`)
      }

      const data = await response.json()

      if (!data.success || !data.data) {
        throw new Error('Invalid response from Firecrawl API')
      }

      // Extract opportunities from search results
      const opportunities = await ctx.runAction(internal.functions.firecrawl.extractOpportunitiesFromSearch, {
        searchResults: data.data,
        sourceType: 'profile_search',
      })

      // Save ALL opportunities (both matched and unmatched will be saved)
      // Matching and tagging happens separately after all searches complete
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
 * Extract opportunity data from Firecrawl search results
 * Processes web results and scraped content to extract structured opportunity data
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
  handler: (ctx, args): Array<{
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
  }> => {
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

    // Process web results
    // Firecrawl returns: { data: { web: [...], data: [...] } }
    // where web contains search results and data contains scraped content
    const webResults = args.searchResults.web || []
    const scrapedData = args.searchResults.data || [] // Scraped content from scrapeOptions

    // Combine web results with scraped content
    for (let i = 0; i < webResults.length; i++) {
      const result = webResults[i]
      const scraped = scrapedData[i] || {}

      try {
        // Extract basic info from search result
        const title = result.title || scraped.title || scraped.metadata?.title || 'Untitled Scholarship'
        const description = result.description || scraped.description || scraped.markdown || ''
        const url = result.url || scraped.url || scraped.metadata?.sourceURL || ''
        const imageUrl = scraped.screenshot || result.imageUrl || undefined

        // Try to extract structured data from JSON if available
        let jsonData: any = {}
        if (scraped.json) {
          try {
            jsonData = typeof scraped.json === 'string' ? JSON.parse(scraped.json) : scraped.json
          } catch {
            // Invalid JSON, continue with empty object
          }
        }

        // Extract provider from URL or title
        const provider = jsonData.provider || jsonData.organization || extractProviderFromUrl(url) || 'Unknown'

        // Extract requirements from description or JSON
        const requirements = extractRequirements(description, jsonData)

        // Extract deadline
        const deadline = extractDeadline(description, jsonData) || new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

        // Extract award amount
        const awardAmount = extractAwardAmount(description, jsonData)

        // Extract required documents
        const requiredDocuments = extractRequiredDocuments(description, jsonData)

        // Extract essay prompts
        const essayPrompts = extractEssayPrompts(description, jsonData)

        // Extract contact info
        const contactInfo = extractContactInfo(description, jsonData)

        // Extract region
        const region = extractRegion(description, jsonData)

        // Don't tag opportunities during extraction
        // Tags will be added after matching runs
        // This ensures ALL opportunities are saved (matched and unmatched)
        const tags: Array<string> = []

        opportunities.push({
          title,
          provider,
          description: description.substring(0, 2000), // Limit description length
          requirements,
          awardAmount,
          deadline,
          applicationUrl: url,
          region,
          requiredDocuments,
          essayPrompts,
          contactInfo,
          imageUrl,
          tags,
          sourceType: args.sourceType,
        })
      } catch (error: any) {
        console.error(`Error processing search result ${i}:`, error)
        // Continue processing other results
      }
    }

    return opportunities
  },
})

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
 * Extract requirements from description or JSON data
 */
function extractRequirements(description: string, jsonData: any): Array<string> {
  const requirements: Array<string> = []
  
  // Check JSON first
  if (jsonData.requirements && Array.isArray(jsonData.requirements)) {
    requirements.push(...jsonData.requirements.map((r: any) => String(r)))
  } else if (jsonData.requirements && typeof jsonData.requirements === 'string') {
    requirements.push(jsonData.requirements)
  }

  // Extract from description using keywords
  const requirementKeywords = ['undergraduate', 'masters', 'phd', 'doctoral', 'gpa', 'gpa of', 'minimum gpa', 'degree', 'years of study']
  const descLower = description.toLowerCase()
  
  for (const keyword of requirementKeywords) {
    if (descLower.includes(keyword)) {
      const regex = new RegExp(`(${keyword}[^.]*\\.?)`, 'gi')
      const matches = description.match(regex)
      if (matches) {
        requirements.push(...matches.map(m => m.trim()))
      }
    }
  }

  return [...new Set(requirements)].slice(0, 10) // Limit to 10 unique requirements
}

/**
 * Extract deadline from description or JSON data
 */
function extractDeadline(description: string, jsonData: any): string | null {
  if (jsonData.deadline) {
    return String(jsonData.deadline)
  }

  // Try to find date patterns in description
  const datePatterns = [
    /\b(\d{1,2}\/\d{1,2}\/\d{4})\b/,
    /\b(\d{4}-\d{2}-\d{2})\b/,
    /\b(deadline|due|closes?|ends?)\s+(?:on|by|before)?\s*(\d{1,2}\/\d{1,2}\/\d{4})\b/i,
    /\b(deadline|due|closes?|ends?)\s+(?:on|by|before)?\s*(\d{4}-\d{2}-\d{2})\b/i,
  ]

  for (const pattern of datePatterns) {
    const match = description.match(pattern)
    if (match) {
      const dateStr = match[2] || match[1]
      try {
        const date = new Date(dateStr)
        if (!isNaN(date.getTime())) {
          return date.toISOString().split('T')[0]
        }
      } catch {
        // Invalid date, continue
      }
    }
  }

  return null
}

/**
 * Extract award amount from description or JSON data
 */
function extractAwardAmount(description: string, jsonData: any): number | undefined {
  if (jsonData.awardAmount || jsonData.amount) {
    const amount = Number(jsonData.awardAmount || jsonData.amount)
    if (!isNaN(amount)) {
      return amount
    }
  }

  // Try to extract from description
  const amountPatterns = [
    /\$(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/,
    /(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)\s*(?:dollars?|usd)/i,
  ]

  for (const pattern of amountPatterns) {
    const match = description.match(pattern)
    if (match) {
      const amount = Number(match[1].replace(/,/g, ''))
      if (!isNaN(amount) && amount > 0) {
        return amount
      }
    }
  }

  return undefined
}

/**
 * Extract required documents from description or JSON data
 */
function extractRequiredDocuments(description: string, jsonData: any): Array<string> {
  const documents: Array<string> = []

  if (jsonData.requiredDocuments && Array.isArray(jsonData.requiredDocuments)) {
    documents.push(...jsonData.requiredDocuments.map((d: any) => String(d)))
  } else if (jsonData.requiredDocuments && typeof jsonData.requiredDocuments === 'string') {
    documents.push(jsonData.requiredDocuments)
  }

  // Extract common document types from description
  const documentKeywords = ['cv', 'resume', 'transcript', 'reference letter', 'letter of recommendation', 'essay', 'personal statement', 'passport', 'certificate', 'portfolio']
  const descLower = description.toLowerCase()

  for (const keyword of documentKeywords) {
    if (descLower.includes(keyword)) {
      documents.push(keyword.charAt(0).toUpperCase() + keyword.slice(1))
    }
  }

  return [...new Set(documents)].slice(0, 10) // Limit to 10 unique documents
}

/**
 * Extract essay prompts from description or JSON data
 */
function extractEssayPrompts(description: string, jsonData: any): Array<string> | undefined {
  if (jsonData.essayPrompts && Array.isArray(jsonData.essayPrompts)) {
    return jsonData.essayPrompts.map((p: any) => String(p))
  }

  // Try to find essay prompts in description
  const promptPatterns = [
    /essay\s+(?:prompt|question|topic):\s*(.+?)(?:\n|$)/i,
    /please\s+(?:write|discuss|describe|explain)\s+(.+?)(?:\.|$)/i,
  ]

  const prompts: Array<string> = []
  for (const pattern of promptPatterns) {
    const matches = description.matchAll(new RegExp(pattern, 'gi'))
    for (const match of matches) {
      if (match[1]) {
        prompts.push(match[1].trim())
      }
    }
  }

  return prompts.length > 0 ? prompts : undefined
}

/**
 * Extract contact info from description or JSON data
 */
function extractContactInfo(description: string, jsonData: any): string | undefined {
  if (jsonData.contactInfo || jsonData.contact || jsonData.email) {
    return String(jsonData.contactInfo || jsonData.contact || jsonData.email)
  }

  // Try to extract email from description
  const emailPattern = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/
  const emailMatch = description.match(emailPattern)
  if (emailMatch) {
    return emailMatch[0]
  }

  return undefined
}

/**
 * Extract region from description or JSON data
 */
function extractRegion(description: string, jsonData: any): string | undefined {
  if (jsonData.region || jsonData.location) {
    return String(jsonData.region || jsonData.location)
  }

  // Try to extract region keywords
  const regions = ['global', 'international', 'usa', 'united states', 'canada', 'europe', 'uk', 'australia', 'asia']
  const descLower = description.toLowerCase()

  for (const region of regions) {
    if (descLower.includes(region)) {
      return region.charAt(0).toUpperCase() + region.slice(1)
    }
  }

  return undefined
}

/**
 * Scrape opportunity URL for additional details
 */
export const scrapeOpportunityUrl = internalAction({
  args: {
    url: v.string(),
  },
  returns: v.object({
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    content: v.optional(v.string()),
  }),
  handler: (ctx, args): { title?: string; description?: string; content?: string } => {
    // This would use Firecrawl's scrape endpoint
    // For now, return placeholder
    return {
      title: undefined,
      description: undefined,
      content: undefined,
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
