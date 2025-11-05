'use node'

import { v } from 'convex/values'
import OpenAI from 'openai'
import { internalAction } from '../_generated/server'
import { internal } from '../_generated/api'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

/**
 * Calculate cosine similarity between two vectors
 */
function cosineSimilarity(vecA: Array<number>, vecB: Array<number>): number {
  if (vecA.length !== vecB.length) {
    throw new Error('Vectors must have the same length')
  }

  let dotProduct = 0
  let magnitudeA = 0
  let magnitudeB = 0

  for (let i = 0; i < vecA.length; i++) {
    const a = vecA[i] ?? 0
    const b = vecB[i] ?? 0
    dotProduct += a * b
    magnitudeA += a * a
    magnitudeB += b * b
  }

  magnitudeA = Math.sqrt(magnitudeA)
  magnitudeB = Math.sqrt(magnitudeB)

  if (magnitudeA === 0 || magnitudeB === 0) {
    return 0
  }

  return dotProduct / (magnitudeA * magnitudeB)
}

/**
 * Generate embedding for opportunity text
 */
export const generateOpportunityEmbedding = internalAction({
  args: {
    opportunityId: v.id('opportunities'),
  },
  returns: v.object({
    embedding: v.array(v.number()),
  }),
  handler: async (ctx, args) => {
    const opportunity = await ctx.runQuery(internal.functions.opportunities.getOpportunityByIdInternal, {
      opportunityId: args.opportunityId,
    })

    if (!opportunity) {
      throw new Error('Opportunity not found')
    }

    // Combine text for embedding: title + description + requirements
    const embeddingText = [
      opportunity.title,
      opportunity.provider,
      opportunity.description,
      opportunity.requirements.join(' '),
      opportunity.region ?? '',
    ]
      .filter(Boolean)
      .join(' ')

    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: embeddingText,
    })

    if (response.data.length === 0) {
      throw new Error('Failed to generate embedding')
    }
    const embedding = response.data[0].embedding

    // Store embedding and text
    await ctx.runMutation((internal.functions as any).embeddings.mutations.storeOpportunityEmbedding, {
      opportunityId: args.opportunityId,
      embedding,
      embeddingText,
    })

    return { embedding }
  },
})

/**
 * Generate embedding for user profile
 */
export const generateUserProfileEmbedding = internalAction({
  args: {
    userId: v.id('users'),
  },
  returns: v.object({
    embedding: v.array(v.number()),
  }),
  handler: async (ctx, args) => {
    const user = await ctx.runQuery(internal.functions.users.getUserById, {
      userId: args.userId,
    })

    if (!user) {
      throw new Error('User not found')
    }

    // Combine profile fields for embedding
    const profileParts: Array<string> = []

    // Add education levels (both current and intended)
    if (user.currentEducationLevel) {
      profileParts.push(`Current Education: ${user.currentEducationLevel}`)
    }
    if (user.intendedEducationLevel) {
      profileParts.push(`Seeking Education: ${user.intendedEducationLevel}`)
    }
    // Fallback to deprecated field if new fields not set
    if (!user.currentEducationLevel && !user.intendedEducationLevel && user.educationLevel) {
      profileParts.push(`Education: ${user.educationLevel}`)
    }
    if (user.discipline) {
      profileParts.push(`Discipline: ${user.discipline}`)
    }
    if (user.subject) {
      profileParts.push(`Subject: ${user.subject}`)
    }
    if (user.nationality) {
      profileParts.push(`Nationality: ${user.nationality}`)
    }
    if (user.academicInterests && user.academicInterests.length > 0) {
      profileParts.push(`Academic Interests: ${user.academicInterests.join(', ')}`)
    }
    if (user.careerInterests && user.careerInterests.length > 0) {
      profileParts.push(`Career Interests: ${user.careerInterests.join(', ')}`)
    }
    if (user.demographicTags && user.demographicTags.length > 0) {
      profileParts.push(`Demographics: ${user.demographicTags.join(', ')}`)
    }

    const embeddingText = profileParts.join('. ')

    if (!embeddingText.trim()) {
      throw new Error('User profile is empty')
    }

    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: embeddingText,
    })

    if (response.data.length === 0) {
      throw new Error('Failed to generate embedding')
    }
    const embedding = response.data[0].embedding

    // Store embedding and text
    await ctx.runMutation((internal.functions as any).embeddings.mutations.storeUserProfileEmbedding, {
      userId: args.userId,
      embedding,
      embeddingText,
    })

    return { embedding }
  },
})

