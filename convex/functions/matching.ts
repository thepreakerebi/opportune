'use node'

import { generateObject } from 'ai'
import { openai } from '@ai-sdk/openai'
import { z } from 'zod'
import { v } from 'convex/values'
import { internalAction } from '../_generated/server'
import { internal } from '../_generated/api'
import { formatEducationLevels, getAllEducationLevels, getEffectiveEducationLevel } from './educationHelpers'

/**
 * AI-Powered Opportunity Matching Workflow
 * Uses Vercel AI SDK generateObject pattern for structured, reliable matching
 * Leverages GPT-4o for advanced reasoning and context understanding
 */

/**
 * Schema for AI-generated matching results
 * Ensures structured, validated output from the AI agent
 */
const matchingResultSchema = z.object({
  matches: z.array(
    z.object({
      opportunityId: z.string().describe('The ID of the matched opportunity'),
      score: z.number().min(0).max(100).describe('Match score from 0-100'),
      reasoning: z.string().describe('Explanation of why this opportunity matches the user'),
      eligibilityFactors: z.array(z.string()).describe('Key factors that make this a good match'),
      potentialConcerns: z.array(z.string()).optional().describe('Any potential issues or concerns'),
    }),
  ),
  summary: z.string().describe('Overall summary of matching results'),
})

/**
 * Estimate token count for a string (rough approximation: ~4 chars per token)
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

/**
 * Estimate tokens for an opportunity summary
 */
function estimateOpportunityTokens(opp: {
  title: string
  provider: string
  description: string
  requirements: Array<string>
  requiredDocuments: Array<string>
  deadline: string
  region?: string
  awardAmount?: number
}): number {
  const desc = opp.description.substring(0, 500)
  const reqs = opp.requirements.slice(0, 8).join(', ') // Truncate to first 8 requirements
  const docs = opp.requiredDocuments.join(', ')
  const summary = `- Title: ${opp.title}\n- Provider: ${opp.provider}\n- Description: ${desc}\n- Requirements: ${reqs}\n- Required Documents: ${docs}\n- Deadline: ${opp.deadline}\n- Region: ${opp.region ?? 'Not specified'}\n- Award Amount: ${opp.awardAmount ? `$${opp.awardAmount}` : 'Not specified'}`
  return estimateTokens(summary)
}

/**
 * Adaptive batch sizing based on token estimates
 * Targets ~80K tokens per batch (safe for GPT-4o's 128K context)
 * with buffer for system prompt, user profile, and output
 */
function calculateAdaptiveBatchSize(
  opportunities: Array<{
    title: string
    provider: string
    description: string
    requirements: Array<string>
    requiredDocuments: Array<string>
    deadline: string
    region?: string
    awardAmount?: number
  }>,
  userProfileTokens: number,
  systemPromptTokens: number = 500,
  maxBatchTokens: number = 80000,
): number {
  const perOpportunityTokens = opportunities.map(estimateOpportunityTokens)
  const averageTokens = perOpportunityTokens.reduce((a, b) => a + b, 0) / perOpportunityTokens.length

  // Reserve tokens for: system prompt + user profile + output (~15K tokens)
  const reservedTokens = systemPromptTokens + userProfileTokens + 15000
  const availableTokens = maxBatchTokens - reservedTokens

  // Calculate batch size, but ensure at least 10 and at most 60 opportunities
  const calculatedSize = Math.floor(availableTokens / averageTokens)
  return Math.max(10, Math.min(60, calculatedSize))
}

/**
 * Match opportunities for a single user using AI agent
 * Uses GPT-4o for sophisticated reasoning and context understanding
 */
