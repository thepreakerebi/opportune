import { v } from 'convex/values'
import { internalMutation } from '../_generated/server'

/**
 * Store opportunity embedding in database
 * This must be in a V8 file (no 'use node') because it's a mutation
 */
export const storeOpportunityEmbedding = internalMutation({
  args: {
    opportunityId: v.id('opportunities'),
    embedding: v.array(v.number()),
    embeddingText: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.opportunityId, {
      embedding: args.embedding,
      embeddingText: args.embeddingText,
    })
    return null
  },
})

/**
 * Store user profile embedding in database
 * This must be in a V8 file (no 'use node') because it's a mutation
 */
export const storeUserProfileEmbedding = internalMutation({
  args: {
    userId: v.id('users'),
    embedding: v.array(v.number()),
    embeddingText: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.userId, {
      profileEmbedding: args.embedding,
      embeddingText: args.embeddingText,
    })
    return null
  },
})

/**
 * Store document embedding in database
 * This must be in a V8 file (no 'use node') because it's a mutation
 */
export const storeDocumentEmbedding = internalMutation({
  args: {
    documentId: v.id('documents'),
    embedding: v.array(v.number()),
    embeddingText: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.documentId, {
      embedding: args.embedding,
      embeddingText: args.embeddingText,
    })
    return null
  },
})

/**
 * Store user file embedding in database
 * This must be in a V8 file (no 'use node') because it's a mutation
 */
export const storeUserFileEmbedding = internalMutation({
  args: {
    fileId: v.id('userFiles'),
    embedding: v.array(v.number()),
    embeddingText: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.fileId, {
      embedding: args.embedding,
      embeddingText: args.embeddingText,
    })
    return null
  },
})
