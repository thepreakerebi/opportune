import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'
import { authTables } from '@convex-dev/auth/server'

export default defineSchema({
  ...authTables,
  users: defineTable({
    email: v.string(),
    name: v.optional(v.string()),
    picture: v.optional(v.string()),
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
    essayPrompts: v.optional(v.array(v.string())),
    contactInfo: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    tags: v.array(v.string()),
    sourceType: v.union(
      v.literal('general_search'),
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

  documents: defineTable({
    userId: v.id('users'),
    name: v.string(),
    type: v.union(
      v.literal('cv'),
      v.literal('transcript'),
      v.literal('reference'),
      v.literal('passport'),
      v.literal('certificate'),
      v.literal('essay'),
      v.literal('other'),
    ),
    storageId: v.id('_storage'),
    metadata: v.optional(
      v.object({
        size: v.number(),
        contentType: v.string(),
      }),
    ),
    tags: v.optional(v.array(v.string())),
    embedding: v.optional(v.array(v.number())),
    embeddingText: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index('by_userId', ['userId'])
    .index('by_userId_and_type', ['userId', 'type']),

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

  numbers: defineTable({
    value: v.number(),
  }),
})
