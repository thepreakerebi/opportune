'use node'

import { v } from 'convex/values'
import { action } from '../_generated/server'
import { api, internal } from '../_generated/api'
import { generateProfileSearchQuery } from './firecrawlHelpers'
import type { Id } from '../_generated/dataModel'

/**
 * User-initiated search for opportunities
 * 
 * Flow:
 * 1. First checks database for matching opportunities using semantic + keyword search
 * 2. If matches found (>= minMatches), returns them immediately
 * 3. If no matches (or < minMatches), triggers Firecrawl search with profile-enhanced query
 * 4. Extracts opportunities from Firecrawl
 * 5. Matches extracted opportunities to user profile
 * 6. Saves matched opportunities to user-specific mapping table
 * 7. Returns matched opportunities
 */
export const searchOpportunities = action({
  args: {
    searchQuery: v.string(),
    minMatches: v.optional(v.number()), // Minimum matches required before triggering Firecrawl
    limit: v.optional(v.number()), // Limit for Firecrawl search if triggered
  },
  returns: v.object({
    opportunities: v.array(
      v.object({
        _id: v.id('opportunities'),
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
        lastUpdated: v.number(),
        createdAt: v.number(),
        matchScore: v.number(),
        matchReasoning: v.optional(v.string()),
      }),
    ),
    source: v.union(
      v.literal('database'), // Found in database
      v.literal('firecrawl'), // Found via Firecrawl search
    ),
    totalFound: v.number(),
  }),
  handler: async (ctx, args): Promise<{
    opportunities: Array<{
      _id: Id<'opportunities'>
      title: string
      provider: string
      description: string
      requirements: Array<string>
      awardAmount?: number
      deadline: string
      applicationUrl: string
      region?: string
      requiredDocuments: Array<string>
      essayPrompts?: Array<string>
      contactInfo?: string
      imageUrl?: string
      tags: Array<string>
      sourceType: 'general_search' | 'profile_search' | 'crawl'
      lastUpdated: number
      createdAt: number
      matchScore: number
      matchReasoning?: string
    }>
    source: 'database' | 'firecrawl'
    totalFound: number
  }> => {
    // Get authenticated user via query
    const user = await ctx.runQuery(api.functions.users.getCurrentUser, {})
    if (!user) {
      throw new Error('Not authenticated')
    }

    const minMatches = args.minMatches ?? 5

    // Phase 1: Search database first using semantic + keyword search
    const databaseResults = await searchDatabaseOpportunities(
      ctx,
      user._id,
      args.searchQuery,
    )

    // If we found enough matches in database, return them
    if (databaseResults.length >= minMatches) {
      return {
        opportunities: databaseResults,
        source: 'database',
        totalFound: databaseResults.length,
      }
    }

    // Phase 2: No matches (or not enough) - trigger Firecrawl search
    // Combine user's search query with profile context for better results
    const profileEnhancedQuery = combineSearchQueryWithProfile(
      args.searchQuery,
      user,
    )

    // Run Firecrawl profile search
    await ctx.runAction(internal.functions.firecrawl.runProfileSearch, {
      userId: user._id,
      searchQuery: profileEnhancedQuery,
      limit: args.limit ?? 30,
    })

    // Wait a bit for the search to complete (Firecrawl search is async)
    // In production, you might want to poll the job status
    await new Promise((resolve) => setTimeout(resolve, 2000))

    // Get newly extracted opportunities and match them to user
    const recentCutoff = Date.now() - 5 * 60 * 1000 // Last 5 minutes
    const newOpportunities: Array<{
      _id: Id<'opportunities'>
      title: string
      provider: string
      description: string
      requirements: Array<string>
      deadline: string
      applicationUrl: string
      createdAt: number
    }> = await ctx.runQuery(
      internal.functions.opportunities.getAllRecentOpportunities,
      {
        sinceTimestamp: recentCutoff,
      },
    )

    if (newOpportunities.length === 0) {
      // No new opportunities found, return database results if any
      return {
        opportunities: databaseResults,
        source: 'database',
        totalFound: databaseResults.length,
      }
    }

    // Match new opportunities to user
    const matchingResult: {
      matches: Array<{
        opportunityId: Id<'opportunities'>
        score: number
        reasoning: string
        eligibilityFactors: Array<string>
      }>
    } = await ctx.runAction(
      internal.functions.matching.matchOpportunitiesForUser,
      {
        userId: user._id,
        opportunityIds: newOpportunities.map((opp) => opp._id),
      },
    )

    // Save matched opportunities to user-specific mapping table
    await ctx.runMutation(
      (internal.functions as any).matchingMutations.saveUserOpportunityMatches,
      {
        userId: user._id,
        matches: matchingResult.matches.map((m) => ({
          opportunityId: m.opportunityId,
          score: m.score,
          reasoning: m.reasoning,
          eligibilityFactors: m.eligibilityFactors,
        })),
        matchType: 'user_search',
        minScore: 30,
      },
    )

    // Fetch full opportunity details with match metadata
    const firecrawlResults: Array<{
      _id: Id<'opportunities'>
      title: string
      provider: string
      description: string
      requirements: Array<string>
      awardAmount?: number
      deadline: string
      applicationUrl: string
      region?: string
      requiredDocuments: Array<string>
      essayPrompts?: Array<string>
      contactInfo?: string
      imageUrl?: string
      tags: Array<string>
      sourceType: 'general_search' | 'profile_search' | 'crawl'
      lastUpdated: number
      createdAt: number
      matchScore: number
      matchReasoning?: string
    }> = []
    for (const match of matchingResult.matches) {
      if (match.score >= 30) {
        const opp = await ctx.runQuery(
          internal.functions.opportunities.getOpportunityByIdInternal,
          {
            opportunityId: match.opportunityId,
          },
        )
        if (opp) {
          firecrawlResults.push({
            ...opp,
            matchScore: match.score,
            matchReasoning: match.reasoning,
          })
        }
      }
    }

    // Combine database results with Firecrawl results
    // Remove duplicates (same opportunity might appear in both)
    const allResults = [...databaseResults, ...firecrawlResults]
    const uniqueResults = allResults.filter(
      (opp, index, self) =>
        index === self.findIndex((o) => o._id === opp._id),
    )

    // Sort by match score (highest first)
    uniqueResults.sort((a, b) => b.matchScore - a.matchScore)

    return {
      opportunities: uniqueResults.slice(0, 50), // Limit to top 50
      source: 'firecrawl',
      totalFound: uniqueResults.length,
    }
  },
})

