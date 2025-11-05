import { Resend, vEmailEvent, vEmailId } from '@convex-dev/resend'
import { v } from 'convex/values'
import { components, internal } from '../_generated/api'
import { internalAction, internalMutation } from '../_generated/server'

// Initialize Resend component
export const resend: Resend = new Resend(components.resend, {
  testMode: false, // Set to true during development to only allow test emails
  onEmailEvent: internal.functions.emails.handleEmailEvent,
})

/**
 * Send email notification for an alert
 */
export const sendAlertEmail = internalAction({
  args: {
    userId: v.id('users'),
    alertId: v.id('alerts'),
    alertTitle: v.string(),
    alertMessage: v.string(),
    alertType: v.union(
      v.literal('deadline'),
      v.literal('missing_doc'),
      v.literal('nudge'),
      v.literal('reminder'),
    ),
    opportunityTitle: v.optional(v.string()),
    applicationUrl: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    // Get user email
    const user = await ctx.runQuery(internal.functions.users.getUserById, {
      userId: args.userId,
    })

    if (!user || !user.email) {
      console.error(`User ${args.userId} not found or has no email`)
      return null
    }

    // Determine email subject and content based on alert type
    let subject = ''
    let html = ''

    switch (args.alertType) {
      case 'deadline':
        subject = `⚠️ Deadline Alert: ${args.opportunityTitle || 'Application'}`
        html = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #dc2626;">${args.alertTitle}</h2>
            <p style="font-size: 16px; line-height: 1.6;">${args.alertMessage}</p>
            ${args.applicationUrl ? `<p><a href="${args.applicationUrl}" style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">View Application</a></p>` : ''}
            <hr style="margin: 30px 0; border: none; border-top: 1px solid #e5e7eb;">
            <p style="color: #6b7280; font-size: 14px;">This is an automated alert from Opportune.</p>
          </div>
        `
        break
      case 'missing_doc':
        subject = `📄 Missing Documents: ${args.opportunityTitle || 'Application'}`
        html = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #f59e0b;">${args.alertTitle}</h2>
            <p style="font-size: 16px; line-height: 1.6;">${args.alertMessage}</p>
            ${args.applicationUrl ? `<p><a href="${args.applicationUrl}" style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">View Application</a></p>` : ''}
            <hr style="margin: 30px 0; border: none; border-top: 1px solid #e5e7eb;">
            <p style="color: #6b7280; font-size: 14px;">This is an automated alert from Opportune.</p>
          </div>
        `
        break
      case 'nudge':
        subject = `💡 Reminder: ${args.opportunityTitle || 'Application'}`
        html = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #059669;">${args.alertTitle}</h2>
            <p style="font-size: 16px; line-height: 1.6;">${args.alertMessage}</p>
            ${args.applicationUrl ? `<p><a href="${args.applicationUrl}" style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">Continue Application</a></p>` : ''}
            <hr style="margin: 30px 0; border: none; border-top: 1px solid #e5e7eb;">
            <p style="color: #6b7280; font-size: 14px;">This is an automated alert from Opportune.</p>
          </div>
        `
        break
      case 'reminder':
        subject = `📋 Reminder: ${args.opportunityTitle || 'Application'}`
        html = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #2563eb;">${args.alertTitle}</h2>
            <p style="font-size: 16px; line-height: 1.6;">${args.alertMessage}</p>
            ${args.applicationUrl ? `<p><a href="${args.applicationUrl}" style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">View Application</a></p>` : ''}
            <hr style="margin: 30px 0; border: none; border-top: 1px solid #e5e7eb;">
            <p style="color: #6b7280; font-size: 14px;">This is an automated alert from Opportune.</p>
          </div>
        `
        break
      default:
        subject = `Alert: ${args.alertTitle}`
        html = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2>${args.alertTitle}</h2>
            <p style="font-size: 16px; line-height: 1.6;">${args.alertMessage}</p>
            ${args.applicationUrl ? `<p><a href="${args.applicationUrl}" style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">View Application</a></p>` : ''}
          </div>
        `
    }

    // Send email
    await resend.sendEmail(ctx, {
      from: 'Opportune <notifications@shamp.io>', // Replace with your verified domain
      to: user.email,
      subject,
      html,
    })

    return null
  },
})

/**
 * Handle email events from Resend webhook
 */
export const handleEmailEvent = internalMutation({
  args: {
    id: vEmailId,
    event: vEmailEvent,
  },
  returns: v.null(),
  handler: (ctx, args) => {
    // Log email events for tracking
    console.log(`Email event: ${args.event.type} for email ${args.id}`)

    // You can add additional logic here, such as:
    // - Updating alert status based on email delivery
    // - Tracking email metrics
    // - Resending failed emails

    return null
  },
})



