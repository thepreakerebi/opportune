import { v } from 'convex/values'
import { internalAction, internalMutation } from '../_generated/server'
import { internal } from '../_generated/api'

/**
 * Hybrid matching: 70% semantic similarity + 30% keyword matching
 */
export const matchOpportunitiesToUser = internalAction({
  args: {
    userId: v.id('users'),
  },
  returns: v.array(
    v.object({
      opportunityId: v.id('opportunities'),
      score: v.number(),
      semanticScore: v.number(),
      keywordScore: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    const user = await ctx.runQuery(internal.functions.users.getUserById, {
      userId: args.userId,
    })

    if (!user) {
      return []
    }

    // Get semantic matches (70% weight)
    const semanticMatches = await ctx.runAction(
      (internal.functions as any).semanticSearch.findSimilarOpportunities,
      {
        userId: args.userId,
        limit: 100,
      },
    )

    // Get keyword matches (30% weight)
    const keywordMatches = await ctx.runMutation(internal.functions.matching.matchOpportunitiesToUserKeyword, {
      userId: args.userId,
    })

    // Combine scores
    const combinedScores = new Map<string, { semanticScore: number; keywordScore: number }>()

    // Add semantic scores (normalize to 0-100 scale)
    for (const match of semanticMatches) {
      const normalizedSemantic = match.similarityScore * 100
      combinedScores.set(match.opportunityId, {
        semanticScore: normalizedSemantic,
        keywordScore: 0,
      })
    }

    // Add keyword scores
    for (const match of keywordMatches) {
      const existing = combinedScores.get(match.opportunityId)
      if (existing) {
        existing.keywordScore = match.score
      } else {
        combinedScores.set(match.opportunityId, {
          semanticScore: 0,
          keywordScore: match.score,
        })
      }
    }

    // Calculate final scores with weights
    const finalMatches: Array<{
      opportunityId: any
      score: number
      semanticScore: number
      keywordScore: number
    }> = []

    for (const [opportunityId, scores] of combinedScores.entries()) {
      const finalScore = scores.semanticScore * 0.7 + scores.keywordScore * 0.3
      if (finalScore > 0) {
        finalMatches.push({
          opportunityId: opportunityId as any,
          score: finalScore,
          semanticScore: scores.semanticScore,
          keywordScore: scores.keywordScore,
        })
      }
    }

    return finalMatches.sort((a, b) => b.score - a.score)
  },
})

/**
 * Keyword-based matching (legacy approach, kept for hybrid scoring)
 */
export const matchOpportunitiesToUserKeyword = internalMutation({
  args: {
    userId: v.id('users'),
  },
  returns: v.array(
    v.object({
      opportunityId: v.id('opportunities'),
      score: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    const user = await ctx.runQuery(internal.functions.users.getUserById, {
      userId: args.userId,
    })

    if (!user) {
      return []
    }

    const opportunities = await ctx.db.query('opportunities').collect()
    const matches: Array<{ opportunityId: any; score: number }> = []

    for (const opp of opportunities) {
      let score = 0

      if (user.educationLevel) {
        const reqs = opp.requirements.join(' ').toLowerCase()
        if (reqs.includes(user.educationLevel.toLowerCase())) {
          score += 30
        }
      }

      if (user.discipline) {
        const discipline = user.discipline
        if (opp.requirements.some((r) => r.includes(discipline))) {
          score += 20
        }
      }

      if (user.academicInterests) {
        const interests = user.academicInterests.join(' ').toLowerCase()
        const desc = opp.description.toLowerCase()
        user.academicInterests.forEach((interest: string) => {
          if (desc.includes(interest.toLowerCase())) {
            score += 10
          }
        })
      }

      if (user.nationality && opp.region) {
        if (opp.region.toLowerCase().includes(user.nationality.toLowerCase())) {
          score += 15
        }
      }

      if (score > 0) {
        matches.push({ opportunityId: opp._id, score })
      }
    }

    return matches.sort((a, b) => b.score - a.score)
  },
})

export const tagRecommendedOpportunities = internalAction({
  args: {
    userId: v.id('users'),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const matches = await ctx.runAction(internal.functions.matching.matchOpportunitiesToUser, {
      userId: args.userId,
    })

    for (const match of matches.slice(0, 10)) {
      if (match.score >= 30) {
        const opp = await ctx.runQuery(internal.functions.opportunities.getOpportunityByIdInternal, {
          opportunityId: match.opportunityId,
        })
        if (opp && 'tags' in opp && Array.isArray(opp.tags) && !opp.tags.includes('For You')) {
          await ctx.runMutation((internal.functions as any).opportunities.tagOpportunity, {
            opportunityId: match.opportunityId,
            tags: [...opp.tags, 'For You'],
          })
        }
      }
    }

    return null
  },
})

