import { v } from 'convex/values'
import { internalAction, internalMutation } from '../_generated/server'
import { internal } from '../_generated/api'

/**
 * Get effective education level for matching (works in mutations, no Node.js needed)
 * Priority: intendedEducationLevel > currentEducationLevel > educationLevel (deprecated)
 */
function getEffectiveEducationLevel(user: {
  currentEducationLevel?: 'highschool' | 'undergraduate' | 'masters' | 'phd'
  intendedEducationLevel?: 'undergraduate' | 'masters' | 'phd'
  educationLevel?: 'undergraduate' | 'masters' | 'phd'
}): 'undergraduate' | 'masters' | 'phd' | undefined {
  if (user.intendedEducationLevel) {
    return user.intendedEducationLevel
  }
  // Map highschool to undergraduate for matching
  if (user.currentEducationLevel === 'highschool') {
    return 'undergraduate'
  }
  if (user.currentEducationLevel) {
    return user.currentEducationLevel
  }
  return user.educationLevel
}

/**
 * Get all education levels for a user (current and intended)
 */
function getAllEducationLevels(user: {
  currentEducationLevel?: 'highschool' | 'undergraduate' | 'masters' | 'phd'
  intendedEducationLevel?: 'undergraduate' | 'masters' | 'phd'
  educationLevel?: 'undergraduate' | 'masters' | 'phd'
}): Array<'undergraduate' | 'masters' | 'phd'> {
  const levels = new Set<'undergraduate' | 'masters' | 'phd'>()
  
  // Map highschool to undergraduate for matching (highschool students seek undergrad opportunities)
  if (user.currentEducationLevel === 'highschool') {
    levels.add('undergraduate')
  } else if (user.currentEducationLevel) {
    levels.add(user.currentEducationLevel)
  }
  if (user.intendedEducationLevel) {
    levels.add(user.intendedEducationLevel)
  }
  // Include deprecated field for backward compatibility
  if (user.educationLevel) {
    levels.add(user.educationLevel)
  }
  
  return Array.from(levels)
}

/**
 * Keyword-based matching (for hybrid scoring)
 * Simple rule-based matching based on keyword overlap
 * This is a mutation (not an action) so it must be in a non-Node.js file
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

    // Get all education levels to check (both current and intended)
    const educationLevels = getAllEducationLevels(user)

    for (const opp of opportunities) {
      let score = 0

      // Check against all education levels (current and intended)
      // Prioritize intended level matches (higher score)
      if (educationLevels.length > 0) {
        const reqs = opp.requirements.join(' ').toLowerCase()
        for (const level of educationLevels) {
          if (reqs.includes(level.toLowerCase())) {
            // Give higher score to intended level matches
            if (level === user.intendedEducationLevel) {
              score += 35 // Higher weight for intended level
            } else if (level === user.currentEducationLevel) {
              score += 25 // Lower weight for current level
            } else {
              score += 20 // Lowest weight for deprecated field
            }
            break // Only count once per opportunity
          }
        }
      }

      if (user.discipline) {
        const discipline = user.discipline
        if (opp.requirements.some((r) => r.includes(discipline))) {
          score += 20
        }
      }

      if (user.academicInterests) {
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

/**
 * Tag opportunities with "For You" based on AI matching results
 * This is a mutation (not an action) so it must be in a non-Node.js file
 */
export const tagOpportunitiesFromMatches = internalMutation({
  args: {
    userId: v.id('users'),
    matches: v.array(
      v.object({
        opportunityId: v.id('opportunities'),
        score: v.number(),
      }),
    ),
    tagThreshold: v.optional(v.number()),
  },
  returns: v.object({
    tagged: v.number(),
  }),
  handler: async (ctx, args) => {
    const threshold = args.tagThreshold ?? 30
    let tagged = 0

    // First, remove "For You" tags from all opportunities for this user
    // (We'll re-add them based on fresh matching)
    // Note: In a multi-user system, we'd need a user-specific tagging system
    // For now, we'll tag opportunities that match this user

    for (const match of args.matches) {
      if (match.score >= threshold) {
        const opp = await ctx.db.get(match.opportunityId)
        if (!opp) {
          continue
        }

        // Remove old "For You" tag if exists
        const tagsWithoutForYou = opp.tags.filter((tag) => tag !== 'For You')
        const newTags = [...tagsWithoutForYou, 'For You']

        await ctx.db.patch(match.opportunityId, {
          tags: newTags,
          lastUpdated: Date.now(),
        })

        tagged++
      }
    }

    return { tagged }
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

    // Run AI-powered matching
    const matchingResult = await ctx.runAction(internal.functions.matching.matchOpportunitiesForUser, {
      userId: args.userId,
      opportunityIds: allOpportunities.map((opp) => opp._id),
      batchSize: 20,
    })

    // Tag matched opportunities
    await ctx.runMutation(internal.functions.matchingMutations.tagOpportunitiesFromMatches, {
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

