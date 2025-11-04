import { v } from 'convex/values'
import { internalMutation, internalQuery, mutation, query } from '../_generated/server'
import { internal } from '../_generated/api'

async function getUserFromAuth(ctx: any) {
  const identity = await ctx.auth.getUserIdentity()
  if (!identity) {
    return null
  }

  const email = identity.email
  if (!email) {
    return null
  }

  const user = await ctx.db
    .query('users')
    .withIndex('by_email', (q: any) => q.eq('email', email))
    .first()

  return user
}

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
          completed: v.boolean(),
          required: v.boolean(),
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
    const user = await getUserFromAuth(ctx)
    if (!user) {
      throw new Error('Not authenticated')
    }

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
          completed: v.boolean(),
          required: v.boolean(),
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
    const user = await getUserFromAuth(ctx)
    if (!user) {
      throw new Error('Not authenticated')
    }

    const application = await ctx.db.get(args.applicationId)
    if (!application || application.userId !== user._id) {
      return null
    }

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
          completed: v.boolean(),
          required: v.boolean(),
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
    const user = await getUserFromAuth(ctx)
    if (!user) {
      throw new Error('Not authenticated')
    }

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
    const user = await getUserFromAuth(ctx)
    if (!user) {
      throw new Error('Not authenticated')
    }

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

    await ctx.scheduler.runAfter(0, internal.functions.applications.generateChecklist, {
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
    const user = await getUserFromAuth(ctx)
    if (!user) {
      throw new Error('Not authenticated')
    }

    const application = await ctx.db.get(args.applicationId)
    if (!application || application.userId !== user._id) {
      throw new Error('Application not found')
    }

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
    const user = await getUserFromAuth(ctx)
    if (!user) {
      throw new Error('Not authenticated')
    }

    const application = await ctx.db.get(args.applicationId)
    if (!application || application.userId !== user._id) {
      throw new Error('Application not found')
    }

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
    const user = await getUserFromAuth(ctx)
    if (!user) {
      throw new Error('Not authenticated')
    }

    const application = await ctx.db.get(args.applicationId)
    if (!application || application.userId !== user._id) {
      throw new Error('Application not found')
    }

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
    const user = await getUserFromAuth(ctx)
    if (!user) {
      throw new Error('Not authenticated')
    }

    const application = await ctx.db.get(args.applicationId)
    if (!application || application.userId !== user._id) {
      throw new Error('Application not found')
    }

    await ctx.db.delete(args.applicationId)
    return null
  },
})

export const generateChecklist = internalMutation({
  args: {
    applicationId: v.id('applications'),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const application = await ctx.db.get(args.applicationId)
    if (!application) {
      return null
    }

    const opportunity = await ctx.db.get(application.opportunityId)
    if (!opportunity) {
      return null
    }

    const checklist = opportunity.requiredDocuments.map((doc) => ({
      item: doc,
      completed: false,
      required: true,
    }))

    await ctx.db.patch(args.applicationId, {
      checklist,
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
          completed: v.boolean(),
          required: v.boolean(),
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

