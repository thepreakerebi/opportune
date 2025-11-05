import { v } from 'convex/values'
import { internalMutation, internalQuery, mutation, query } from '../_generated/server'
import { internal } from '../_generated/api'
import { requireAuth, requireOwnership } from './authHelpers'

/**
 * User-created documents (essays, cover letters, statements, etc.)
 * Created by users using BlockNote.js with AI integration
 * Users have full control over content creation and editing
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
      blocks: v.optional(v.any()), // BlockNote.js blocks
      content: v.optional(v.string()), // Deprecated: plain text
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
      blocks: v.optional(v.any()), // BlockNote.js blocks
      content: v.optional(v.string()), // Deprecated: plain text
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
      blocks: v.optional(v.any()), // BlockNote.js blocks
      content: v.optional(v.string()), // Deprecated: plain text
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
 * Create a user-created document (e.g., essay created via BlockNote.js)
 * Users create documents themselves using BlockNote.js editor with AI assistance
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
    blocks: v.optional(v.any()), // BlockNote.js blocks array
    content: v.optional(v.string()), // Deprecated: plain text (for backward compatibility)
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
      blocks: args.blocks,
      content: args.content,
      tags: args.tags,
      createdAt: now,
      updatedAt: now,
    })
  },
})

/**
 * Update user-created document
 */
export const updateDocument = mutation({
  args: {
    documentId: v.id('documents'),
    name: v.optional(v.string()),
    blocks: v.optional(v.any()), // BlockNote.js blocks array
    content: v.optional(v.string()), // Deprecated: plain text (for backward compatibility)
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

    const updateData: {
      name?: string
      blocks?: any
      content?: string
      tags?: Array<string>
      updatedAt: number
    } = {
      updatedAt: Date.now(),
    }

    if (args.name !== undefined) updateData.name = args.name
    if (args.blocks !== undefined) updateData.blocks = args.blocks
    if (args.content !== undefined) updateData.content = args.content
    if (args.tags !== undefined) updateData.tags = args.tags

    await ctx.db.patch(args.documentId, updateData)

    return null
  },
})

/**
 * Delete user-created document
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
      blocks: v.optional(v.any()), // BlockNote.js blocks
      content: v.optional(v.string()), // Deprecated: plain text
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
      blocks: v.optional(v.any()), // BlockNote.js blocks
      content: v.optional(v.string()), // Deprecated: plain text
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
