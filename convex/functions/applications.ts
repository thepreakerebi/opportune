import { v } from 'convex/values'
import { internalMutation, internalQuery, mutation, query } from '../_generated/server'
import { internal } from '../_generated/api'
import { requireAuth, requireOwnership } from './authHelpers'

export const getUserApplications = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id('applications'),
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
          description: v.optional(v.string()),
          completed: v.boolean(),
          required: v.boolean(),
          category: v.optional(
            v.union(v.literal('document'), v.literal('essay'), v.literal('form'), v.literal('other')),
          ),
        }),
      ),
      progress: v.number(),
      submittedAt: v.optional(v.number()),
      notes: v.optional(v.string()),
      createdAt: v.number(),
      updatedAt: v.number(),
    }),
  ),
  handler: async (ctx) => {
    const user = await requireAuth(ctx)

    return await ctx.db
      .query('applications')
      .withIndex('by_userId', (q) => q.eq('userId', user._id))
      .order('desc')
      .collect()
  },
})

export const getApplicationById = query({
  args: {
    applicationId: v.id('applications'),
  },
  returns: v.union(
    v.object({
      _id: v.id('applications'),
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
          description: v.optional(v.string()),
          completed: v.boolean(),
          required: v.boolean(),
          category: v.optional(
            v.union(v.literal('document'), v.literal('essay'), v.literal('form'), v.literal('other')),
          ),
        }),
      ),
      progress: v.number(),
      submittedAt: v.optional(v.number()),
      notes: v.optional(v.string()),
      createdAt: v.number(),
      updatedAt: v.number(),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    await requireAuth(ctx)

    const application = await ctx.db.get(args.applicationId)
    if (!application) {
      return null
    }

    // Verify ownership
    await requireOwnership(ctx, application.userId, 'Application')

    return application
  },
})

export const getApplicationsByStatus = query({
  args: {
    status: v.union(
      v.literal('saved'),
      v.literal('in_progress'),
      v.literal('submitted'),
      v.literal('awaiting_docs'),
    ),
  },
  returns: v.array(
    v.object({
      _id: v.id('applications'),
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
          description: v.optional(v.string()),
          completed: v.boolean(),
          required: v.boolean(),
          category: v.optional(
            v.union(v.literal('document'), v.literal('essay'), v.literal('form'), v.literal('other')),
          ),
        }),
      ),
      progress: v.number(),
      submittedAt: v.optional(v.number()),
      notes: v.optional(v.string()),
      createdAt: v.number(),
      updatedAt: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx)

    return await ctx.db
      .query('applications')
      .withIndex('by_userId_and_status', (q) =>
        q.eq('userId', user._id).eq('status', args.status),
      )
      .order('desc')
      .collect()
  },
})

export const createApplication = mutation({
  args: {
    opportunityId: v.id('opportunities'),
  },
  returns: v.id('applications'),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx)

    const opportunity = await ctx.db.get(args.opportunityId)
    if (!opportunity) {
      throw new Error('Opportunity not found')
    }

    const existing = await ctx.db
      .query('applications')
      .withIndex('by_userId', (q) => q.eq('userId', user._id))
      .filter((q) => q.eq(q.field('opportunityId'), args.opportunityId))
      .first()

    if (existing) {
      return existing._id
    }

    // Create basic checklist from required documents (will be enhanced by AI)
    const checklist = opportunity.requiredDocuments.map((doc) => ({
      item: doc,
      completed: false,
      required: true,
    }))

    const now = Date.now()
    const applicationId = await ctx.db.insert('applications', {
      userId: user._id,
      opportunityId: args.opportunityId,
      status: 'saved',
      checklist,
      progress: 0,
      createdAt: now,
      updatedAt: now,
    })

    // Generate AI-powered checklist asynchronously
    await ctx.scheduler.runAfter(0, internal.functions.applicationWorkflow.generateApplicationChecklist, {
      applicationId,
    })

    return applicationId
  },
})

