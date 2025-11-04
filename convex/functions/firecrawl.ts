'use node'

import { v } from 'convex/values'
import { internalAction } from '../_generated/server'
import { internal } from '../_generated/api'

export const runGeneralSearch = internalAction({
  args: {
    searchQuery: v.string(),
    limit: v.optional(v.number()),
  },
  returns: v.object({
    jobId: v.id('searchJobs'),
  }),
  handler: async (ctx, args): Promise<{ jobId: any }> => {
    const jobId: any = await ctx.runMutation(internal.functions.firecrawlMutations.saveSearchJob, {
      type: 'general_search',
      searchQuery: args.searchQuery,
      scheduledFor: Date.now(),
    })

    return { jobId }
  },
})

export const runProfileSearch = internalAction({
  args: {
    userId: v.id('users'),
    searchQuery: v.string(),
  },
  returns: v.object({
    jobId: v.id('searchJobs'),
  }),
  handler: async (ctx, args): Promise<{ jobId: any }> => {
    const jobId: any = await ctx.runMutation(internal.functions.firecrawlMutations.saveSearchJob, {
      type: 'profile_search',
      userId: args.userId,
      searchQuery: args.searchQuery,
      scheduledFor: Date.now(),
    })

    return { jobId }
  },
})

export const scrapeOpportunityUrl = internalAction({
  args: {
    url: v.string(),
  },
  returns: v.object({
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    content: v.optional(v.string()),
  }),
  handler: async (ctx, args): Promise<{ title?: string; description?: string; content?: string }> => {
    return {
      title: undefined,
      description: undefined,
      content: undefined,
    }
  },
})

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
  handler: async (ctx, args): Promise<{
    title: string
    provider: string
    description: string
    requirements: Array<string>
    deadline: string
    applicationUrl: string
    requiredDocuments: Array<string>
  }> => {
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

