import { v } from 'convex/values'
import { internalMutation, internalQuery, mutation, query } from '../_generated/server'
import { internal } from '../_generated/api'

async function getUserFromAuth(ctx: any) {
  const identity = await ctx.auth.getUserIdentity()
  if (!identity) {
    return null
  }

  const email = identity.email
  if (!email) {
    return null
  }

  const user = await ctx.db
    .query('users')
    .withIndex('by_email', (q: any) => q.eq('email', email))
    .first()

  return user
}

export const getUserDocuments = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id('documents'),
      userId: v.id('users'),
      name: v.string(),
      type: v.union(
        v.literal('cv'),
        v.literal('transcript'),
        v.literal('reference'),
        v.literal('passport'),
        v.literal('certificate'),
        v.literal('essay'),
        v.literal('other'),
      ),
      storageId: v.id('_storage'),
      metadata: v.optional(
        v.object({
          size: v.number(),
          contentType: v.string(),
        }),
      ),
      tags: v.optional(v.array(v.string())),
      createdAt: v.number(),
    }),
  ),
  handler: async (ctx) => {
    const user = await getUserFromAuth(ctx)
    if (!user) {
      throw new Error('Not authenticated')
    }

    return await ctx.db
      .query('documents')
      .withIndex('by_userId', (q) => q.eq('userId', user._id))
      .order('desc')
      .collect()
  },
})

