import { v } from 'convex/values'
import { internalMutation, mutation, query } from '../_generated/server'
import { requireAuth, requireOwnership } from './authHelpers'

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
    const user = await requireAuth(ctx)

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
    const user = await requireAuth(ctx)

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
    const user = await requireAuth(ctx)

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
    const user = await requireAuth(ctx)

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
    await requireAuth(ctx)

    const alert = await ctx.db.get(args.alertId)
    if (!alert) {
      throw new Error('Alert not found')
    }

    // Verify ownership
    await requireOwnership(ctx, alert.userId, 'Alert')

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
    await requireAuth(ctx)

    const alert = await ctx.db.get(args.alertId)
    if (!alert) {
      throw new Error('Alert not found')
    }

    // Verify ownership
    await requireOwnership(ctx, alert.userId, 'Alert')

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

      // Generate alerts at different intervals: 7 days, 3 days, 1 day
      const alertDays = [7, 3, 1]
      const shouldAlert = alertDays.includes(daysUntilDeadline)

      if (shouldAlert && daysUntilDeadline > 0) {
        // Check if alert for this specific day already exists
        const existingAlert = await ctx.db
          .query('alerts')
          .withIndex('by_userId', (q) => q.eq('userId', application.userId))
          .filter((q) =>
            q.and(
              q.eq(q.field('applicationId'), application._id),
              q.eq(q.field('type'), 'deadline'),
              q.eq(q.field('completed'), false),
              q.eq(q.field('dueDate'), deadlineDate),
            ),
          )
          .first()

        if (!existingAlert) {
          // Determine urgency based on days remaining
          let urgencyMessage = ''
          if (daysUntilDeadline === 1) {
            urgencyMessage = '⚠️ URGENT: Deadline is tomorrow!'
          } else if (daysUntilDeadline === 3) {
            urgencyMessage = '⚡ Deadline in 3 days - time to finalize!'
          } else {
            urgencyMessage = '📅 Deadline approaching - don\'t forget!'
          }

          await ctx.db.insert('alerts', {
            userId: application.userId,
            applicationId: application._id,
            opportunityId: application.opportunityId,
            type: 'deadline',
            title: `${urgencyMessage} ${opportunity.title}`,
            message: `The deadline for ${opportunity.title} is in ${daysUntilDeadline} day(s). Make sure your application is complete and submitted.`,
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
    const allApplications = await ctx.db.query('applications').collect()
    const applications = allApplications.filter((app) => app.status !== 'submitted')

    for (const application of applications) {
      const incompleteItems = application.checklist.filter(
        (item) => item.required && !item.completed,
      )

      if (incompleteItems.length > 0) {
        // Get user files to check if documents are actually missing
        const userFiles = await ctx.db
          .query('userFiles')
          .withIndex('by_userId', (q) => q.eq('userId', application.userId))
          .collect()

        // Check which incomplete items might have matching files
        const trulyMissingItems: Array<{ item: string; category?: string }> = []

        for (const item of incompleteItems) {
          // Only check document-type items (not essays or forms)
          if (item.category === 'document' || !item.category) {
            // Simple keyword matching to see if file exists
            const itemLower = item.item.toLowerCase()
            const hasMatchingFile = userFiles.some((file) => {
              const fileNameLower = file.fileName.toLowerCase()
              const fileTypeLower = file.fileType.toLowerCase()
              return (
                fileNameLower.includes(itemLower) ||
                itemLower.includes(fileTypeLower) ||
                itemLower.includes('cv') ||
                itemLower.includes('resume') ||
                itemLower.includes('transcript') ||
                itemLower.includes('certificate')
              )
            })

            if (!hasMatchingFile) {
              trulyMissingItems.push(item)
            }
          } else {
            // For essays and forms, consider them missing if not completed
            trulyMissingItems.push(item)
          }
        }

        if (trulyMissingItems.length > 0) {
          // Check if alert already exists and update it or create new one
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

          const opportunity = await ctx.db.get(application.opportunityId)
          const opportunityTitle = opportunity?.title || 'this opportunity'

          if (existingAlert) {
            // Update existing alert with current count
            await ctx.db.patch(existingAlert._id, {
              title: `📄 Missing ${trulyMissingItems.length} document(s): ${opportunityTitle}`,
              message: `Your application for ${opportunityTitle} is missing ${trulyMissingItems.length} required document(s). Missing items: ${trulyMissingItems.map((i) => i.item).join(', ')}`,
              createdAt: Date.now(), // Update timestamp to show it's fresh
            })
          } else {
            // Create new alert
            await ctx.db.insert('alerts', {
              userId: application.userId,
              applicationId: application._id,
              opportunityId: application.opportunityId,
              type: 'missing_doc',
              title: `📄 Missing ${trulyMissingItems.length} document(s): ${opportunityTitle}`,
              message: `Your application for ${opportunityTitle} is missing ${trulyMissingItems.length} required document(s). Missing items: ${trulyMissingItems.map((i) => i.item).join(', ')}`,
              dueDate: Date.now() + 24 * 60 * 60 * 1000,
              completed: false,
              createdAt: Date.now(),
            })
          }
        }
      }
    }

    return null
  },
})

/**
 * Create alert when application is created
 */
export const createApplicationAlert = internalMutation({
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

    // Create welcome alert for new application
    await ctx.db.insert('alerts', {
      userId: application.userId,
      applicationId: application._id,
      opportunityId: application.opportunityId,
      type: 'nudge',
      title: `🎯 New Application Started: ${opportunity.title}`,
      message: `You've started an application for ${opportunity.title}. Complete your checklist to submit on time!`,
      dueDate: Date.now() + 24 * 60 * 60 * 1000, // 24 hours from now
      completed: false,
      createdAt: Date.now(),
    })

    return null
  },
})

