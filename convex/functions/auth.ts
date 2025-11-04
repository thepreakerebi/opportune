import { v } from 'convex/values'
import { internalAction, internalMutation } from '../_generated/server'
import { internal } from '../_generated/api'

export const handleGoogleAuth = internalAction({
  args: {
    email: v.string(),
    name: v.optional(v.string()),
    picture: v.optional(v.string()),
  },
  returns: v.id('users'),
  handler: async (ctx, args): Promise<any> => {
    const userId: any = await ctx.runMutation(internal.functions.users.syncUserFromAuth, {
      email: args.email,
      name: args.name,
      picture: args.picture,
    })

    await ctx.runMutation(internal.functions.matching.tagRecommendedOpportunities, {
      userId,
    })

    return userId
  },
})

export const syncUserFromGoogle = internalMutation({
  args: {
    email: v.string(),
    name: v.optional(v.string()),
    picture: v.optional(v.string()),
  },
  returns: v.id('users'),
  handler: async (ctx, args): Promise<any> => {
    return await ctx.runMutation(internal.functions.users.syncUserFromAuth, {
      email: args.email,
      name: args.name,
      picture: args.picture,
    })
  },
})