/**
 * Extract plain text from BlockNote.js blocks
 * Recursively traverses blocks and their children to extract all text content
 */
function extractTextFromBlocks(blocks: any): string {
  if (!blocks || !Array.isArray(blocks)) {
    return ''
  }

  const textParts: Array<string> = []

  for (const block of blocks) {
    if (!block || typeof block !== 'object') {
      continue
    }

    // Extract text from block content
    if (block.content) {
      if (Array.isArray(block.content)) {
        // InlineContent array (styled text, links, etc.)
        for (const item of block.content) {
          if (item && typeof item === 'object') {
            if (item.type === 'text' && item.text) {
              textParts.push(item.text)
            } else if (item.type === 'link' && item.content) {
              // Extract text from link content
              if (Array.isArray(item.content)) {
                for (const linkItem of item.content) {
                  if (linkItem && linkItem.type === 'text' && linkItem.text) {
                    textParts.push(linkItem.text)
                  }
                }
              }
            }
          }
        }
      } else if (typeof block.content === 'string') {
        // Plain string content
        textParts.push(block.content)
      } else if (block.content && typeof block.content === 'object') {
        // TableContent or other structured content
        if (block.content.type === 'tableContent' && block.content.rows) {
          for (const row of block.content.rows) {
            if (row.cells && Array.isArray(row.cells)) {
              for (const cell of row.cells) {
                if (Array.isArray(cell)) {
                  for (const cellItem of cell) {
                    if (cellItem && cellItem.type === 'text' && cellItem.text) {
                      textParts.push(cellItem.text)
                    }
                  }
                }
              }
            }
          }
        }
      }
    }

    // Recursively extract text from children blocks
    if (block.children && Array.isArray(block.children)) {
      const childText = extractTextFromBlocks(block.children)
      if (childText) {
        textParts.push(childText)
      }
    }

    // Add block type as context for headings and special blocks
    if (block.type === 'heading') {
      // Headings are important, so we add them with emphasis
      // The text is already extracted above, but we could add level info
    }
  }

  return textParts.join(' ').trim()
}

/**
 * Generate embedding for document name/type
 */
export const generateDocumentEmbedding = internalAction({
  args: {
    documentId: v.id('documents'),
  },
  returns: v.object({
    embedding: v.array(v.number()),
  }),
  handler: async (ctx, args) => {
    const document = await ctx.runQuery(internal.functions.documents.getDocumentByIdInternal, {
      documentId: args.documentId,
    })
    if (!document) {
      throw new Error('Document not found')
    }

    // Extract text from BlockNote blocks if available
    let documentText = ''
    if (document.blocks && Array.isArray(document.blocks)) {
      documentText = extractTextFromBlocks(document.blocks)
    } else if (document.content) {
      // Fallback to deprecated content field
      documentText = document.content
    }

    // Combine document metadata with extracted text for embedding
    const embeddingParts: Array<string> = [
      document.type,
      document.name,
      documentText,
      document.tags?.join(' ') ?? '',
    ].filter(Boolean)

    const embeddingText = embeddingParts.join(' ').trim()

    if (!embeddingText) {
      throw new Error('Document has no content to embed')
    }

    // Limit to 8000 characters to avoid token limits
    const limitedText = embeddingText.substring(0, 8000)

    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: limitedText,
    })

    if (response.data.length === 0) {
      throw new Error('Failed to generate embedding')
    }
    const embedding = response.data[0].embedding

    // Store embedding and text (store full text, not truncated)
    await ctx.runMutation((internal.functions as any).embeddings.mutations.storeDocumentEmbedding, {
      documentId: args.documentId,
      embedding,
      embeddingText,
    })

    return { embedding }
  },
})

