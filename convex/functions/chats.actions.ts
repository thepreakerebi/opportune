'use node'

import { generateText } from 'ai'
import { openai } from '@ai-sdk/openai'
import OpenAI from 'openai'
import { v } from 'convex/values'
import { api, internal } from '../_generated/api'
import { action, internalAction } from '../_generated/server'

/**
 * Generate chat name using AI based on first message and response
 */
export const generateChatName = internalAction({
  args: {
    chatId: v.id('chats'),
    firstMessage: v.string(),
    firstResponse: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    // Use GPT-4o-mini for cost-effective naming
    const result = await generateText({
      model: openai('gpt-4o-mini'),
      prompt: `Based on this conversation, generate a short, descriptive chat title (max 50 characters, no quotes):

User: ${args.firstMessage}

Assistant: ${args.firstResponse.substring(0, 200)}...

Generate a concise title that captures the main topic of this conversation. Examples:
- "Scholarship Eligibility Questions"
- "Application Deadline Help"
- "Finding PhD Opportunities"
- "Essay Writing Tips"

Title:`,
    })

    const chatName = result.text.trim().replace(/^["']|["']$/g, '').substring(0, 50)

    // Update chat name
    await ctx.runMutation(internal.functions.chats.updateChatNameInternal, {
      chatId: args.chatId,
      name: chatName || 'New Chat',
    })

    return null
  },
})

/**
 * Generate embeddings for chat messages
 */
export const generateChatEmbeddings = internalAction({
  args: {
    chatId: v.id('chats'),
    firstMessage: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const openaiClient = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    })

    // Generate embedding for the first message (for chat search)
    const embeddingResponse = await openaiClient.embeddings.create({
      model: 'text-embedding-3-small',
      input: args.firstMessage,
    })

    if (embeddingResponse.data.length === 0) {
      return null
    }

    const embedding = embeddingResponse.data[0].embedding

    // Store chat embedding
    await ctx.runMutation(internal.functions.chats.storeChatEmbedding, {
      chatId: args.chatId,
      embedding,
      embeddingText: args.firstMessage,
    })

    // Also generate embeddings for recent messages (for semantic search within chat)
    const messages = await ctx.runQuery(internal.functions.chats.getChatMessagesInternal, {
      chatId: args.chatId,
    })

    // Generate embeddings for user messages (not assistant messages)
    for (const message of messages) {
      if (message.role === 'user' && !message.content.includes('embedding')) {
        try {
          const msgEmbeddingResponse = await openaiClient.embeddings.create({
            model: 'text-embedding-3-small',
            input: message.content,
          })

          if (msgEmbeddingResponse.data.length > 0) {
            await ctx.runMutation(internal.functions.chats.updateMessageEmbedding, {
              messageId: message._id,
              embedding: msgEmbeddingResponse.data[0].embedding,
              embeddingText: message.content,
            })
          }
        } catch (error) {
          console.error(`Failed to generate embedding for message ${message._id}:`, error)
        }
      }
    }

    return null
  },
})

/**
 * Public action wrapper for semantic chat search
 */
export const searchChatsPublic = action({
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
    // Get authenticated user
    const user = await ctx.runQuery(api.functions.users.getCurrentUser, {})
    if (!user) {
      throw new Error('Not authenticated')
    }

    return await ctx.runAction((internal.functions as any).chatsActions.searchChatsAction, {
      userId: user._id,
      query: args.query,
      limit: args.limit,
    })
  },
})

/**
 * Action: Search chats semantically using embeddings
 */
export const searchChatsAction = internalAction({
  args: {
    userId: v.id('users'),
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
    const openaiClient = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    })

    // Generate embedding for search query
    const queryEmbeddingResponse = await openaiClient.embeddings.create({
      model: 'text-embedding-3-small',
      input: args.query,
    })

    if (queryEmbeddingResponse.data.length === 0) {
      return []
    }

    const queryEmbedding = queryEmbeddingResponse.data[0].embedding

    // Perform vector search
    const results = await ctx.runQuery(internal.functions.chats.semanticSearchChats, {
      userId: args.userId,
      queryEmbedding,
      limit: args.limit ?? 10,
    })

    return results
  },
})

