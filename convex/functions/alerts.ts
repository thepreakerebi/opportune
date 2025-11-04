import { v } from 'convex/values'
import { internalMutation, mutation, query } from '../_generated/server'
import { internal } from '../_generated/api'
import { auth } from '../auth'

/**
 * Get current authenticated user from Convex Auth
 */
async function getUserFromAuth(ctx: any) {
  const authUserId = await auth.getUserId(ctx)
  if (!authUserId) {
    return null
  }

  // Get the auth account to find email
  const account = await ctx.db
    .query('auth_accounts')
    .withIndex('by_userId', (q: any) => q.eq('userId', authUserId))
    .first()

  if (!account || !account.email) {
    return null
  }

  // Find user by email from accounts
  const user = await ctx.db
    .query('users')
    .withIndex('by_email', (q: any) => q.eq('email', account.email))
    .first()

  return user
}

export const getUserAlerts = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id('alerts'),
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
    }),
  ),
  handler: async (ctx) => {
    const user = await getUserFromAuth(ctx)
    if (!user) {
      throw new Error('Not authenticated')
    }

    return await ctx.db
      .query('alerts')
      .withIndex('by_userId', (q) => q.eq('userId', user._id))
      .order('desc')
      .collect()
  },
})

export const getUpcomingAlerts = query({
  args: {
    days: v.number(),
  },
  returns: v.array(
    v.object({
      _id: v.id('alerts'),
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
    }),
  ),
  handler: async (ctx, args) => {
    const user = await getUserFromAuth(ctx)
    if (!user) {
      throw new Error('Not authenticated')
    }

    const now = Date.now()
    const futureDate = now + args.days * 24 * 60 * 60 * 1000

    const allAlerts = await ctx.db
      .query('alerts')
      .withIndex('by_userId_and_dueDate', (q) => q.eq('userId', user._id))
      .collect()

    return allAlerts.filter(
      (alert) => !alert.completed && alert.dueDate >= now && alert.dueDate <= futureDate,
    )
  },
})

export const getIncompleteAlerts = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id('alerts'),
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
    }),
  ),
  handler: async (ctx) => {
    const user = await getUserFromAuth(ctx)
    if (!user) {
      throw new Error('Not authenticated')
    }

    return await ctx.db
      .query('alerts')
      .withIndex('by_userId_and_completed', (q) => q.eq('userId', user._id).eq('completed', false))
      .order('asc')
      .collect()
  },
})

export const createAlert = mutation({
  args: {
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
  },
  returns: v.id('alerts'),
  handler: async (ctx, args) => {
    const user = await getUserFromAuth(ctx)
    if (!user) {
      throw new Error('Not authenticated')
    }

    return await ctx.db.insert('alerts', {
      userId: user._id,
      applicationId: args.applicationId,
      opportunityId: args.opportunityId,
      type: args.type,
      title: args.title,
      message: args.message,
      dueDate: args.dueDate,
      completed: false,
      createdAt: Date.now(),
    })
  },
})

export const markAlertComplete = mutation({
  args: {
    alertId: v.id('alerts'),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await getUserFromAuth(ctx)
    if (!user) {
      throw new Error('Not authenticated')
    }

    const alert = await ctx.db.get(args.alertId)
    if (!alert || alert.userId !== user._id) {
      throw new Error('Alert not found')
    }

    await ctx.db.patch(args.alertId, {
      completed: true,
    })

    return null
  },
})

export const deleteAlert = mutation({
  args: {
    alertId: v.id('alerts'),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await getUserFromAuth(ctx)
    if (!user) {
      throw new Error('Not authenticated')
    }

    const alert = await ctx.db.get(args.alertId)
    if (!alert || alert.userId !== user._id) {
      throw new Error('Alert not found')
    }

    await ctx.db.delete(args.alertId)
    return null
  },
})

export const generateDeadlineAlerts = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const applications = await ctx.db.query('applications').collect()

    for (const application of applications) {
      if (application.status === 'submitted') {
        continue
      }

      const opportunity = await ctx.db.get(application.opportunityId)
      if (!opportunity) {
        continue
      }

      const deadlineDate = new Date(opportunity.deadline).getTime()
      const now = Date.now()
      const daysUntilDeadline = Math.ceil((deadlineDate - now) / (24 * 60 * 60 * 1000))

      if (daysUntilDeadline > 0 && daysUntilDeadline <= 7) {
        const existingAlert = await ctx.db
          .query('alerts')
          .withIndex('by_userId', (q) => q.eq('userId', application.userId))
          .filter((q) =>
            q.and(
              q.eq(q.field('applicationId'), application._id),
              q.eq(q.field('type'), 'deadline'),
              q.eq(q.field('completed'), false),
            ),
          )
          .first()

        if (!existingAlert) {
          await ctx.db.insert('alerts', {
            userId: application.userId,
            applicationId: application._id,
            opportunityId: application.opportunityId,
            type: 'deadline',
            title: `Deadline approaching: ${opportunity.title}`,
            message: `The deadline for ${opportunity.title} is in ${daysUntilDeadline} day(s).`,
            dueDate: deadlineDate,
            completed: false,
            createdAt: Date.now(),
          })
        }
      }
    }

    return null
  },
})

export const generateMissingDocAlerts = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const applications = await ctx.db
      .query('applications')
      .filter((q) => q.eq(q.field('status'), 'in_progress'))
      .collect()

    for (const application of applications) {
      const incompleteItems = application.checklist.filter(
        (item) => item.required && !item.completed,
      )

      if (incompleteItems.length > 0) {
        const existingAlert = await ctx.db
          .query('alerts')
          .withIndex('by_userId', (q) => q.eq('userId', application.userId))
          .filter((q) =>
            q.and(
              q.eq(q.field('applicationId'), application._id),
              q.eq(q.field('type'), 'missing_doc'),
              q.eq(q.field('completed'), false),
            ),
          )
          .first()

        if (!existingAlert) {
          await ctx.db.insert('alerts', {
            userId: application.userId,
            applicationId: application._id,
            opportunityId: application.opportunityId,
            type: 'missing_doc',
            title: 'Missing documents',
            message: `Your application is missing ${incompleteItems.length} required document(s).`,
            dueDate: Date.now() + 24 * 60 * 60 * 1000,
            completed: false,
            createdAt: Date.now(),
          })
        }
      }
    }

    return null
  },
})