/**
 * Generate embedding for user file
 * Extracts text from PDF files using pdf-parse library
 * For images, uses metadata (filename, fileType, tags) for embedding
 */
export const generateUserFileEmbedding = internalAction({
  args: {
    fileId: v.id('userFiles'),
  },
  returns: v.object({
    embedding: v.array(v.number()),
  }),
  handler: async (ctx, args) => {
    const file = await ctx.runQuery(internal.functions.userFiles.getUserFileByIdInternal, {
      fileId: args.fileId,
    })
    if (!file) {
      throw new Error('File not found')
    }

    let embeddingText = `${file.fileType} ${file.fileName} ${file.tags?.join(' ') ?? ''}`.trim()

    // Extract text from PDF files
    if (file.contentType === 'application/pdf') {
      try {
        // Get file blob from Convex storage
        const fileBlob = await ctx.storage.get(file.storageId)
        if (!fileBlob) {
          throw new Error('File not found in storage')
        }

        // Convert Blob to Buffer for pdf-parse
        const arrayBuffer = await fileBlob.arrayBuffer()
        const buffer = Buffer.from(arrayBuffer)

        // Extract text using pdf-parse (CommonJS module)
        // pdf-parse exports the function itself (not as default)
        // When imported as ES module, it may be wrapped differently
        const pdfParseModule = await import('pdf-parse')
        // pdf-parse is the function itself when imported
        const pdfParse = (pdfParseModule as any).default || pdfParseModule
        const pdfData = await pdfParse(buffer)

        // Use extracted text for embedding (limit to 8000 chars to avoid token limits)
        const extractedText = pdfData.text.trim().substring(0, 8000)
        
        if (extractedText.length > 0) {
          // Combine metadata with extracted text for better embeddings
          embeddingText = `${file.fileType} ${file.fileName}\n\n${extractedText}${file.tags?.length ? `\n\nTags: ${file.tags.join(', ')}` : ''}`.trim()
          
          // Store extracted text in database for future use
          await ctx.runMutation((internal.functions as any).userFiles.storeExtractedText, {
            fileId: args.fileId,
            extractedText: pdfData.text.trim(), // Store full text, not truncated
          })
        }
      } catch (error) {
        console.error(`Failed to extract text from PDF ${args.fileId}:`, error)
        // Fall back to metadata-based embedding if extraction fails
      }
    }

    // For images, we use metadata only (OCR would require additional libraries)
    // The embedding text already includes filename, fileType, and tags

    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: embeddingText,
    })

    if (response.data.length === 0) {
      throw new Error('Failed to generate embedding')
    }
    const embedding = response.data[0].embedding

    // Store embedding and text
    await ctx.runMutation((internal.functions as any).embeddings.mutations.storeUserFileEmbedding, {
      fileId: args.fileId,
      embedding,
      embeddingText,
    })

    return { embedding }
  },
})

/**
 * Batch generate embeddings for all opportunities without embeddings
 */
export const batchGenerateOpportunityEmbeddings = internalAction({
  args: {
    limit: v.optional(v.number()),
  },
  returns: v.object({
    processed: v.number(),
  }),
  handler: async (ctx, args) => {
    const opportunities = await ctx.runQuery(internal.functions.opportunities.getOpportunitiesWithoutEmbeddings, {
      limit: args.limit ?? 50,
    })

    let processed = 0
    for (const opp of opportunities) {
      try {
        await ctx.runAction(internal.functions.embeddings.generateOpportunityEmbedding, {
          opportunityId: opp._id,
        })
        processed++
        // Small delay to avoid rate limits
        await new Promise((resolve) => setTimeout(resolve, 100))
      } catch (error) {
        console.error(`Failed to generate embedding for opportunity ${opp._id}:`, error)
      }
    }

    return { processed }
  },
})

// Export cosine similarity for use in other files
export { cosineSimilarity }

