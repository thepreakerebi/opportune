import { v } from 'convex/values'
import { internalMutation } from '../_generated/server'

export const validateOpportunityData = internalMutation({
  args: {
    title: v.string(),
    provider: v.string(),
    description: v.string(),
    requirements: v.array(v.string()),
    deadline: v.string(),
    applicationUrl: v.string(),
    requiredDocuments: v.array(v.string()),
  },
  returns: v.object({
    valid: v.boolean(),
    errors: v.array(v.string()),
  }),
  handler: async (ctx, args) => {
    const errors: Array<string> = []

    if (!args.title || args.title.trim().length === 0) {
      errors.push('Title is required')
    }

    if (!args.provider || args.provider.trim().length === 0) {
      errors.push('Provider is required')
    }

    if (!args.description || args.description.trim().length === 0) {
      errors.push('Description is required')
    }

    if (args.requirements.length === 0) {
      errors.push('At least one requirement is required')
    }

    if (!args.deadline) {
      errors.push('Deadline is required')
    } else {
      const deadlineDate = new Date(args.deadline)
      if (isNaN(deadlineDate.getTime())) {
        errors.push('Deadline must be a valid date')
      }
    }

    if (!args.applicationUrl || args.applicationUrl.trim().length === 0) {
      errors.push('Application URL is required')
    } else {
      try {
        new URL(args.applicationUrl)
      } catch {
        errors.push('Application URL must be a valid URL')
      }
    }

    if (args.requiredDocuments.length === 0) {
      errors.push('At least one required document is required')
    }

    return {
      valid: errors.length === 0,
      errors,
    }
  },
})

export const validateProfileData = internalMutation({
  args: {
    educationLevel: v.optional(
      v.union(v.literal('undergraduate'), v.literal('masters'), v.literal('phd')),
    ),
    academicStatus: v.optional(
      v.object({
        gpa: v.optional(v.number()),
        year: v.optional(v.number()),
      }),
    ),
  },
  returns: v.object({
    valid: v.boolean(),
    errors: v.array(v.string()),
  }),
  handler: async (ctx, args) => {
    const errors: Array<string> = []

    if (args.academicStatus?.gpa !== undefined) {
      if (args.academicStatus.gpa < 0 || args.academicStatus.gpa > 4.0) {
        errors.push('GPA must be between 0 and 4.0')
      }
    }

    if (args.academicStatus?.year !== undefined) {
      if (args.academicStatus.year < 1 || args.academicStatus.year > 10) {
        errors.push('Year must be between 1 and 10')
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    }
  },
})