export const matchOpportunitiesForUser = internalAction({
  args: {
    userId: v.id('users'),
    opportunityIds: v.array(v.id('opportunities')),
    batchSize: v.optional(v.number()),
  },
  returns: v.object({
    matches: v.array(
      v.object({
        opportunityId: v.id('opportunities'),
        score: v.number(),
        reasoning: v.string(),
        eligibilityFactors: v.array(v.string()),
        potentialConcerns: v.optional(v.array(v.string())),
      }),
    ),
    summary: v.string(),
  }),
  handler: async (ctx, args): Promise<{
    matches: Array<{
      opportunityId: any
      score: number
      reasoning: string
      eligibilityFactors: Array<string>
      potentialConcerns?: Array<string>
    }>
    summary: string
  }> => {
    // Get user profile
    const user = await ctx.runQuery(internal.functions.users.getUserById, {
      userId: args.userId,
    })

    if (!user) {
      throw new Error('User not found')
    }

    // Build user profile summary (reused for all batches)
    // Use both current and intended education levels for comprehensive matching
    const educationLevelsText = formatEducationLevels(user)
    const userProfileSummary = `
Education Levels: ${educationLevelsText}
Subject: ${user.subject ?? 'Not specified'}
Discipline: ${user.discipline ?? 'Not specified'}
Nationality: ${user.nationality ?? 'Not specified'}
Academic Interests: ${user.academicInterests?.join(', ') || 'Not specified'}
Career Interests: ${user.careerInterests?.join(', ') || 'Not specified'}
Demographic Tags: ${user.demographicTags?.join(', ') || 'None'}
Academic Status: ${user.academicStatus?.gpa ? `GPA: ${user.academicStatus.gpa}` : 'Not specified'}
`
    const userProfileTokens = estimateTokens(userProfileSummary)

    // Fetch all opportunities upfront for adaptive batch sizing
    const allOpportunities = await Promise.all(
      args.opportunityIds.map(async (oppId) => {
        return await ctx.runQuery(internal.functions.opportunities.getOpportunityByIdInternal, {
          opportunityId: oppId,
        })
      }),
    )

    const validOpportunities = allOpportunities.filter((opp) => opp !== null)

    if (validOpportunities.length === 0) {
      return {
        matches: [],
        summary: 'No valid opportunities found for matching.',
      }
    }

    // Calculate adaptive batch size based on opportunity complexity
    const defaultBatchSize = args.batchSize ?? 45
    const adaptiveBatchSize = args.batchSize
      ? args.batchSize
      : calculateAdaptiveBatchSize(validOpportunities as Array<{
          title: string
          provider: string
          description: string
          requirements: Array<string>
          requiredDocuments: Array<string>
          deadline: string
          region?: string
          awardAmount?: number
        }>, userProfileTokens)

    const batchSize = adaptiveBatchSize
    const allMatches: Array<{
      opportunityId: any
      score: number
      reasoning: string
      eligibilityFactors: Array<string>
      potentialConcerns?: Array<string>
    }> = []

    // Process opportunities in adaptive batches
    for (let i = 0; i < validOpportunities.length; i += batchSize) {
      const batch = validOpportunities.slice(i, i + batchSize)

      // Retry logic for failed batches
      let retries = 3
      let batchMatches: Array<{
        opportunityId: any
        score: number
        reasoning: string
        eligibilityFactors: Array<string>
        potentialConcerns?: Array<string>
      }> = []

      while (retries > 0) {
        try {
          // Build opportunities summary with truncated requirements
          const opportunitiesSummary = batch
            .map(
              (opp, idx) => `
Opportunity ${idx + 1}:
- ID: ${opp!._id}
- Title: ${opp!.title}
- Provider: ${opp!.provider}
- Description: ${opp!.description.substring(0, 500)}
- Requirements: ${opp!.requirements.slice(0, 8).join(', ')}${opp!.requirements.length > 8 ? ' (and more...)' : ''}
- Required Documents: ${opp!.requiredDocuments.join(', ')}
- Deadline: ${opp!.deadline}
- Region: ${opp!.region ?? 'Not specified'}
- Award Amount: ${opp!.awardAmount ? `$${opp!.awardAmount}` : 'Not specified'}
`,
            )
            .join('\n')

          // Use GPT-4o for advanced reasoning and structured output
          const result = await generateObject({
            model: openai('gpt-4o'),
            schema: matchingResultSchema,
            prompt: `You are an expert scholarship matching advisor. Analyze the following user profile and opportunities to determine the best matches.

User Profile:
${userProfileSummary}

Available Opportunities:
${opportunitiesSummary}

Your task:
1. Evaluate each opportunity against the user's profile
2. Score each match from 0-100 based on:
   - Education level compatibility (consider both current and intended levels)
   - Subject/discipline alignment
   - Geographic eligibility (nationality/region)
   - Interest alignment
   - Academic qualifications match
   - Overall fit and likelihood of success
3. Provide clear reasoning for each match
4. Identify specific eligibility factors
5. Note any potential concerns or requirements that might be difficult to meet

Match opportunities that align with either the user's current education level (for continuing education) or intended education level (for advancement). Prioritize intended level matches but also include relevant current level opportunities.

Only include opportunities with a score of 30 or higher. Focus on opportunities where the user has a realistic chance of success.

Return structured results with scores, reasoning, and factors.`,
          })

          // Convert string IDs back to proper types
          batchMatches = result.object.matches.map((match) => ({
            opportunityId: match.opportunityId as any,
            score: match.score,
            reasoning: match.reasoning,
            eligibilityFactors: match.eligibilityFactors,
            potentialConcerns: match.potentialConcerns,
          }))

          // Success - break out of retry loop
          break
        } catch (error: any) {
          retries--
          const errorMessage = error.message || String(error)

          // If token limit error or batch too large, reduce batch size and retry
          if (
            (errorMessage.includes('token') || errorMessage.includes('context') || errorMessage.includes('length')) &&
            retries > 0 &&
            batch.length > 5
          ) {
            console.warn(
              `Batch size ${batch.length} too large, reducing to ${Math.floor(batch.length / 2)} and retrying...`,
            )
            // Split batch in half and process separately
            const midPoint = Math.floor(batch.length / 2)
            const firstHalf = batch.slice(0, midPoint)
            const secondHalf = batch.slice(midPoint)

            // Recursively process smaller batches
            const firstHalfMatches = await processBatch(ctx, firstHalf, userProfileSummary, matchingResultSchema)
            const secondHalfMatches = await processBatch(ctx, secondHalf, userProfileSummary, matchingResultSchema)

            batchMatches = [...firstHalfMatches, ...secondHalfMatches]
            break
          }

          // If this was the last retry, throw error
          if (retries === 0) {
            console.error(`Failed to process batch after 3 retries:`, errorMessage)
            throw new Error(`Batch processing failed: ${errorMessage}`)
          }

          // Wait before retrying (exponential backoff)
          await new Promise((resolve) => setTimeout(resolve, 1000 * (4 - retries)))
        }
      }

      allMatches.push(...batchMatches)
    }

    // Helper function to process a batch (for recursive retry)
    async function processBatch(
      context: any,
      batchData: Array<any>,
      profileSummary: string,
      schema: any,
    ): Promise<Array<{
      opportunityId: any
      score: number
      reasoning: string
      eligibilityFactors: Array<string>
      potentialConcerns?: Array<string>
    }>> {
      const opportunitiesSummary = batchData
        .map(
          (opp, idx) => `
Opportunity ${idx + 1}:
- ID: ${opp!._id}
- Title: ${opp!.title}
- Provider: ${opp!.provider}
- Description: ${opp!.description.substring(0, 500)}
- Requirements: ${opp!.requirements.slice(0, 8).join(', ')}${opp!.requirements.length > 8 ? ' (and more...)' : ''}
- Required Documents: ${opp!.requiredDocuments.join(', ')}
- Deadline: ${opp!.deadline}
- Region: ${opp!.region ?? 'Not specified'}
- Award Amount: ${opp!.awardAmount ? `$${opp!.awardAmount}` : 'Not specified'}
`,
        )
        .join('\n')

      const result = await generateObject({
        model: openai('gpt-4o'),
        schema,
        prompt: `You are an expert scholarship matching advisor. Analyze the following user profile and opportunities to determine the best matches.

User Profile:
${profileSummary}

Available Opportunities:
${opportunitiesSummary}

Your task:
1. Evaluate each opportunity against the user's profile
2. Score each match from 0-100 based on:
   - Education level compatibility (consider both current and intended levels)
   - Subject/discipline alignment
   - Geographic eligibility (nationality/region)
   - Interest alignment
   - Academic qualifications match
   - Overall fit and likelihood of success
3. Provide clear reasoning for each match
4. Identify specific eligibility factors
5. Note any potential concerns or requirements that might be difficult to meet

Match opportunities that align with either the user's current education level (for continuing education) or intended education level (for advancement). Prioritize intended level matches but also include relevant current level opportunities.

Only include opportunities with a score of 30 or higher. Focus on opportunities where the user has a realistic chance of success.

Return structured results with scores, reasoning, and factors.`,
      })

      return result.object.matches.map((match: {
        opportunityId: string
        score: number
        reasoning: string
        eligibilityFactors: Array<string>
        potentialConcerns?: Array<string>
      }) => ({
        opportunityId: match.opportunityId as any,
        score: match.score,
        reasoning: match.reasoning,
        eligibilityFactors: match.eligibilityFactors,
        potentialConcerns: match.potentialConcerns,
      }))
    }

    // Combine with semantic and keyword matching for hybrid scoring
    const semanticMatches = await ctx.runAction(
      (internal.functions as any).semanticSearch.findSimilarOpportunities,
      {
        userId: args.userId,
        limit: 50,
      },
    )

    const keywordMatches = await ctx.runMutation((internal.functions as any).matchingMutations.matchOpportunitiesToUserKeyword, {
      userId: args.userId,
    })

    // Create hybrid scores: 50% AI reasoning, 30% semantic, 20% keyword
    const hybridScores = new Map<string, { aiScore: number; semanticScore: number; keywordScore: number }>()

    // Add AI scores
    for (const match of allMatches) {
      hybridScores.set(match.opportunityId, {
        aiScore: match.score,
        semanticScore: 0,
        keywordScore: 0,
      })
    }

    // Add semantic scores (normalize to 0-100)
    for (const match of semanticMatches) {
      const normalizedSemantic = match.similarityScore * 100
      const existing = hybridScores.get(match.opportunityId)
      if (existing) {
        existing.semanticScore = normalizedSemantic
      } else {
        hybridScores.set(match.opportunityId, {
          aiScore: 0,
          semanticScore: normalizedSemantic,
          keywordScore: 0,
        })
      }
    }

    // Add keyword scores
    for (const match of keywordMatches) {
      const existing = hybridScores.get(match.opportunityId)
      if (existing) {
        existing.keywordScore = match.score
      } else {
        hybridScores.set(match.opportunityId, {
          aiScore: 0,
          semanticScore: 0,
          keywordScore: match.score,
        })
      }
    }

    // Calculate final hybrid scores
    const finalMatches: Array<{
      opportunityId: any
      score: number
      reasoning: string
      eligibilityFactors: Array<string>
      potentialConcerns?: Array<string>
    }> = []

    for (const [opportunityId, scores] of hybridScores.entries()) {
      const finalScore = scores.aiScore * 0.5 + scores.semanticScore * 0.3 + scores.keywordScore * 0.2

      if (finalScore >= 30) {
        // Find AI reasoning if available
        const aiMatch = allMatches.find((m) => m.opportunityId === opportunityId)
        finalMatches.push({
          opportunityId: opportunityId as any,
          score: Math.round(finalScore * 100) / 100,
          reasoning:
            aiMatch?.reasoning ||
            `Hybrid match: AI (${Math.round(scores.aiScore)}%), Semantic (${Math.round(scores.semanticScore)}%), Keyword (${Math.round(scores.keywordScore)}%)`,
          eligibilityFactors: aiMatch?.eligibilityFactors || [],
          potentialConcerns: aiMatch?.potentialConcerns,
        })
      }
    }

    // Sort by score
    finalMatches.sort((a, b) => b.score - a.score)

    return {
      matches: finalMatches.slice(0, 30), // Return top 30 matches
      summary: `Found ${finalMatches.length} high-quality matches for user ${args.userId}. Top matches scored ${finalMatches[0]?.score ?? 0}% or higher.`,
    }
  },
})

