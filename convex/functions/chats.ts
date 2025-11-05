import { v } from 'convex/values'
import { internalMutation, internalQuery, mutation, query } from '../_generated/server'
import { requireAuth } from './authHelpers'

/**
 * Create a new chat conversation
 */
export const createChat = mutation({
  args: {},
  returns: v.object({
    chatId: v.id('chats'),
  }),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx)
    const now = Date.now()

    const chatId = await ctx.db.insert('chats', {
      userId: user._id,
      name: 'New Chat', // Will be updated after first message
      createdAt: now,
      updatedAt: now,
    })

    return { chatId }
  },
})

/**
 * Get all chats for the authenticated user
 */
export const getUserChats = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id('chats'),
      name: v.string(),
      createdAt: v.number(),
      updatedAt: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx)

    const chats = await ctx.db
      .query('chats')
      .withIndex('by_userId', (q) => q.eq('userId', user._id))
      .order('desc')
      .collect()

    return chats.map((chat) => ({
      _id: chat._id,
      name: chat.name,
      createdAt: chat.createdAt,
      updatedAt: chat.updatedAt,
    }))
  },
})

/**
 * Get a specific chat by ID
 */
export const getChatById = query({
  args: {
    chatId: v.id('chats'),
  },
  returns: v.union(
    v.object({
      _id: v.id('chats'),
      name: v.string(),
      createdAt: v.number(),
      updatedAt: v.number(),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx)
    const chat = await ctx.db.get(args.chatId)

    if (!chat || chat.userId !== user._id) {
      return null
    }

    return {
      _id: chat._id,
      name: chat.name,
      createdAt: chat.createdAt,
      updatedAt: chat.updatedAt,
    }
  },
})

/**
 * Get all messages for a chat
 */
export const getChatMessages = query({
  args: {
    chatId: v.id('chats'),
  },
  returns: v.array(
    v.object({
      _id: v.id('chatMessages'),
      role: v.union(v.literal('user'), v.literal('assistant'), v.literal('system')),
      content: v.string(),
      createdAt: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx)
    const chat = await ctx.db.get(args.chatId)

    if (!chat || chat.userId !== user._id) {
      return []
    }

    const messages = await ctx.db
      .query('chatMessages')
      .withIndex('by_chatId', (q) => q.eq('chatId', args.chatId))
      .order('asc')
      .collect()

    return messages.map((msg) => ({
      _id: msg._id,
      role: msg.role,
      content: msg.content,
      createdAt: msg.createdAt,
    }))
  },
})

/**
 * Update chat name
 */
export const updateChatName = mutation({
  args: {
    chatId: v.id('chats'),
    name: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx)
    const chat = await ctx.db.get(args.chatId)

    if (!chat || chat.userId !== user._id) {
      throw new Error('Chat not found or unauthorized')
    }

    if (args.name.trim().length === 0) {
      throw new Error('Chat name cannot be empty')
    }

    await ctx.db.patch(args.chatId, {
      name: args.name.trim(),
      updatedAt: Date.now(),
    })

    return null
  },
})

/**
 * Delete a chat and all its messages
 */
export const deleteChat = mutation({
  args: {
    chatId: v.id('chats'),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx)
    const chat = await ctx.db.get(args.chatId)

    if (!chat || chat.userId !== user._id) {
      throw new Error('Chat not found or unauthorized')
    }

    // Delete all messages first
    const messages = await ctx.db
      .query('chatMessages')
      .withIndex('by_chatId', (q) => q.eq('chatId', args.chatId))
      .collect()

    for (const message of messages) {
      await ctx.db.delete(message._id)
    }

    // Delete the chat
    await ctx.db.delete(args.chatId)

    return null
  },
})

/**
 * Internal: Save a chat message
 */
export const saveChatMessage = internalMutation({
  args: {
    chatId: v.id('chats'),
    role: v.union(v.literal('user'), v.literal('assistant'), v.literal('system')),
    content: v.string(),
    embedding: v.optional(v.array(v.number())),
    embeddingText: v.optional(v.string()),
  },
  returns: v.id('chatMessages'),
  handler: async (ctx, args) => {
    const messageId = await ctx.db.insert('chatMessages', {
      chatId: args.chatId,
      role: args.role,
      content: args.content,
      embedding: args.embedding,
      embeddingText: args.embeddingText,
      createdAt: Date.now(),
    })

    // Update chat's updatedAt timestamp
    await ctx.db.patch(args.chatId, {
      updatedAt: Date.now(),
    })

    return messageId
  },
})

