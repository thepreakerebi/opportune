import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'
import { authTables } from '@convex-dev/auth/server'

export default defineSchema({
  ...authTables,
  users: defineTable({
    email: v.string(),
    name: v.optional(v.string()),
    picture: v.optional(v.string()),
    // Current education level (what they're currently enrolled in)
    // Includes highschool for students preparing for undergraduate studies
    currentEducationLevel: v.optional(
      v.union(
        v.literal('highschool'),
        v.literal('undergraduate'),
        v.literal('masters'),
        v.literal('phd'),
      ),
    ),
    // Intended education level (what they're seeking opportunities for)
    // This is the level they want to apply to/continue at
    intendedEducationLevel: v.optional(
      v.union(v.literal('undergraduate'), v.literal('masters'), v.literal('phd')),
    ),
    // Deprecated: Use currentEducationLevel and intendedEducationLevel instead
    // Kept for backward compatibility - will be migrated gradually
    educationLevel: v.optional(
      v.union(v.literal('undergraduate'), v.literal('masters'), v.literal('phd')),
    ),
    subject: v.optional(v.string()),
    discipline: v.optional(v.string()),
    nationality: v.optional(v.string()),
    language: v.optional(v.string()),
    academicStatus: v.optional(
      v.object({
        gpa: v.optional(v.number()),
        year: v.optional(v.number()),
      }),
    ),
    demographicTags: v.optional(v.array(v.string())),
    careerInterests: v.optional(v.array(v.string())),
    academicInterests: v.optional(v.array(v.string())),
    profileEmbedding: v.optional(v.array(v.number())),
    embeddingText: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index('by_email', ['email']),

  opportunities: defineTable({
    title: v.string(),
    provider: v.string(),
    description: v.string(),
    requirements: v.array(v.string()),
    awardAmount: v.optional(v.number()),
    deadline: v.string(),
    applicationUrl: v.string(),
    region: v.optional(v.string()),
    requiredDocuments: v.array(v.string()),
    // Essay prompts for AI-powered essay generation
    // Optional: Can be fetched on-demand if not stored
    // Stored here for offline access and better AI processing performance
    essayPrompts: v.optional(v.array(v.string())),
    contactInfo: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    tags: v.array(v.string()),
    sourceType: v.union(
      v.literal('general_search'),
      // Deprecated: Profile searches are no longer automated via cron
      // Kept for backward compatibility and manual searches
      v.literal('profile_search'),
      v.literal('crawl'),
    ),
    embedding: v.optional(v.array(v.number())),
    embeddingText: v.optional(v.string()),
    lastUpdated: v.number(),
    createdAt: v.number(),
  })
    .index('by_deadline', ['deadline'])
    .index('by_sourceType', ['sourceType'])
    .index('by_tags', ['tags'])
    .vectorIndex('by_embedding', {
      vectorField: 'embedding',
      dimensions: 1536,
    }),

  applications: defineTable({
    userId: v.id('users'),
    opportunityId: v.id('opportunities'),
    status: v.union(
      v.literal('saved'),
      v.literal('in_progress'),
      v.literal('submitted'),
      v.literal('awaiting_docs'),
    ),
    checklist: v.array(
      v.object({
        item: v.string(),
        completed: v.boolean(),
        required: v.boolean(),
      }),
    ),
    progress: v.number(),
    submittedAt: v.optional(v.number()),
    notes: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_userId', ['userId'])
    .index('by_opportunityId', ['opportunityId'])
    .index('by_userId_and_status', ['userId', 'status']),

  alerts: defineTable({
    userId: v.id('users'),
    applicationId: v.optional(v.id('applications')),
    opportunityId: v.optional(v.id('opportunities')),
    type: v.union(
      v.literal('deadline'),
      v.literal('missing_doc'),
      v.literal('nudge'),
      v.literal('reminder'),
    ),
    title: v.string(),
    message: v.string(),
    dueDate: v.number(),
    completed: v.boolean(),
    createdAt: v.number(),
  })
    .index('by_userId', ['userId'])
    .index('by_userId_and_dueDate', ['userId', 'dueDate'])
    .index('by_userId_and_completed', ['userId', 'completed']),

  searchJobs: defineTable({
    type: v.union(v.literal('general_search'), v.literal('profile_search')),
    status: v.union(
      v.literal('pending'),
      v.literal('running'),
      v.literal('completed'),
      v.literal('failed'),
    ),
    searchQuery: v.string(),
    userId: v.optional(v.id('users')),
    resultsCount: v.optional(v.number()),
    errorMessage: v.optional(v.string()),
    scheduledFor: v.number(),
    completedAt: v.optional(v.number()),
  })
    .index('by_status', ['status'])
    .index('by_scheduledFor', ['scheduledFor'])
    .index('by_type', ['type']),

  userOpportunityMatches: defineTable({
    userId: v.id('users'),
    opportunityId: v.id('opportunities'),
    matchScore: v.number(),
    matchType: v.union(
      v.literal('daily_automated'), // From daily matching workflow
      v.literal('user_search'), // From user-initiated search
      v.literal('manual'), // Manually tagged/recommended
    ),
    matchedAt: v.number(),
    // Metadata for analytics
    reasoning: v.optional(v.string()),
    eligibilityFactors: v.optional(v.array(v.string())),
  })
    .index('by_userId', ['userId'])
    .index('by_opportunityId', ['opportunityId'])
    .index('by_userId_and_matchType', ['userId', 'matchType'])
    .index('by_userId_and_matchScore', ['userId', 'matchScore']),

  // User-uploaded files (CV, transcript, passport, etc.)
  // Uses Convex file storage, linked via storageId
  userFiles: defineTable({
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
    storageId: v.id('_storage'), // Reference to Convex storage
    contentType: v.string(), // MIME type (e.g., 'application/pdf', 'image/jpeg')
    size: v.number(), // File size in bytes
    // Embeddings for semantic matching to opportunity requirements
    embedding: v.optional(v.array(v.number())),
    embeddingText: v.optional(v.string()),
    // Additional metadata
    tags: v.optional(v.array(v.string())),
    uploadedAt: v.number(),
  })
    .index('by_userId', ['userId'])
    .index('by_userId_and_fileType', ['userId', 'fileType'])
    .vectorIndex('by_embedding', {
      vectorField: 'embedding',
      dimensions: 1536,
    }),

  // Platform-generated documents (AI-generated essays, assembled documents, etc.)
  // These are created by the system, not uploaded by users
  documents: defineTable({
    userId: v.id('users'),
    applicationId: v.optional(v.id('applications')), // Link to specific application if applicable
    opportunityId: v.optional(v.id('opportunities')), // Link to opportunity if applicable
    name: v.string(),
    type: v.union(
      v.literal('essay'),
      v.literal('cover_letter'),
      v.literal('statement'),
      v.literal('application_package'),
      v.literal('other'),
    ),
    content: v.optional(v.string()), // Text content for platform-generated documents
    storageId: v.optional(v.id('_storage')), // Optional: if document is stored as file
    // Embeddings for matching to essay prompts/requirements
    embedding: v.optional(v.array(v.number())),
    embeddingText: v.optional(v.string()),
    // Metadata
    tags: v.optional(v.array(v.string())),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_userId', ['userId'])
    .index('by_applicationId', ['applicationId'])
    .index('by_opportunityId', ['opportunityId'])
    .index('by_userId_and_type', ['userId', 'type'])
    .vectorIndex('by_embedding', {
      vectorField: 'embedding',
      dimensions: 1536,
    }),

  numbers: defineTable({
    value: v.number(),
  }),
})
