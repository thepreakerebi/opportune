import { v } from 'convex/values'
import { internalMutation, internalQuery } from '../_generated/server'
import { internal } from '../_generated/api'

export const matchOpportunitiesToUser = internalMutation({
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

export const tagRecommendedOpportunities = internalMutation({
  args: {
    userId: v.id('users'),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const matches = await ctx.runMutation(internal.functions.matching.matchOpportunitiesToUser, {
      userId: args.userId,
    })

    for (const match of matches.slice(0, 10)) {
      if (match.score >= 30) {
        const opp = await ctx.db.get(match.opportunityId)
        if (opp && 'tags' in opp && Array.isArray(opp.tags) && !opp.tags.includes('For You')) {
          await ctx.db.patch(match.opportunityId, {
            tags: [...opp.tags, 'For You'],
          })
        }
      }
    }

    return null
  },
})

