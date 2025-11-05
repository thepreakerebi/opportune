import { v } from 'convex/values'
import { internalMutation, internalQuery, mutation, query } from '../_generated/server'
import { internal } from '../_generated/api'
import { requireAuth, requireOwnership } from './authHelpers'
import type { Id } from '../_generated/dataModel'

/**
 * Temporary storage for upload metadata before file validation
 * Used to store upload information before the file is actually uploaded
 */
const uploadMetadataStore = new Map<
  string,
  {
    userId: Id<'users'>
    fileName: string
    fileType: 'cv' | 'transcript' | 'reference' | 'passport' | 'certificate' | 'other'
    contentType: string
    size: number
    uploadUrl: string
    createdAt: number
  }
>()

/**
 * Store upload metadata temporarily (for validation after upload)
 */
export const storeUploadMetadata = internalMutation({
  args: {
    userId: v.id('users'),
    fileName: v.string(),
    fileType: v.union(
      v.literal('cv'),
      v.literal('transcript'),
      v.literal('reference'),
      v.literal('passport'),
      v.literal('certificate'),
      v.literal('other'),
    ),
    contentType: v.string(),
    size: v.number(),
    uploadUrl: v.string(),
  },
  returns: v.string(),
  handler: async (ctx, args) => {
    const uploadId = `${args.userId}_${Date.now()}_${Math.random().toString(36).substring(7)}`
    uploadMetadataStore.set(uploadId, {
      userId: args.userId,
      fileName: args.fileName,
      fileType: args.fileType,
      contentType: args.contentType,
      size: args.size,
      uploadUrl: args.uploadUrl,
      createdAt: Date.now(),
    })
    return uploadId
  },
})

/**
 * Get upload metadata
 */
export const getUploadMetadata = internalQuery({
  args: {
    uploadId: v.string(),
  },
  returns: v.union(
    v.object({
      userId: v.id('users'),
      fileName: v.string(),
      fileType: v.union(
        v.literal('cv'),
        v.literal('transcript'),
        v.literal('reference'),
        v.literal('passport'),
        v.literal('certificate'),
        v.literal('other'),
      ),
      contentType: v.string(),
      size: v.number(),
      uploadUrl: v.string(),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const metadata = uploadMetadataStore.get(args.uploadId)
    if (!metadata) {
      return null
    }

    // Clean up expired metadata (older than 1 hour)
    if (Date.now() - metadata.createdAt > 60 * 60 * 1000) {
      uploadMetadataStore.delete(args.uploadId)
      return null
    }

    return {
      userId: metadata.userId,
      fileName: metadata.fileName,
      fileType: metadata.fileType,
      contentType: metadata.contentType,
      size: metadata.size,
      uploadUrl: metadata.uploadUrl,
    }
  },
})

/**
 * Delete upload metadata
 */
export const deleteUploadMetadata = internalMutation({
  args: {
    uploadId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    uploadMetadataStore.delete(args.uploadId)
    return null
  },
})

/**
 * Create user file record after successful upload and validation
 */
export const createUserFile = internalMutation({
  args: {
    userId: v.id('users'),
    fileName: v.string(),
    fileType: v.union(
      v.literal('cv'),
      v.literal('transcript'),
      v.literal('reference'),
      v.literal('passport'),
      v.literal('certificate'),
      v.literal('other'),
    ),
    storageId: v.id('_storage'),
    contentType: v.string(),
    size: v.number(),
  },
  returns: v.id('userFiles'),
  handler: async (ctx, args) => {
    return await ctx.db.insert('userFiles', {
      userId: args.userId,
      fileName: args.fileName,
      fileType: args.fileType,
      storageId: args.storageId,
      contentType: args.contentType,
      size: args.size,
      uploadedAt: Date.now(),
    })
  },
})

/**
 * Store extracted text from PDF file
 */
export const storeExtractedText = internalMutation({
  args: {
    fileId: v.id('userFiles'),
    extractedText: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.fileId, {
      extractedText: args.extractedText,
    })
    return null
  },
})

/**
 * Get all user files
 */
export const getUserFiles = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id('userFiles'),
      userId: v.id('users'),
      fileName: v.string(),
      fileType: v.union(
        v.literal('cv'),
        v.literal('transcript'),
        v.literal('reference'),
        v.literal('passport'),
        v.literal('certificate'),
        v.literal('other'),
      ),
      storageId: v.id('_storage'),
      contentType: v.string(),
      size: v.number(),
      tags: v.optional(v.array(v.string())),
      uploadedAt: v.number(),
    }),
  ),
  handler: async (ctx) => {
    const user = await requireAuth(ctx)

    return await ctx.db
      .query('userFiles')
      .withIndex('by_userId', (q) => q.eq('userId', user._id))
      .order('desc')
      .collect()
  },
})

/**
 * Get user files by type
 */
export const getUserFilesByType = query({
  args: {
    fileType: v.union(
      v.literal('cv'),
      v.literal('transcript'),
      v.literal('reference'),
      v.literal('passport'),
      v.literal('certificate'),
      v.literal('other'),
    ),
  },
  returns: v.array(
    v.object({
      _id: v.id('userFiles'),
      userId: v.id('users'),
      fileName: v.string(),
      fileType: v.union(
        v.literal('cv'),
        v.literal('transcript'),
        v.literal('reference'),
        v.literal('passport'),
        v.literal('certificate'),
        v.literal('other'),
      ),
      storageId: v.id('_storage'),
      contentType: v.string(),
      size: v.number(),
      tags: v.optional(v.array(v.string())),
      uploadedAt: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx)

    return await ctx.db
      .query('userFiles')
      .withIndex('by_userId_and_fileType', (q) => q.eq('userId', user._id).eq('fileType', args.fileType))
      .order('desc')
      .collect()
  },
})

/**
 * Get file download URL
 */
export const getFileUrl = query({
  args: {
    fileId: v.id('userFiles'),
  },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx)

    const file = await ctx.db.get(args.fileId)
    if (!file) {
      return null
    }

    // Verify ownership
    await requireOwnership(ctx, file.userId, 'File')

    return await ctx.storage.getUrl(file.storageId)
  },
})