/**
 * Tag recommended opportunities for a user
 * This function runs the matching workflow and tags opportunities
 */
export const tagRecommendedOpportunities = internalAction({
  args: {
    userId: v.id('users'),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    // Get recent opportunities (from last 7 days)
    const recentCutoff = Date.now() - 7 * 24 * 60 * 60 * 1000
    const allOpportunities = await ctx.runQuery(internal.functions.opportunities.getAllRecentOpportunities, {
      sinceTimestamp: recentCutoff,
    })

    if (allOpportunities.length === 0) {
      return null
    }

    // Run AI-powered matching (uses adaptive batch sizing)
    const matchingResult = await ctx.runAction(internal.functions.matching.matchOpportunitiesForUser, {
      userId: args.userId,
      opportunityIds: allOpportunities.map((opp) => opp._id),
      // batchSize will be calculated adaptively based on opportunity complexity
    })

    // Tag matched opportunities
    await ctx.runMutation((internal.functions as any).matchingMutations.tagOpportunitiesFromMatches, {
      userId: args.userId,
      matches: matchingResult.matches.map((m) => ({
        opportunityId: m.opportunityId,
        score: m.score,
      })),
      tagThreshold: 30,
    })

    return null
  },
})

/**
 * Daily AI-powered matching workflow
 * Orchestrates the entire matching process:
 * 1. Gets all users with profiles
 * 2. Gets recent opportunities (from last 24 hours)
 * 3. Runs AI-powered matching for each user
 * 4. Tags matched opportunities
 */