/**
 * Search database opportunities using semantic + keyword search
 * Combines user's search query with their profile for contextual matching
 */
async function searchDatabaseOpportunities(
  ctx: any,
  userId: Id<'users'>,
  searchQuery: string,
): Promise<
  Array<{
    _id: Id<'opportunities'>
    title: string
    provider: string
    description: string
    requirements: Array<string>
    awardAmount?: number
    deadline: string
    applicationUrl: string
    region?: string
    requiredDocuments: Array<string>
    essayPrompts?: Array<string>
    contactInfo?: string
    imageUrl?: string
    tags: Array<string>
    sourceType: 'general_search' | 'profile_search' | 'crawl'
    lastUpdated: number
    createdAt: number
    matchScore: number
    matchReasoning?: string
  }>
> {
  // Combine search query with user profile for semantic search
  const user = await ctx.runQuery(internal.functions.users.getUserById, {
    userId,
  })

  if (!user) {
    return []
  }

  // Create enhanced query: user's search + profile context
  const enhancedQuery = `${searchQuery} ${user.discipline || ''} ${user.academicInterests?.join(' ') || ''} ${user.intendedEducationLevel || user.currentEducationLevel || ''}`.trim()

  // Semantic search using vector embeddings
  const semanticResults: Array<{
    opportunityId: Id<'opportunities'>
    similarityScore: number
  }> = await ctx.runAction(
    (internal.functions as any).semanticSearch.semanticSearchOpportunitiesAction,
    {
      query: enhancedQuery,
      limit: 30,
    },
  )

  // Get opportunities with match scores
  const opportunities: Array<{
    _id: Id<'opportunities'>
    title: string
    provider: string
    description: string
    requirements: Array<string>
    awardAmount?: number
    deadline: string
    applicationUrl: string
    region?: string
    requiredDocuments: Array<string>
    essayPrompts?: Array<string>
    contactInfo?: string
    imageUrl?: string
    tags: Array<string>
    sourceType: 'general_search' | 'profile_search' | 'crawl'
    lastUpdated: number
    createdAt: number
    matchScore: number
    matchReasoning?: string
  }> = []
  for (const result of semanticResults) {
    const opp = await ctx.runQuery(
      internal.functions.opportunities.getOpportunityByIdInternal,
      {
        opportunityId: result.opportunityId,
      },
    )
    if (opp) {
      // Convert similarity score (0-1) to match score (0-100)
      const matchScore = Math.round(result.similarityScore * 100)
      opportunities.push({
        ...opp,
        matchScore,
        matchReasoning: `Semantic similarity: ${Math.round(result.similarityScore * 100)}%`,
      })
    }
  }

  // Filter by minimum score threshold
  return opportunities.filter((opp) => opp.matchScore >= 30)
}

/**
 * Combine user's search query with their profile to create enhanced Firecrawl query
 * This ensures Firecrawl search considers both the search term and user profile
 */
function combineSearchQueryWithProfile(
  searchQuery: string,
  user: {
    currentEducationLevel?: 'highschool' | 'undergraduate' | 'masters' | 'phd'
    intendedEducationLevel?: 'undergraduate' | 'masters' | 'phd'
    discipline?: string
    academicInterests?: Array<string>
    nationality?: string
  },
): string {
  // Generate profile-based query components
  const profileQuery = generateProfileSearchQuery({
    currentEducationLevel: user.currentEducationLevel,
    intendedEducationLevel: user.intendedEducationLevel,
    discipline: user.discipline,
    academicInterests: user.academicInterests,
    nationality: user.nationality,
  })

  // Combine user's search query with profile query
  // User's search query takes priority, profile adds context
  return `${searchQuery} ${profileQuery}`.trim()
}

