import { v } from 'convex/values'
import { query } from '../_generated/server'
import { requireAuth } from './authHelpers'

/**
 * Get calendar events for a user (deadlines, alerts, submissions)
 * Returns events organized by date for calendar view
 */
export const getCalendarEvents = query({
  args: {
    startDate: v.number(), // Unix timestamp
    endDate: v.number(), // Unix timestamp
  },
  returns: v.array(
    v.object({
      id: v.string(),
      title: v.string(),
      type: v.union(v.literal('deadline'), v.literal('alert'), v.literal('submission')),
      date: v.number(),
      description: v.optional(v.string()),
      applicationId: v.optional(v.id('applications')),
      opportunityId: v.optional(v.id('opportunities')),
      alertId: v.optional(v.id('alerts')),
      urgency: v.union(v.literal('low'), v.literal('medium'), v.literal('high'), v.literal('urgent')),
    }),
  ),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx)
    const events: Array<{
      id: string
      title: string
      type: 'deadline' | 'alert' | 'submission'
      date: number
      description?: string
      applicationId?: string
      opportunityId?: string
      alertId?: string
      urgency: 'low' | 'medium' | 'high' | 'urgent'
    }> = []

    // Get all user's applications
    const applications = await ctx.db
      .query('applications')
      .withIndex('by_userId', (q) => q.eq('userId', user._id))
      .collect()

    for (const application of applications) {
      const opportunity = await ctx.db.get(application.opportunityId)
      if (!opportunity) {
        continue
      }

      const deadlineDate = new Date(opportunity.deadline).getTime()

      // Include deadline if within date range
      if (deadlineDate >= args.startDate && deadlineDate <= args.endDate) {
        const now = Date.now()
        const daysUntilDeadline = Math.ceil((deadlineDate - now) / (24 * 60 * 60 * 1000))

        let urgency: 'low' | 'medium' | 'high' | 'urgent' = 'low'
        if (daysUntilDeadline <= 1) {
          urgency = 'urgent'
        } else if (daysUntilDeadline <= 3) {
          urgency = 'high'
        } else if (daysUntilDeadline <= 7) {
          urgency = 'medium'
        }

        events.push({
          id: `deadline-${application._id}`,
          title: `Deadline: ${opportunity.title}`,
          type: 'deadline' as const,
          date: deadlineDate,
          description: application.status === 'submitted' ? 'Application submitted' : `Status: ${application.status}, Progress: ${application.progress}%`,
          applicationId: application._id as any,
          opportunityId: opportunity._id as any,
          urgency,
        })
      }

      // Include submission date if within range
      if (application.submittedAt && application.submittedAt >= args.startDate && application.submittedAt <= args.endDate) {
        events.push({
          id: `submission-${application._id}`,
          title: `Submitted: ${opportunity.title}`,
          type: 'submission' as const,
          date: application.submittedAt,
          description: 'Application submitted successfully',
          applicationId: application._id as any,
          opportunityId: opportunity._id as any,
          urgency: 'low' as const,
        })
      }
    }

    // Get all user's alerts within date range
    const alerts = await ctx.db
      .query('alerts')
      .withIndex('by_userId_and_dueDate', (q) => q.eq('userId', user._id))
      .collect()

    for (const alert of alerts) {
      if (alert.completed) {
        continue
      }

      if (alert.dueDate >= args.startDate && alert.dueDate <= args.endDate) {
        const now = Date.now()
        const daysUntilDue = Math.ceil((alert.dueDate - now) / (24 * 60 * 60 * 1000))

        let urgency: 'low' | 'medium' | 'high' | 'urgent' = 'low'
        if (daysUntilDue <= 1) {
          urgency = 'urgent'
        } else if (daysUntilDue <= 3) {
          urgency = 'high'
        } else if (daysUntilDue <= 7) {
          urgency = 'medium'
        }

        // Special urgency for deadline alerts
        if (alert.type === 'deadline') {
          urgency = urgency === 'low' ? 'medium' : urgency
        }

        events.push({
          id: `alert-${alert._id}`,
          title: alert.title,
          type: 'alert' as const,
          date: alert.dueDate,
          description: alert.message,
          applicationId: alert.applicationId ? (alert.applicationId as any) : undefined,
          opportunityId: alert.opportunityId ? (alert.opportunityId as any) : undefined,
          alertId: alert._id as any,
          urgency,
        })
      }
    }

    // Sort by date (ascending)
    events.sort((a, b) => a.date - b.date)

    return events as any
  },
})

/**
 * Get alert feed for a user
 * Returns alerts sorted by priority/urgency
 */
export const getAlertFeed = query({
  args: {
    limit: v.optional(v.number()),
  },
  returns: v.object({
    alerts: v.array(
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
        urgency: v.union(v.literal('low'), v.literal('medium'), v.literal('high'), v.literal('urgent')),
        daysUntilDue: v.number(),
      }),
    ),
    summary: v.object({
      total: v.number(),
      urgent: v.number(),
      high: v.number(),
      medium: v.number(),
      low: v.number(),
    }),
  }),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx)
    const now = Date.now()

    // Get all incomplete alerts
    const allAlerts = await ctx.db
      .query('alerts')
      .withIndex('by_userId', (q) => q.eq('userId', user._id))
      .filter((q) => q.eq(q.field('completed'), false))
      .collect()

    // Calculate urgency for each alert
    const alertsWithUrgency = allAlerts.map((alert) => {
      const daysUntilDue = Math.ceil((alert.dueDate - now) / (24 * 60 * 60 * 1000))

      let urgency: 'low' | 'medium' | 'high' | 'urgent' = 'low'

      // Deadline alerts are always higher priority
      if (alert.type === 'deadline') {
        if (daysUntilDue <= 1) {
          urgency = 'urgent'
        } else if (daysUntilDue <= 3) {
          urgency = 'high'
        } else if (daysUntilDue <= 7) {
          urgency = 'medium'
        }
      } else if (alert.type === 'missing_doc') {
        // Missing docs are high priority if deadline is close
        if (daysUntilDue <= 7) {
          urgency = 'high'
        } else {
          urgency = 'medium'
        }
      } else if (alert.type === 'nudge') {
        urgency = daysUntilDue <= 3 ? 'medium' : 'low'
      } else {
        urgency = 'low'
      }

      return {
        ...alert,
        urgency,
        daysUntilDue,
      }
    })

    // Sort by urgency (urgent > high > medium > low), then by due date
    const urgencyOrder: Record<string, number> = { urgent: 4, high: 3, medium: 2, low: 1 }
    alertsWithUrgency.sort((a, b) => {
      const urgencyDiff = urgencyOrder[b.urgency] - urgencyOrder[a.urgency]
      if (urgencyDiff !== 0) {
        return urgencyDiff
      }
      return a.dueDate - b.dueDate // Earlier dates first
    })

    // Apply limit if provided
    const limitedAlerts = args.limit ? alertsWithUrgency.slice(0, args.limit) : alertsWithUrgency

    // Calculate summary
    const summary = {
      total: alertsWithUrgency.length,
      urgent: alertsWithUrgency.filter((a) => a.urgency === 'urgent').length,
      high: alertsWithUrgency.filter((a) => a.urgency === 'high').length,
      medium: alertsWithUrgency.filter((a) => a.urgency === 'medium').length,
      low: alertsWithUrgency.filter((a) => a.urgency === 'low').length,
    }

    return {
      alerts: limitedAlerts,
      summary,
    }
  },
})

