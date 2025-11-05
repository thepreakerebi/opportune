'use node'

import { v } from 'convex/values'
import { action, internalAction } from '../_generated/server'
import { api, internal } from '../_generated/api'
import type { Id } from '../_generated/dataModel'

/**
 * File upload security constants
 */
const MAX_FILE_SIZE_PDF = 10 * 1024 * 1024 // 10MB for PDFs
const MAX_FILE_SIZE_IMAGE = 5 * 1024 * 1024 // 5MB for images
const ALLOWED_PDF_TYPES = ['application/pdf']
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif']

/**
 * PDF magic bytes (file signatures) for content validation
 */
const PDF_MAGIC_BYTES = [
  [0x25, 0x50, 0x44, 0x46], // %PDF
]

/**
 * Image magic bytes (file signatures) for content validation
 */
const IMAGE_MAGIC_BYTES: Record<string, Array<Array<number>>> = {
  'image/jpeg': [[0xff, 0xd8, 0xff]],
  'image/png': [[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
  'image/webp': [[0x52, 0x49, 0x46, 0x46], [0x57, 0x45, 0x42, 0x50]], // RIFF....WEBP
  'image/gif': [[0x47, 0x49, 0x46, 0x38, 0x37, 0x61], [0x47, 0x49, 0x46, 0x38, 0x39, 0x61]], // GIF87a or GIF89a
}

/**
 * Generate upload URL for user file upload
 * Client uploads file to this URL, then calls confirmFileUpload
 */
export const generateFileUploadUrl = action({
  args: {
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
  },
  returns: v.object({
    uploadUrl: v.string(),
    uploadId: v.string(),
  }),
  handler: async (ctx, args) => {
    // Get authenticated user
    const user = await ctx.runQuery(api.functions.users.getCurrentUser, {})
    if (!user) {
      throw new Error('Not authenticated')
    }

    // Validate file type (only PDFs and images)
    const allowedTypes = [...ALLOWED_PDF_TYPES, ...ALLOWED_IMAGE_TYPES]
    if (!allowedTypes.includes(args.contentType)) {
      throw new Error(`File type not allowed. Only PDFs and images are accepted.`)
    }

    // Validate file size
    const isPDF = ALLOWED_PDF_TYPES.includes(args.contentType)
    const maxSize = isPDF ? MAX_FILE_SIZE_PDF : MAX_FILE_SIZE_IMAGE
    if (args.size > maxSize) {
      const maxSizeMB = Math.round(maxSize / (1024 * 1024))
      throw new Error(`File size exceeds limit. Maximum size: ${maxSizeMB}MB for ${isPDF ? 'PDFs' : 'images'}`)
    }

    if (args.size <= 0) {
      throw new Error('File size must be greater than 0')
    }

    // Validate filename (prevent path traversal)
    const sanitizedFileName = sanitizeFileName(args.fileName)
    if (!sanitizedFileName) {
      throw new Error('Invalid file name')
    }

    // Generate upload URL
    const uploadUrl = await ctx.storage.generateUploadUrl()

    // Store upload metadata temporarily for validation after upload
    const uploadId = await ctx.runMutation(internal.functions.userFiles.storeUploadMetadata, {
      userId: user._id,
      fileName: sanitizedFileName,
      fileType: args.fileType,
      contentType: args.contentType,
      size: args.size,
      uploadUrl: uploadUrl,
    })

    return {
      uploadUrl,
      uploadId,
    }
  },
})

/**
 * Confirm file upload after client uploads file
 * Validates file content and creates user file record
 */
export const confirmFileUpload = action({
  args: {
    uploadId: v.string(),
    storageId: v.id('_storage'),
  },
  returns: v.object({
    fileId: v.id('userFiles'),
  }),
  handler: async (ctx, args) => {
    // Get authenticated user
    const user = await ctx.runQuery(api.functions.users.getCurrentUser, {})
    if (!user) {
      throw new Error('Not authenticated')
    }

    // Get upload metadata
    const uploadMetadata = await ctx.runQuery(internal.functions.userFiles.getUploadMetadata, {
      uploadId: args.uploadId,
    })

    if (!uploadMetadata) {
      throw new Error('Upload metadata not found or expired')
    }

    // Verify ownership
    if (uploadMetadata.userId !== user._id) {
      throw new Error('Unauthorized access to upload')
    }

    // Validate file content by checking magic bytes
    const fileBlob = await ctx.storage.get(args.storageId)
    if (!fileBlob) {
      throw new Error('File not found in storage')
    }

    // Validate file content matches declared type
    const isValid = await validateFileContent(fileBlob, uploadMetadata.contentType)
    if (!isValid) {
      // Delete invalid file
      await ctx.storage.delete(args.storageId)
      throw new Error('File content does not match declared type. File may be corrupted or malicious.')
    }

    // Verify file size matches metadata
    if (fileBlob.size !== uploadMetadata.size) {
      await ctx.storage.delete(args.storageId)
      throw new Error('File size mismatch')
    }

    // Create user file record
    const fileId = await ctx.runMutation(internal.functions.userFiles.createUserFile, {
      userId: user._id,
      fileName: uploadMetadata.fileName,
      fileType: uploadMetadata.fileType,
      storageId: args.storageId,
      contentType: uploadMetadata.contentType,
      size: uploadMetadata.size,
    })

    // Clean up upload metadata
    await ctx.runMutation(internal.functions.userFiles.deleteUploadMetadata, {
      uploadId: args.uploadId,
    })

    // Schedule embedding generation asynchronously
    await ctx.scheduler.runAfter(0, internal.functions.embeddings.generateUserFileEmbedding, {
      fileId,
    })

    return {
      fileId,
    }
  },
})

/**
 * Match user files to requirements using semantic search
 */
export const matchFilesSemantically = internalAction({
  args: {
    userId: v.id('users'),
    requirements: v.array(v.string()),
  },
  returns: v.array(
    v.object({
      fileId: v.id('userFiles'),
      requirement: v.string(),
      matchScore: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    // Get user files with embeddings
    const userFiles = await ctx.runQuery(internal.functions.userFiles.getUserFilesInternal, {
      userId: args.userId,
    })

    const matches: Array<{ fileId: Id<'userFiles'>; requirement: string; matchScore: number }> = []

    // For each requirement, find best matching file
    for (const requirement of args.requirements) {
      let bestMatch: { fileId: Id<'userFiles'>; matchScore: number } | null = null

      for (const file of userFiles) {
        if (!file.embedding || !file.embeddingText) {
          continue // Skip files without embeddings
        }

        // Use semantic search to find similarity
        const similarity = await ctx.runAction(internal.functions.semanticSearch.semanticSimilarity, {
          text1: requirement,
          text2: file.embeddingText,
          embedding2: file.embedding,
        })

        const matchScore = Math.round(similarity * 100)

        // Only consider matches with score >= 30
        if (matchScore >= 30 && (!bestMatch || matchScore > bestMatch.matchScore)) {
          bestMatch = {
            fileId: file._id,
            matchScore,
          }
        }
      }

      if (bestMatch) {
        matches.push({
          fileId: bestMatch.fileId,
          requirement,
          matchScore: bestMatch.matchScore,
        })
      }
    }

    return matches
  },
})

/**
 * Validate file content matches declared MIME type using magic bytes
 */
async function validateFileContent(fileBlob: Blob, declaredContentType: string): Promise<boolean> {
  // Read first bytes of file
  const arrayBuffer = await fileBlob.slice(0, 16).arrayBuffer()
  const bytes = new Uint8Array(arrayBuffer)

  // Check PDF
  if (ALLOWED_PDF_TYPES.includes(declaredContentType)) {
    return PDF_MAGIC_BYTES.some((signature) => {
      return signature.every((byte, index) => bytes[index] === byte)
    })
  }

  // Check images
  if (ALLOWED_IMAGE_TYPES.includes(declaredContentType)) {
    const signatures = IMAGE_MAGIC_BYTES[declaredContentType]
    if (!signatures) {
      return false
    }
    return signatures.some((signature) => {
      return signature.every((byte, index) => bytes[index] === byte)
    })
  }

  return false
}

/**
 * Sanitize filename to prevent path traversal and other attacks
 */
function sanitizeFileName(fileName: string): string | null {
  // Remove path components
  const sanitized = fileName
    .replace(/[/\\]/g, '') // Remove slashes
    .replace(/\.\./g, '') // Remove parent directory references
    .replace(/[<>:"|?*]/g, '') // Remove invalid characters
    .trim()

  // Ensure filename is not empty and not too long
  if (sanitized.length === 0 || sanitized.length > 255) {
    return null
  }

  return sanitized
}