/**
 * Create alert when application status changes
 */
export const createStatusChangeAlert = internalMutation({
  args: {
    applicationId: v.id('applications'),
    oldStatus: v.union(
      v.literal('saved'),
      v.literal('in_progress'),
      v.literal('submitted'),
      v.literal('awaiting_docs'),
    ),
    newStatus: v.union(
      v.literal('saved'),
      v.literal('in_progress'),
      v.literal('submitted'),
      v.literal('awaiting_docs'),
    ),
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

    // Don't create alert if status hasn't actually changed
    if (args.oldStatus === args.newStatus) {
      return null
    }

    let title = ''
    let message = ''

    switch (args.newStatus) {
      case 'in_progress':
        title = `🚀 Application In Progress: ${opportunity.title}`
        message = `You've marked ${opportunity.title} as in progress. Keep working on your checklist!`
        break
      case 'submitted':
        title = `✅ Application Submitted: ${opportunity.title}`
        message = `Congratulations! You've submitted your application for ${opportunity.title}.`
        // Mark any related deadline alerts as completed
        {
          const deadlineAlerts = await ctx.db
            .query('alerts')
            .withIndex('by_userId', (q) => q.eq('userId', application.userId))
            .filter((q) =>
              q.and(
                q.eq(q.field('applicationId'), application._id),
                q.eq(q.field('type'), 'deadline'),
                q.eq(q.field('completed'), false),
              ),
            )
            .collect()

          for (const alert of deadlineAlerts) {
            await ctx.db.patch(alert._id, {
              completed: true,
            })
          }
        }
        break
      case 'awaiting_docs':
        title = `📋 Awaiting Documents: ${opportunity.title}`
        message = `Your application for ${opportunity.title} is awaiting additional documents.`
        break
      default:
        return null
    }

    await ctx.db.insert('alerts', {
      userId: application.userId,
      applicationId: application._id,
      opportunityId: application.opportunityId,
      type: 'reminder',
      title,
      message,
      dueDate: Date.now() + 24 * 60 * 60 * 1000,
      completed: false,
      createdAt: Date.now(),
    })

    return null
  },
})

