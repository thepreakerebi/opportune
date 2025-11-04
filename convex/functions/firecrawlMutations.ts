import { v } from 'convex/values'
import { internalMutation } from '../_generated/server'
import { internal } from '../_generated/api'

export const saveSearchJob = internalMutation({
  args: {
    type: v.union(v.literal('general_search'), v.literal('profile_search')),
    searchQuery: v.string(),
    userId: v.optional(v.id('users')),
    scheduledFor: v.number(),
  },
  returns: v.id('searchJobs'),
  handler: async (ctx, args) => {
    return await ctx.db.insert('searchJobs', {
      type: args.type,
      status: 'pending',
      searchQuery: args.searchQuery,
      userId: args.userId,
      scheduledFor: args.scheduledFor,
    })
  },
})

export const updateSearchJobStatus = internalMutation({
  args: {
    jobId: v.id('searchJobs'),
    status: v.union(
      v.literal('pending'),
      v.literal('running'),
      v.literal('completed'),
      v.literal('failed'),
    ),
    errorMessage: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.jobId, {
      status: args.status,
      errorMessage: args.errorMessage,
    })
    return null
  },
})

export const saveSearchResults = internalMutation({
  args: {
    jobId: v.id('searchJobs'),
    opportunities: v.array(
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
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.runMutation(internal.functions.opportunities.bulkInsertOpportunities, {
      opportunities: args.opportunities,
    })

    await ctx.db.patch(args.jobId, {
      status: 'completed',
      resultsCount: args.opportunities.length,
      completedAt: Date.now(),
    })

    return null
  },
})

export const deduplicateResults = internalMutation({
  args: {
    opportunityIds: v.array(v.id('opportunities')),
  },
  returns: v.object({
    unique: v.array(v.id('opportunities')),
    duplicates: v.array(v.id('opportunities')),
  }),
  handler: async (ctx, args) => {
    const unique: Array<any> = []
    const duplicates: Array<any> = []
    const seen = new Set<string>()

    for (const id of args.opportunityIds) {
      const opp = await ctx.db.get(id)
      if (!opp) {
        continue
      }

      const key = `${opp.title.toLowerCase()}-${opp.provider.toLowerCase()}`
      if (seen.has(key)) {
        duplicates.push(id)
      } else {
        seen.add(key)
        unique.push(id)
      }
    }

    return { unique, duplicates }
  },
})