export const runDailyAIMatchingWorkflow = internalAction({
  args: {},
  returns: v.object({
    usersProcessed: v.number(),
    totalOpportunitiesMatched: v.number(),
    errors: v.array(v.string()),
  }),
  handler: async (ctx, _args): Promise<{
    usersProcessed: number
    totalOpportunitiesMatched: number
    errors: Array<string>
  }> => {
    // Get all users with profiles
    const users = await ctx.runQuery(internal.functions.users.getAllUsersWithProfiles, {})

    // Get recent opportunities (from last 7 days to ensure fresh matching)
    const recentCutoff = Date.now() - 7 * 24 * 60 * 60 * 1000
    const allOpportunities = await ctx.runQuery(internal.functions.opportunities.getAllRecentOpportunities, {
      sinceTimestamp: recentCutoff,
    })

    if (allOpportunities.length === 0) {
      return {
        usersProcessed: 0,
        totalOpportunitiesMatched: 0,
        errors: ['No recent opportunities found for matching'],
      }
    }

    let usersProcessed = 0
    let totalOpportunitiesMatched = 0
    const errors: Array<string> = []

    // Process each user
    for (const user of users) {
      try {
        // Run AI-powered matching (uses adaptive batch sizing)
        const matchingResult = await ctx.runAction(internal.functions.matching.matchOpportunitiesForUser, {
          userId: user._id,
          opportunityIds: allOpportunities.map((opp) => opp._id),
          // batchSize will be calculated adaptively based on opportunity complexity
        })

        // Tag matched opportunities
        const taggingResult = await ctx.runMutation((internal.functions as any).matchingMutations.tagOpportunitiesFromMatches, {
          userId: user._id,
          matches: matchingResult.matches.map((m) => ({
            opportunityId: m.opportunityId,
            score: m.score,
          })),
          tagThreshold: 30,
        })

        totalOpportunitiesMatched += taggingResult.tagged
        usersProcessed++
      } catch (error: any) {
        const errorMsg = `Error matching opportunities for user ${user._id}: ${error.message}`
        console.error(errorMsg)
        errors.push(errorMsg)
        // Continue with other users even if one fails
      }
    }

    return {
      usersProcessed,
      totalOpportunitiesMatched,
      errors,
    }
  },
})