/**
 * Internal: Update chat name
 */
export const updateChatNameInternal = internalMutation({
  args: {
    chatId: v.id('chats'),
    name: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.chatId, {
      name: args.name.trim(),
      updatedAt: Date.now(),
    })

    return null
  },
})

/**
 * Internal: Store chat embedding
 */
export const storeChatEmbedding = internalMutation({
  args: {
    chatId: v.id('chats'),
    embedding: v.array(v.number()),
    embeddingText: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.chatId, {
      embedding: args.embedding,
      embeddingText: args.embeddingText,
    })

    return null
  },
})

/**
 * Internal: Get chat by ID (for actions)
 */
export const getChatByIdInternal = internalQuery({
  args: {
    chatId: v.id('chats'),
  },
  returns: v.union(
    v.object({
      _id: v.id('chats'),
      userId: v.id('users'),
      name: v.string(),
      embedding: v.optional(v.array(v.number())),
      embeddingText: v.optional(v.string()),
      createdAt: v.number(),
      updatedAt: v.number(),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    return await ctx.db.get(args.chatId)
  },
})

/**
 * Internal: Get chat messages (for actions)
 */
export const getChatMessagesInternal = internalQuery({
  args: {
    chatId: v.id('chats'),
  },
  returns: v.array(
    v.object({
      _id: v.id('chatMessages'),
      role: v.union(v.literal('user'), v.literal('assistant'), v.literal('system')),
      content: v.string(),
      createdAt: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    const messages = await ctx.db
      .query('chatMessages')
      .withIndex('by_chatId', (q) => q.eq('chatId', args.chatId))
      .order('asc')
      .collect()

    return messages.map((msg) => ({
      _id: msg._id,
      role: msg.role,
      content: msg.content,
      createdAt: msg.createdAt,
    }))
  },
})

/**
 * Internal: Update message embedding
 */
export const updateMessageEmbedding = internalMutation({
  args: {
    messageId: v.id('chatMessages'),
    embedding: v.array(v.number()),
    embeddingText: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.messageId, {
      embedding: args.embedding,
      embeddingText: args.embeddingText,
    })

    return null
  },
})

/**
 * Search chats semantically using embeddings
 * Note: This is a query wrapper - actual search happens in an action
 * Use searchChatsPublic action instead
 */
export const searchChats = query({
  args: {
    query: v.string(),
    limit: v.optional(v.number()),
  },
  returns: v.array(
    v.object({
      _id: v.id('chats'),
      name: v.string(),
      createdAt: v.number(),
      updatedAt: v.number(),
      similarityScore: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx)

    // Semantic search requires embeddings which need to be generated in an action
    // This query is kept for API compatibility but should use searchChatsPublic action instead
    // For now, return empty array - use the action directly
    return []
  },
})

/**
 * Internal: Semantic search chats using vector similarity
 */
export const semanticSearchChats = internalQuery({
  args: {
    userId: v.id('users'),
    queryEmbedding: v.array(v.number()),
    limit: v.number(),
  },
  returns: v.array(
    v.object({
      _id: v.id('chats'),
      name: v.string(),
      createdAt: v.number(),
      updatedAt: v.number(),
      similarityScore: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    // Get all user's chats with embeddings
    const chats = await ctx.db
      .query('chats')
      .withIndex('by_userId', (q) => q.eq('userId', args.userId))
      .filter((q) => q.neq(q.field('embedding'), undefined))
      .collect()

    // Calculate similarity scores
    const chatsWithScores = chats
      .map((chat) => {
        if (!chat.embedding) {
          return null
        }

        const similarity = cosineSimilarity(args.queryEmbedding, chat.embedding)
        return {
          _id: chat._id,
          name: chat.name,
          createdAt: chat.createdAt,
          updatedAt: chat.updatedAt,
          similarityScore: similarity,
        }
      })
      .filter((chat): chat is NonNullable<typeof chat> => chat !== null)
      .sort((a, b) => b.similarityScore - a.similarityScore)
      .slice(0, args.limit)

    return chatsWithScores
  },
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
