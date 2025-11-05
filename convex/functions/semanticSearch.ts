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
 * Find opportunities semantically similar to user profile using Convex native vector search
 */
export const findSimilarOpportunities = internalAction({
  args: {
    userId: v.id('users'),
    limit: v.optional(v.number()),
  },
  returns: v.array(
    v.object({
      opportunityId: v.id('opportunities'),
      similarityScore: v.number(),
    }),
  ),
  handler: async (ctx, args): Promise<Array<{ opportunityId: any; similarityScore: number }>> => {
    const user: any = await ctx.runQuery(internal.functions.users.getUserById, {
      userId: args.userId,
    })

    if (!user) {
      throw new Error('User not found')
    }

    // Get or generate user profile embedding
    let userEmbedding: Array<number> | undefined = user.profileEmbedding
    if (!userEmbedding || userEmbedding.length === 0) {
      const embeddingResult: any = await ctx.runAction(
        (internal.functions as any).embeddings.generateUserProfileEmbedding,
        {
          userId: args.userId,
        },
      )
      userEmbedding = embeddingResult.embedding
      if (!userEmbedding || userEmbedding.length === 0) {
        throw new Error('Failed to generate user profile embedding')
      }
    }

    // Use Convex native vector search
    const results: Array<{ _id: any; _score: number }> = await ctx.vectorSearch('opportunities', 'by_embedding', {
      vector: userEmbedding,
      limit: args.limit ?? 20,
    })

    return results.map((result: { _id: any; _score: number }) => ({
      opportunityId: result._id,
      similarityScore: result._score,
    }))
  },
})

/**
 * Semantic search for opportunities using natural language query
 */
export const semanticSearchOpportunitiesAction = internalAction({
  args: {
    query: v.string(),
    limit: v.optional(v.number()),
  },
  returns: v.array(
    v.object({
      opportunityId: v.id('opportunities'),
      similarityScore: v.number(),
    }),
  ),
  handler: async (ctx, args): Promise<Array<{ opportunityId: any; similarityScore: number }>> => {
    // Generate embedding for search query
    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: args.query,
    })

    if (response.data.length === 0) {
      throw new Error('Failed to generate query embedding')
    }
    const queryEmbedding: Array<number> = response.data[0].embedding

    // Use Convex native vector search
    const results: Array<{ _id: any; _score: number }> = await ctx.vectorSearch('opportunities', 'by_embedding', {
      vector: queryEmbedding,
      limit: args.limit ?? 20,
    })

    return results.map((result: { _id: any; _score: number }) => ({
      opportunityId: result._id,
      similarityScore: result._score,
    }))
  },
})

/**
 * Calculate semantic similarity between a text query and an existing embedding
 */
export const semanticSimilarity = internalAction({
  args: {
    text1: v.string(),
    text2: v.string(),
    embedding2: v.array(v.number()),
  },
  returns: v.number(),
  handler: async (ctx, args) => {
    // Generate embedding for text1
    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: args.text1,
    })

    if (response.data.length === 0) {
      throw new Error('Failed to generate embedding')
    }

    const embedding1: Array<number> = response.data[0].embedding

    // Calculate cosine similarity
    return cosineSimilarity(embedding1, args.embedding2)
  },
})