/**
 * Generate auto-nudges for users to complete applications
 * Checks for applications that haven't been touched in a while
 */
export const generateAutoNudges = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const allApplications = await ctx.db.query('applications').collect()
    const applications = allApplications.filter((app) => app.status !== 'submitted')

    const now = Date.now()

    for (const application of applications) {
      const lastUpdated = application.updatedAt
      const daysSinceUpdate = Math.floor((now - lastUpdated) / (24 * 60 * 60 * 1000))

      // Only nudge if application hasn't been updated in 3+ days
      if (daysSinceUpdate < 3) {
        continue
      }

      const opportunity = await ctx.db.get(application.opportunityId)
      if (!opportunity) {
        continue
      }

      // Check if deadline is approaching
      const deadlineDate = new Date(opportunity.deadline).getTime()
      const daysUntilDeadline = Math.ceil((deadlineDate - now) / (24 * 60 * 60 * 1000))

      // Calculate progress
      const completedCount = application.checklist.filter((item) => item.completed).length
      const totalCount = application.checklist.length
      const progressPercentage = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0

      // Determine nudge message based on progress and time
      let title = ''
      let message = ''
      const urgency = daysUntilDeadline <= 7

      if (daysSinceUpdate >= 7) {
        // Very stale - strong nudge
        if (progressPercentage === 0) {
          title = `🚨 You haven't started: ${opportunity.title}`
          message = `It's been ${daysSinceUpdate} days since you created this application. ${urgency ? `Deadline is in ${daysUntilDeadline} days! ` : ''}Start working on your checklist items now!`
        } else if (progressPercentage < 50) {
          title = `⏰ Don't forget: ${opportunity.title}`
          message = `You're ${progressPercentage}% done with this application. ${urgency ? `Deadline is in ${daysUntilDeadline} days! ` : ''}Keep going - you're making progress!`
        } else {
          title = `🎯 Almost there: ${opportunity.title}`
          message = `You're ${progressPercentage}% complete! ${urgency ? `Deadline is in ${daysUntilDeadline} days! ` : ''}Finish the remaining items to submit your application.`
        }
      } else if (daysSinceUpdate >= 3) {
        // Moderately stale - gentle nudge
        if (progressPercentage < 50) {
          title = `💡 Keep going: ${opportunity.title}`
          message = `You're ${progressPercentage}% done. ${urgency ? `Deadline is in ${daysUntilDeadline} days! ` : ''}Continue working on your checklist items.`
        } else {
          title = `✨ Final push: ${opportunity.title}`
          message = `You're ${progressPercentage}% complete! ${urgency ? `Deadline is in ${daysUntilDeadline} days! ` : ''}Complete the remaining items to submit.`
        }
      }

      if (title && message) {
        // Check if nudge already exists for this application
        const existingNudge = await ctx.db
          .query('alerts')
          .withIndex('by_userId', (q) => q.eq('userId', application.userId))
          .filter((q) =>
            q.and(
              q.eq(q.field('applicationId'), application._id),
              q.eq(q.field('type'), 'nudge'),
              q.eq(q.field('completed'), false),
            ),
          )
          .first()

        if (!existingNudge) {
          await ctx.db.insert('alerts', {
            userId: application.userId,
            applicationId: application._id,
            opportunityId: application.opportunityId,
            type: 'nudge',
            title,
            message,
            dueDate: urgency ? deadlineDate : Date.now() + 24 * 60 * 60 * 1000,
            completed: false,
            createdAt: Date.now(),
          })
        } else {
          // Update existing nudge with fresh message
          await ctx.db.patch(existingNudge._id, {
            title,
            message,
            createdAt: Date.now(),
          })
        }
      }
    }

    return null
  },
})
