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

    if (user.educationLevel) {
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

    // Combine document name and type for embedding
    const embeddingText = `${document.type} ${document.name} ${document.tags?.join(' ') ?? ''}`.trim()

    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: embeddingText,
    })

    if (response.data.length === 0) {
      throw new Error('Failed to generate embedding')
    }
    const embedding = response.data[0].embedding

    // Store embedding and text
    await ctx.runMutation((internal.functions as any).embeddings.mutations.storeDocumentEmbedding, {
      documentId: args.documentId,
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

