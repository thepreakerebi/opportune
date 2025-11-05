import { v } from 'convex/values'
import { internalMutation, internalQuery, mutation, query } from '../_generated/server'
import { internal } from '../_generated/api'
import { requireAuth, requireOwnership } from './authHelpers'

/**
 * Platform-generated documents (AI-generated essays, assembled documents, etc.)
 * These are created by the system, not uploaded by users
 * User-uploaded files are in the userFiles table
 */

export const getUserDocuments = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id('documents'),
      userId: v.id('users'),
      applicationId: v.optional(v.id('applications')),
      opportunityId: v.optional(v.id('opportunities')),
      name: v.string(),
      type: v.union(
        v.literal('essay'),
        v.literal('cover_letter'),
        v.literal('statement'),
        v.literal('application_package'),
        v.literal('other'),
      ),
      content: v.optional(v.string()),
      storageId: v.optional(v.id('_storage')),
      tags: v.optional(v.array(v.string())),
      createdAt: v.number(),
      updatedAt: v.number(),
    }),
  ),
  handler: async (ctx) => {
    const user = await requireAuth(ctx)

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
      v.literal('essay'),
      v.literal('cover_letter'),
      v.literal('statement'),
      v.literal('application_package'),
      v.literal('other'),
    ),
  },
  returns: v.array(
    v.object({
      _id: v.id('documents'),
      userId: v.id('users'),
      applicationId: v.optional(v.id('applications')),
      opportunityId: v.optional(v.id('opportunities')),
      name: v.string(),
      type: v.union(
        v.literal('essay'),
        v.literal('cover_letter'),
        v.literal('statement'),
        v.literal('application_package'),
        v.literal('other'),
      ),
      content: v.optional(v.string()),
      storageId: v.optional(v.id('_storage')),
      tags: v.optional(v.array(v.string())),
      createdAt: v.number(),
      updatedAt: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx)

    return await ctx.db
      .query('documents')
      .withIndex('by_userId_and_type', (q) => q.eq('userId', user._id).eq('type', args.type))
      .order('desc')
      .collect()
  },
})

export const getDocumentById = query({
  args: {
    documentId: v.id('documents'),
  },
  returns: v.union(
    v.object({
      _id: v.id('documents'),
      userId: v.id('users'),
      applicationId: v.optional(v.id('applications')),
      opportunityId: v.optional(v.id('opportunities')),
      name: v.string(),
      type: v.union(
        v.literal('essay'),
        v.literal('cover_letter'),
        v.literal('statement'),
        v.literal('application_package'),
        v.literal('other'),
      ),
      content: v.optional(v.string()),
      storageId: v.optional(v.id('_storage')),
      tags: v.optional(v.array(v.string())),
      createdAt: v.number(),
      updatedAt: v.number(),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx)

    const document = await ctx.db.get(args.documentId)
    if (!document) {
      return null
    }

    // Verify ownership
    await requireOwnership(ctx, document.userId, 'Document')

    return document
  },
})

export const getDocumentUrl = query({
  args: {
    documentId: v.id('documents'),
  },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx)

    const document = await ctx.db.get(args.documentId)
    if (!document) {
      return null
    }

    // Verify ownership
    await requireOwnership(ctx, document.userId, 'Document')

    if (!document.storageId) {
      return null
    }

    return await ctx.storage.getUrl(document.storageId)
  },
})

/**
 * Create a platform-generated document (e.g., AI-generated essay)
 */
export const createDocument = mutation({
  args: {
    name: v.string(),
    type: v.union(
      v.literal('essay'),
      v.literal('cover_letter'),
      v.literal('statement'),
      v.literal('application_package'),
      v.literal('other'),
    ),
    content: v.optional(v.string()),
    applicationId: v.optional(v.id('applications')),
    opportunityId: v.optional(v.id('opportunities')),
    tags: v.optional(v.array(v.string())),
  },
  returns: v.id('documents'),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx)

    const now = Date.now()
    return await ctx.db.insert('documents', {
      userId: user._id,
      applicationId: args.applicationId,
      opportunityId: args.opportunityId,
      name: args.name,
      type: args.type,
      content: args.content,
      tags: args.tags,
      createdAt: now,
      updatedAt: now,
    })
  },
})

/**
 * Update platform-generated document
 */
export const updateDocument = mutation({
  args: {
    documentId: v.id('documents'),
    name: v.optional(v.string()),
    content: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx)

    const document = await ctx.db.get(args.documentId)
    if (!document) {
      throw new Error('Document not found')
    }

    // Verify ownership
    await requireOwnership(ctx, document.userId, 'Document')

    await ctx.db.patch(args.documentId, {
      name: args.name,
      content: args.content,
      tags: args.tags,
      updatedAt: Date.now(),
    })

    return null
  },
})

/**
 * Delete platform-generated document
 */
export const deleteDocument = mutation({
  args: {
    documentId: v.id('documents'),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx)

    const document = await ctx.db.get(args.documentId)
    if (!document) {
      throw new Error('Document not found')
    }

    // Verify ownership
    await requireOwnership(ctx, document.userId, 'Document')

    // Delete file from storage if exists
    if (document.storageId) {
      await ctx.storage.delete(document.storageId)
    }

    // Delete document record
    await ctx.db.delete(args.documentId)

    return null
  },
})

/**
 * Get documents for an application
 */
export const getDocumentsByApplication = query({
  args: {
    applicationId: v.id('applications'),
  },
  returns: v.array(
    v.object({
      _id: v.id('documents'),
      userId: v.id('users'),
      applicationId: v.optional(v.id('applications')),
      opportunityId: v.optional(v.id('opportunities')),
      name: v.string(),
      type: v.union(
        v.literal('essay'),
        v.literal('cover_letter'),
        v.literal('statement'),
        v.literal('application_package'),
        v.literal('other'),
      ),
      content: v.optional(v.string()),
      storageId: v.optional(v.id('_storage')),
      tags: v.optional(v.array(v.string())),
      createdAt: v.number(),
      updatedAt: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx)

    // Verify application ownership
    const application = await ctx.db.get(args.applicationId)
    if (!application) {
      throw new Error('Application not found')
    }
    await requireOwnership(ctx, application.userId, 'Application')

    return await ctx.db
      .query('documents')
      .withIndex('by_applicationId', (q) => q.eq('applicationId', args.applicationId))
      .order('desc')
      .collect()
  },
})

/**
 * Internal query: Get document by ID
 */
export const getDocumentByIdInternal = internalQuery({
  args: {
    documentId: v.id('documents'),
  },
  returns: v.union(
    v.object({
      _id: v.id('documents'),
      userId: v.id('users'),
      applicationId: v.optional(v.id('applications')),
      opportunityId: v.optional(v.id('opportunities')),
      name: v.string(),
      type: v.union(
        v.literal('essay'),
        v.literal('cover_letter'),
        v.literal('statement'),
        v.literal('application_package'),
        v.literal('other'),
      ),
      content: v.optional(v.string()),
      storageId: v.optional(v.id('_storage')),
      embedding: v.optional(v.array(v.number())),
      embeddingText: v.optional(v.string()),
      tags: v.optional(v.array(v.string())),
      createdAt: v.number(),
      updatedAt: v.number(),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    return await ctx.db.get(args.documentId)
  },
})