export const getDocumentsByType = query({
  args: {
    type: v.union(
      v.literal('cv'),
      v.literal('transcript'),
      v.literal('reference'),
      v.literal('passport'),
      v.literal('certificate'),
      v.literal('essay'),
      v.literal('other'),
    ),
  },
  returns: v.array(
    v.object({
      _id: v.id('documents'),
      userId: v.id('users'),
      name: v.string(),
      type: v.union(
        v.literal('cv'),
        v.literal('transcript'),
        v.literal('reference'),
        v.literal('passport'),
        v.literal('certificate'),
        v.literal('essay'),
        v.literal('other'),
      ),
      storageId: v.id('_storage'),
      metadata: v.optional(
        v.object({
          size: v.number(),
          contentType: v.string(),
        }),
      ),
      tags: v.optional(v.array(v.string())),
      createdAt: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    const user = await getUserFromAuth(ctx)
    if (!user) {
      throw new Error('Not authenticated')
    }

    return await ctx.db
      .query('documents')
      .withIndex('by_userId_and_type', (q) => q.eq('userId', user._id).eq('type', args.type))
      .order('desc')
      .collect()
  },
})

export const getDocumentUrl = query({
  args: {
    documentId: v.id('documents'),
  },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args) => {
    const user = await getUserFromAuth(ctx)
    if (!user) {
      throw new Error('Not authenticated')
    }

    const document = await ctx.db.get(args.documentId)
    if (!document || document.userId !== user._id) {
      return null
    }

    return await ctx.storage.getUrl(document.storageId)
  },
})

export const uploadDocument = mutation({
  args: {
    name: v.string(),
    type: v.union(
      v.literal('cv'),
      v.literal('transcript'),
      v.literal('reference'),
      v.literal('passport'),
      v.literal('certificate'),
      v.literal('essay'),
      v.literal('other'),
    ),
    storageId: v.id('_storage'),
    metadata: v.optional(
      v.object({
        size: v.number(),
        contentType: v.string(),
      }),
    ),
    tags: v.optional(v.array(v.string())),
  },
  returns: v.id('documents'),
  handler: async (ctx, args) => {
    const user = await getUserFromAuth(ctx)
    if (!user) {
      throw new Error('Not authenticated')
    }

    return await ctx.db.insert('documents', {
      userId: user._id,
      name: args.name,
      type: args.type,
      storageId: args.storageId,
      metadata: args.metadata,
      tags: args.tags,
      createdAt: Date.now(),
    })
  },
})

export const updateDocumentMetadata = mutation({
  args: {
    documentId: v.id('documents'),
    name: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await getUserFromAuth(ctx)
    if (!user) {
      throw new Error('Not authenticated')
    }

    const document = await ctx.db.get(args.documentId)
    if (!document || document.userId !== user._id) {
      throw new Error('Document not found')
    }

    await ctx.db.patch(args.documentId, {
      name: args.name,
      tags: args.tags,
    })

    return null
  },
})

export const deleteDocument = mutation({
  args: {
    documentId: v.id('documents'),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await getUserFromAuth(ctx)
    if (!user) {
      throw new Error('Not authenticated')
    }

    const document = await ctx.db.get(args.documentId)
    if (!document || document.userId !== user._id) {
      throw new Error('Document not found')
    }

    await ctx.storage.delete(document.storageId)
    await ctx.db.delete(args.documentId)

    return null
  },
})

export const matchDocumentsToApplication = mutation({
  args: {
    applicationId: v.id('applications'),
  },
  returns: v.object({
    matched: v.array(
      v.object({
        documentId: v.id('documents'),
        requirement: v.string(),
      }),
    ),
    missing: v.array(v.string()),
  }),
  handler: async (ctx, args) => {
    const user = await getUserFromAuth(ctx)
    if (!user) {
      throw new Error('Not authenticated')
    }

    const application = await ctx.db.get(args.applicationId)
    if (!application || application.userId !== user._id) {
      throw new Error('Application not found')
    }

    const opportunity = await ctx.db.get(application.opportunityId)
    if (!opportunity) {
      throw new Error('Opportunity not found')
    }

    const documents = await ctx.db
      .query('documents')
      .withIndex('by_userId', (q) => q.eq('userId', user._id))
      .collect()

    const matched: Array<{ documentId: any; requirement: string }> = []
    const missing: Array<string> = []

    for (const requirement of opportunity.requiredDocuments) {
      const reqLower = requirement.toLowerCase()
      const doc = documents.find((d) => {
        const nameLower = d.name.toLowerCase()
        const typeMatch = reqLower.includes(d.type) || nameLower.includes(reqLower)
        const tagMatch = d.tags?.some((tag) => reqLower.includes(tag.toLowerCase()))
        return typeMatch || tagMatch
      })

      if (doc) {
        matched.push({ documentId: doc._id, requirement })
      } else {
        missing.push(requirement)
      }
    }

    return { matched, missing }
  },
})

export const matchDocumentsToApplicationInternal = internalMutation({
  args: {
    applicationId: v.id('applications'),
  },
  returns: v.object({
    matched: v.array(
      v.object({
        documentId: v.id('documents'),
        requirement: v.string(),
      }),
    ),
    missing: v.array(v.string()),
  }),
  handler: async (ctx, args) => {
    const application = await ctx.db.get(args.applicationId)
    if (!application) {
      throw new Error('Application not found')
    }

    const opportunity = await ctx.db.get(application.opportunityId)
    if (!opportunity) {
      throw new Error('Opportunity not found')
    }

    const documents = await ctx.db
      .query('documents')
      .withIndex('by_userId', (q) => q.eq('userId', application.userId))
      .collect()

    const matched: Array<{ documentId: any; requirement: string }> = []
    const missing: Array<string> = []

    for (const requirement of opportunity.requiredDocuments) {
      const reqLower = requirement.toLowerCase()
      const doc = documents.find((d) => {
        const nameLower = d.name.toLowerCase()
        const typeMatch = reqLower.includes(d.type) || nameLower.includes(reqLower)
        const tagMatch = d.tags?.some((tag) => reqLower.includes(tag.toLowerCase()))
        return typeMatch || tagMatch
      })

      if (doc) {
        matched.push({ documentId: doc._id, requirement })
      } else {
        missing.push(requirement)
      }
    }

    return { matched, missing }
  },
})

export const getUserDocumentsInternal = internalQuery({
  args: {
    userId: v.id('users'),
  },
  returns: v.array(
    v.object({
      _id: v.id('documents'),
      userId: v.id('users'),
      name: v.string(),
      type: v.union(
        v.literal('cv'),
        v.literal('transcript'),
        v.literal('reference'),
        v.literal('passport'),
        v.literal('certificate'),
        v.literal('essay'),
        v.literal('other'),
      ),
      storageId: v.id('_storage'),
      metadata: v.optional(
        v.object({
          size: v.number(),
          contentType: v.string(),
        }),
      ),
      tags: v.optional(v.array(v.string())),
      createdAt: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    return await ctx.db
      .query('documents')
      .withIndex('by_userId', (q: any) => q.eq('userId', args.userId))
      .order('desc')
      .collect()
  },
})

export const getDocumentByIdInternal = internalQuery({
  args: {
    documentId: v.id('documents'),
  },
  returns: v.union(
    v.object({
      _id: v.id('documents'),
      userId: v.id('users'),
      name: v.string(),
      type: v.union(
        v.literal('cv'),
        v.literal('transcript'),
        v.literal('reference'),
        v.literal('passport'),
        v.literal('certificate'),
        v.literal('essay'),
        v.literal('other'),
      ),
      storageId: v.id('_storage'),
      metadata: v.optional(
        v.object({
          size: v.number(),
          contentType: v.string(),
        }),
      ),
      tags: v.optional(v.array(v.string())),
      embedding: v.optional(v.array(v.number())),
      embeddingText: v.optional(v.string()),
      createdAt: v.number(),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    return await ctx.db.get(args.documentId)
  },
})

