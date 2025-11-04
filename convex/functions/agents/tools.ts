import { tool } from 'ai'
import { z } from 'zod'
import { internal } from '../../_generated/api'

/**
 * Get all education levels for a user
 */
function getAllEducationLevels(user: {
  currentEducationLevel?: 'highschool' | 'undergraduate' | 'masters' | 'phd'
  intendedEducationLevel?: 'undergraduate' | 'masters' | 'phd'
  educationLevel?: 'undergraduate' | 'masters' | 'phd'
}): Array<'undergraduate' | 'masters' | 'phd'> {
  const levels = new Set<'undergraduate' | 'masters' | 'phd'>()
  
  // Map highschool to undergraduate for matching (highschool students seek undergrad opportunities)
  if (user.currentEducationLevel === 'highschool') {
    levels.add('undergraduate')
  } else if (user.currentEducationLevel) {
    levels.add(user.currentEducationLevel)
  }
  if (user.intendedEducationLevel) {
    levels.add(user.intendedEducationLevel)
  }
  if (user.educationLevel) {
    levels.add(user.educationLevel)
  }
  
  return Array.from(levels)
}

export function createTools(ctx: any) {
  return {
    getUserProfile: tool({
      description: 'Get the current user profile including education level, interests, and academic status',
      inputSchema: z.object({
        userId: z.string().describe('The user ID to fetch profile for'),
      }),
      execute: async ({ userId }) => {
        const user = await ctx.runQuery(internal.functions.users.getUserById, {
          userId: userId as any,
        })
        return user
      },
    }),

    getOpportunityDetails: tool({
      description: 'Get detailed information about a scholarship opportunity',
      inputSchema: z.object({
        opportunityId: z.string().describe('The opportunity ID to fetch details for'),
      }),
      execute: async ({ opportunityId }) => {
        const opp = await ctx.runQuery(internal.functions.opportunities.getOpportunityByIdInternal, {
          opportunityId: opportunityId as any,
        })
        return opp
      },
    }),

    getApplicationStatus: tool({
      description: 'Get the current status and progress of an application',
      inputSchema: z.object({
        applicationId: z.string().describe('The application ID to check status for'),
      }),
      execute: async ({ applicationId }) => {
        const app = await ctx.runQuery(internal.functions.applications.getApplicationByIdInternal, {
          applicationId: applicationId as any,
        })
        return app
      },
    }),

    getUserDocuments: tool({
      description: 'List all documents uploaded by the user',
      inputSchema: z.object({
        userId: z.string().describe('The user ID to fetch documents for'),
      }),
      execute: async ({ userId }) => {
        const user = await ctx.runQuery(internal.functions.users.getUserById, {
          userId: userId as any,
        })
        if (!user) {
          return []
        }
        const docs = await ctx.runQuery(internal.functions.documents.getUserDocumentsInternal, {
          userId: userId as any,
        })
        return docs
      },
    }),

    generateEssayDraft: tool({
      description: 'Generate an essay draft based on prompts and user profile',
      inputSchema: z.object({
        prompt: z.string().describe('The essay prompt or question'),
        userId: z.string().describe('The user ID to use for personalization'),
        opportunityId: z.string().describe('The opportunity ID for context'),
        maxLength: z.number().optional().describe('Maximum word count for the essay'),
      }),
      execute: ({ prompt, userId, opportunityId, maxLength }) => {
        return {
          draft: '',
          wordCount: 0,
          suggestions: [],
        }
      },
    }),

    matchDocuments: tool({
      description: 'Match user documents to application requirements',
      inputSchema: z.object({
        applicationId: z.string().describe('The application ID to match documents for'),
      }),
      execute: async ({ applicationId }) => {
        const result = await ctx.runMutation(internal.functions.documents.matchDocumentsToApplicationInternal, {
          applicationId: applicationId as any,
        })
        return result
      },
    }),

    createApplicationChecklist: tool({
      description: 'Create a checklist from opportunity requirements',
      inputSchema: z.object({
        opportunityId: z.string().describe('The opportunity ID to create checklist for'),
      }),
      execute: async ({ opportunityId }) => {
        const opp = await ctx.runQuery(internal.functions.opportunities.getOpportunityByIdInternal, {
          opportunityId: opportunityId as any,
        })
        if (!opp) {
          return { checklist: [] }
        }
        return {
          checklist: opp.requiredDocuments.map((doc: string) => ({
            item: doc,
            completed: false,
            required: true,
          })),
        }
      },
    }),

    evaluateEligibility: tool({
      description: 'Evaluate if a user is eligible for an opportunity based on their profile',
      inputSchema: z.object({
        userId: z.string().describe('The user ID to evaluate'),
        opportunityId: z.string().describe('The opportunity ID to check eligibility for'),
      }),
      execute: async ({ userId, opportunityId }) => {
        const user = await ctx.runQuery(internal.functions.users.getUserById, {
          userId: userId as any,
        })
        const opp = await ctx.runQuery(internal.functions.opportunities.getOpportunityByIdInternal, {
          opportunityId: opportunityId as any,
        })

        if (!user || !opp) {
          return { eligible: false, reasons: ['User or opportunity not found'] }
        }

        const reasons: Array<string> = []
        let score = 0

        // Check against all education levels (current and intended)
        const educationLevels = getAllEducationLevels(user)
        if (educationLevels.length > 0) {
          const reqs = opp.requirements.join(' ').toLowerCase()
          let matched = false
          for (const level of educationLevels) {
            if (reqs.includes(level.toLowerCase())) {
              matched = true
              // Give higher score to intended level matches
              if (level === user.intendedEducationLevel) {
                score += 35
              } else if (level === user.currentEducationLevel) {
                score += 25
              } else {
                score += 20
              }
              break
            }
          }
          if (!matched) {
            reasons.push('Education level may not match requirements')
          }
        }

        if (user.academicStatus?.gpa !== undefined && opp.requirements.some((r: string) => r.includes('GPA'))) {
          reasons.push('GPA requirement needs verification')
        }

        return {
          eligible: score >= 30,
          score,
          reasons,
        }
      },
    }),
  }
}