export const updateApplicationStatus = mutation({
  args: {
    applicationId: v.id('applications'),
    status: v.union(
      v.literal('saved'),
      v.literal('in_progress'),
      v.literal('submitted'),
      v.literal('awaiting_docs'),
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireAuth(ctx)

    const application = await ctx.db.get(args.applicationId)
    if (!application) {
      throw new Error('Application not found')
    }

    // Verify ownership
    await requireOwnership(ctx, application.userId, 'Application')

    await ctx.db.patch(args.applicationId, {
      status: args.status,
      submittedAt: args.status === 'submitted' ? Date.now() : application.submittedAt,
      updatedAt: Date.now(),
    })

    return null
  },
})

export const updateChecklistItem = mutation({
  args: {
    applicationId: v.id('applications'),
    itemIndex: v.number(),
    completed: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireAuth(ctx)

    const application = await ctx.db.get(args.applicationId)
    if (!application) {
      throw new Error('Application not found')
    }

    // Verify ownership
    await requireOwnership(ctx, application.userId, 'Application')

    const checklist = [...application.checklist]
    if (args.itemIndex >= 0 && args.itemIndex < checklist.length) {
      checklist[args.itemIndex] = {
        ...checklist[args.itemIndex],
        completed: args.completed,
      }

      const completedCount = checklist.filter((item) => item.completed).length
      const progress = Math.round((completedCount / checklist.length) * 100)

      await ctx.db.patch(args.applicationId, {
        checklist,
        progress,
        updatedAt: Date.now(),
      })
    }

    return null
  },
})

export const addApplicationNote = mutation({
  args: {
    applicationId: v.id('applications'),
    note: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireAuth(ctx)

    const application = await ctx.db.get(args.applicationId)
    if (!application) {
      throw new Error('Application not found')
    }

    // Verify ownership
    await requireOwnership(ctx, application.userId, 'Application')

    const existingNotes = application.notes ?? ''
    const newNotes = existingNotes ? `${existingNotes}\n${args.note}` : args.note

    await ctx.db.patch(args.applicationId, {
      notes: newNotes,
      updatedAt: Date.now(),
    })

    return null
  },
})

export const deleteApplication = mutation({
  args: {
    applicationId: v.id('applications'),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireAuth(ctx)

    const application = await ctx.db.get(args.applicationId)
    if (!application) {
      throw new Error('Application not found')
    }

    // Verify ownership
    await requireOwnership(ctx, application.userId, 'Application')

    await ctx.db.delete(args.applicationId)
    return null
  },
})

/**
 * Update checklist (internal mutation for AI-generated checklists)
 */
export const updateChecklist = internalMutation({
  args: {
    applicationId: v.id('applications'),
    checklist: v.array(
      v.object({
        item: v.string(),
        description: v.optional(v.string()),
        completed: v.boolean(),
        required: v.boolean(),
        category: v.optional(
          v.union(v.literal('document'), v.literal('essay'), v.literal('form'), v.literal('other')),
        ),
      }),
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const application = await ctx.db.get(args.applicationId)
    if (!application) {
      return null
    }

    // Recalculate progress
    const completedCount = args.checklist.filter((item) => item.completed).length
    const progress = args.checklist.length > 0 ? Math.round((completedCount / args.checklist.length) * 100) : 0

    await ctx.db.patch(args.applicationId, {
      checklist: args.checklist,
      progress,
      updatedAt: Date.now(),
    })

    return null
  },
})

export const getApplicationByIdInternal = internalQuery({
  args: {
    applicationId: v.id('applications'),
  },
  returns: v.union(
    v.object({
      _id: v.id('applications'),
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
          description: v.optional(v.string()),
          completed: v.boolean(),
          required: v.boolean(),
          category: v.optional(
            v.union(v.literal('document'), v.literal('essay'), v.literal('form'), v.literal('other')),
          ),
        }),
      ),
      progress: v.number(),
      submittedAt: v.optional(v.number()),
      notes: v.optional(v.string()),
      createdAt: v.number(),
      updatedAt: v.number(),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    return await ctx.db.get(args.applicationId)
  },
})