/**
 * Delete user file
 */
export const deleteFile = mutation({
  args: {
    fileId: v.id('userFiles'),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx)

    const file = await ctx.db.get(args.fileId)
    if (!file) {
      throw new Error('File not found')
    }

    // Verify ownership
    await requireOwnership(ctx, file.userId, 'File')

    // Delete file from storage
    await ctx.storage.delete(file.storageId)

    // Delete file record
    await ctx.db.delete(args.fileId)

    return null
  },
})

/**
 * Update file metadata
 */
export const updateFileMetadata = mutation({
  args: {
    fileId: v.id('userFiles'),
    fileName: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx)

    const file = await ctx.db.get(args.fileId)
    if (!file) {
      throw new Error('File not found')
    }

    // Verify ownership
    await requireOwnership(ctx, file.userId, 'File')

    await ctx.db.patch(args.fileId, {
      fileName: args.fileName,
      tags: args.tags,
    })

    return null
  },
})

/**
 * Get user files for internal use (matching, etc.)
 */
export const getUserFilesInternal = internalQuery({
  args: {
    userId: v.id('users'),
  },
  returns: v.array(
    v.object({
      _id: v.id('userFiles'),
      userId: v.id('users'),
      fileName: v.string(),
      fileType: v.union(
        v.literal('cv'),
        v.literal('transcript'),
        v.literal('reference'),
        v.literal('passport'),
        v.literal('certificate'),
        v.literal('other'),
      ),
      storageId: v.id('_storage'),
      contentType: v.string(),
      size: v.number(),
      extractedText: v.optional(v.string()),
      embedding: v.optional(v.array(v.number())),
      embeddingText: v.optional(v.string()),
      tags: v.optional(v.array(v.string())),
      uploadedAt: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    return await ctx.db
      .query('userFiles')
      .withIndex('by_userId', (q) => q.eq('userId', args.userId))
      .order('desc')
      .collect()
  },
})

/**
 * Get user file by ID (internal)
 */
export const getUserFileByIdInternal = internalQuery({
  args: {
    fileId: v.id('userFiles'),
  },
  returns: v.union(
    v.object({
      _id: v.id('userFiles'),
      userId: v.id('users'),
      fileName: v.string(),
      fileType: v.union(
        v.literal('cv'),
        v.literal('transcript'),
        v.literal('reference'),
        v.literal('passport'),
        v.literal('certificate'),
        v.literal('other'),
      ),
      storageId: v.id('_storage'),
      contentType: v.string(),
      size: v.number(),
      extractedText: v.optional(v.string()),
      embedding: v.optional(v.array(v.number())),
      embeddingText: v.optional(v.string()),
      tags: v.optional(v.array(v.string())),
      uploadedAt: v.number(),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    return await ctx.db.get(args.fileId)
  },
})

/**
 * Match user files to opportunity requirements using semantic search
 * Note: This must be an action because it calls another action (semantic search)
 */
export const matchFilesToRequirements = query({
  args: {
    opportunityId: v.id('opportunities'),
  },
  returns: v.object({
    matched: v.array(
      v.object({
        fileId: v.id('userFiles'),
        requirement: v.string(),
        matchScore: v.number(),
      }),
    ),
    missing: v.array(v.string()),
  }),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx)

    const opportunity = await ctx.db.get(args.opportunityId)
    if (!opportunity) {
      throw new Error('Opportunity not found')
    }

    // Get user files with embeddings
    const userFiles = await ctx.db
      .query('userFiles')
      .withIndex('by_userId', (q) => q.eq('userId', user._id))
      .collect()

    // For now, return basic matching results
    // Semantic matching will be implemented via a separate action endpoint
    // that can be called from the client
    const matched: Array<{ fileId: Id<'userFiles'>; requirement: string; matchScore: number }> = []
    const missing: Array<string> = []

    for (const requirement of opportunity.requiredDocuments) {
      const reqLower = requirement.toLowerCase()
      let bestMatch: { fileId: Id<'userFiles'>; matchScore: number } | null = null

      for (const file of userFiles) {
        const fileNameLower = file.fileName.toLowerCase()
        const fileTypeLower = file.fileType.toLowerCase()
        const tagsLower = file.tags?.map((t) => t.toLowerCase()).join(' ') ?? ''

        // Basic keyword matching (semantic matching requires action)
        const nameMatch = fileNameLower.includes(reqLower) || reqLower.includes(fileNameLower)
        const typeMatch = reqLower.includes(fileTypeLower) || fileTypeLower.includes(reqLower)
        const tagMatch = tagsLower.includes(reqLower) || reqLower.includes(tagsLower)

        if (nameMatch || typeMatch || tagMatch) {
          const score = nameMatch ? 80 : typeMatch ? 60 : 40
          if (!bestMatch || score > bestMatch.matchScore) {
            bestMatch = {
              fileId: file._id,
              matchScore: score,
            }
          }
        }
      }

      if (bestMatch) {
        matched.push({
          fileId: bestMatch.fileId,
          requirement,
          matchScore: bestMatch.matchScore,
        })
      } else {
        missing.push(requirement)
      }
    }

    return {
      matched,
      missing,
    }
  },
})
