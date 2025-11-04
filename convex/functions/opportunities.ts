import { v } from 'convex/values'
import { paginationOptsValidator } from 'convex/server'
import { internalMutation, internalQuery, query } from '../_generated/server'
import { internal } from '../_generated/api'
import { requireAuth } from './authHelpers'
import type { Id } from '../_generated/dataModel'

export const listOpportunities = query({
  args: {
    paginationOpts: paginationOptsValidator,
    educationLevel: v.optional(
      v.union(v.literal('undergraduate'), v.literal('masters'), v.literal('phd')),
    ),
    discipline: v.optional(v.string()),
    region: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    sourceType: v.optional(
      v.union(
        v.literal('general_search'),
        v.literal('profile_search'),
        v.literal('crawl'),
      ),
    ),
  },
  returns: v.object({
    page: v.array(
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
      }),
    ),
    isDone: v.boolean(),
    continueCursor: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, args) => {
    let opportunitiesQuery
    if (args.sourceType) {
      opportunitiesQuery = ctx.db
        .query('opportunities')
        .withIndex('by_sourceType', (q: any) => q.eq('sourceType', args.sourceType!))
    } else {
      opportunitiesQuery = ctx.db.query('opportunities').withIndex('by_deadline')
    }

    const results = await opportunitiesQuery.order('asc').paginate(args.paginationOpts)

    let filtered = results.page

    // Filter by tags if provided
    if (args.tags && args.tags.length > 0) {
      filtered = filtered.filter((opp) =>
        args.tags!.some((tag) => opp.tags.includes(tag)),
      )
    }

    if (args.educationLevel || args.discipline || args.region) {
      filtered = filtered.filter((opp) => {
        if (args.educationLevel) {
          const reqs = opp.requirements.join(' ').toLowerCase()
          if (!reqs.includes(args.educationLevel.toLowerCase())) {
            return false
          }
        }
        if (args.discipline) {
          const reqs = opp.requirements.join(' ').toLowerCase()
          if (!reqs.includes(args.discipline.toLowerCase())) {
            return false
          }
        }
        if (args.region && opp.region !== args.region) {
          return false
        }
        return true
      })
    }

    return {
      ...results,
      page: filtered,
    }
  },
})

export const getOpportunityById = query({
  args: {
    opportunityId: v.id('opportunities'),
  },
  returns: v.union(
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
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    return await ctx.db.get(args.opportunityId)
  },
})

export const getRecommendedOpportunities = query({
  args: {
    paginationOpts: paginationOptsValidator,
  },
  returns: v.object({
    page: v.array(
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
      }),
    ),
    isDone: v.boolean(),
    continueCursor: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, args) => {
    // Require authentication for personalized recommendations
    await requireAuth(ctx)

    return await ctx.db
      .query('opportunities')
      .withIndex('by_deadline')
      .filter((q: any) => q.field('tags').includes('For You'))
      .order('asc')
      .paginate(args.paginationOpts)
  },
})

export const getOpportunityByIdInternal = internalQuery({
  args: {
    opportunityId: v.id('opportunities'),
  },
  returns: v.union(
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
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    return await ctx.db.get(args.opportunityId)
  },
})

export const bulkInsertOpportunities = internalMutation({
  args: {
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
  returns: v.array(v.id('opportunities')),
  handler: async (ctx, args) => {
    const now = Date.now()
    const ids: Array<Id<'opportunities'>> = []

    for (const opp of args.opportunities) {
      // Generate embedding text for future embedding generation
      const embeddingText = [
        opp.title,
        opp.provider,
        opp.description,
        opp.requirements.join(' '),
        opp.region ?? '',
      ]
        .filter(Boolean)
        .join(' ')

      const id = await ctx.db.insert('opportunities', {
        ...opp,
        embeddingText,
        lastUpdated: now,
        createdAt: now,
      })
      ids.push(id)

      // Schedule embedding generation asynchronously
      await ctx.scheduler.runAfter(0, (internal.functions as any).embeddings.generateOpportunityEmbedding, {
        opportunityId: id,
      })
    }

    return ids
  },
})

export const getOpportunitiesWithoutEmbeddings = internalQuery({
  args: {
    limit: v.optional(v.number()),
  },
  returns: v.array(
    v.object({
      _id: v.id('opportunities'),
    }),
  ),
  handler: async (ctx, args) => {
    const allOpportunities = await ctx.db.query('opportunities').collect()
    const withoutEmbeddings = allOpportunities
      .filter((opp) => !opp.embedding || opp.embedding.length === 0)
      .slice(0, args.limit ?? 50)
    return withoutEmbeddings.map((opp) => ({ _id: opp._id }))
  },
})

export const getAllOpportunitiesWithEmbeddings = internalQuery({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id('opportunities'),
      embedding: v.optional(v.array(v.number())),
    }),
  ),
  handler: async (ctx) => {
    const allOpportunities = await ctx.db.query('opportunities').collect()
    return allOpportunities.map((opp) => ({
      _id: opp._id,
      embedding: opp.embedding,
    }))
  },
})

/**
 * Get all opportunities created after a specific timestamp
 * Used for matching recent opportunities to users
 */
export const getAllRecentOpportunities = internalQuery({
  args: {
    sinceTimestamp: v.number(),
  },
  returns: v.array(
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
    }),
  ),
  handler: async (ctx, args) => {
    const allOpportunities = await ctx.db.query('opportunities').collect()
    return allOpportunities.filter((opp) => opp.createdAt >= args.sinceTimestamp)
  },
})

