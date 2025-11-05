'use node'

import { generateText, stepCountIs } from 'ai'
import { openai } from '@ai-sdk/openai'
import { v } from 'convex/values'
import { internalAction } from '../../_generated/server'
import { internal } from '../../_generated/api'
import { formatEducationLevels } from '../educationHelpers'
import { createTools } from './tools'

export const applicationWorkflowAgent = internalAction({
  args: {
    applicationId: v.id('applications'),
  },
  returns: v.object({
    checklist: v.array(
      v.object({
        item: v.string(),
        completed: v.boolean(),
        required: v.boolean(),
      }),
    ),
    missingDocuments: v.array(v.string()),
    essayDrafts: v.array(
      v.object({
        prompt: v.string(),
        draft: v.string(),
      }),
    ),
  }),
  handler: async (ctx, args) => {
    const application: any = await ctx.runQuery(internal.functions.applications.getApplicationByIdInternal, {
      applicationId: args.applicationId,
    })

    if (!application) {
      throw new Error('Application not found')
    }

    const opportunity = await ctx.runQuery(internal.functions.opportunities.getOpportunityByIdInternal, {
      opportunityId: application.opportunityId,
    })

    if (!opportunity) {
      throw new Error('Opportunity not found')
    }

    const user = await ctx.runQuery(internal.functions.users.getUserById, {
      userId: application.userId,
    })

    if (!user) {
      throw new Error('User not found')
    }

    const tools = createTools(ctx)

    const result = await generateText({
      model: openai('gpt-4o'),
      tools,
      stopWhen: stepCountIs(10),
      prompt: `Generate a complete application workflow for this scholarship opportunity.

User Profile:
- Education Levels: ${formatEducationLevels(user)}
- Discipline: ${user.discipline ?? 'Not specified'}
- Interests: ${user.academicInterests?.join(', ') ?? 'Not specified'}

Opportunity Details:
- Title: ${opportunity.title}
- Provider: ${opportunity.provider}
- Requirements: ${opportunity.requirements.join(', ')}
- Required Documents: ${opportunity.requiredDocuments.join(', ')}
- Essay Prompts: ${opportunity.essayPrompts?.join(' | ') ?? 'None'}

Application Status:
- Current Status: ${application.status}
- Progress: ${application.progress}%

Please:
1. Generate a comprehensive checklist from the requirements
2. Match existing user documents to requirements
3. Identify missing documents
4. Generate essay drafts for any prompts

Use the available tools to gather information and generate the workflow.`,
      onStepFinish: ({ toolCalls, toolResults }) => {
        console.log('Step finished:', { toolCalls, toolResults })
      },
    })

    return {
      checklist: application.checklist,
      missingDocuments: [],
      essayDrafts: [],
    }
  },
})

export const opportunityMatchingAgent = internalAction({
  args: {
    userId: v.id('users'),
  },
  returns: v.object({
    matchedOpportunities: v.array(
      v.object({
        opportunityId: v.id('opportunities'),
        score: v.number(),
        reasoning: v.string(),
      }),
    ),
  }),
  handler: async (ctx, args): Promise<{
    matchedOpportunities: Array<{
      opportunityId: any
      score: number
      reasoning: string
    }>
  }> => {
    const user = await ctx.runQuery(internal.functions.users.getUserById, {
      userId: args.userId,
    })

    if (!user) {
      throw new Error('User not found')
    }

    // Get all opportunities for matching
    const recentCutoff = Date.now() - 7 * 24 * 60 * 60 * 1000
    const allOpportunities = await ctx.runQuery(internal.functions.opportunities.getAllRecentOpportunities, {
      sinceTimestamp: recentCutoff,
    })

    if (allOpportunities.length === 0) {
      return {
        matchedOpportunities: [],
      }
    }

    // Use the new AI-powered matching function
    const matchingResult = await ctx.runAction(internal.functions.matching.matchOpportunitiesForUser, {
      userId: args.userId,
      opportunityIds: allOpportunities.map((opp: any) => opp._id),
      batchSize: 20,
    })

    return {
      matchedOpportunities: matchingResult.matches.map((m: { opportunityId: any; score: number; reasoning: string }) => ({
        opportunityId: m.opportunityId,
        score: m.score,
        reasoning: m.reasoning,
      })),
    }
  },
})

export const documentMatchingAgent = internalAction({
  args: {
    applicationId: v.id('applications'),
  },
  returns: v.object({
    matched: v.array(
      v.object({
        fileId: v.id('userFiles'),
        requirement: v.string(),
        confidence: v.number(),
      }),
    ),
    missing: v.array(v.string()),
  }),
  handler: async (ctx, args): Promise<{
    matched: Array<{
      fileId: any
      requirement: string
      confidence: number
    }>
    missing: Array<string>
  }> => {
    // Get application to find opportunity and user
    const app: any = await ctx.runQuery(internal.functions.applications.getApplicationByIdInternal, {
      applicationId: args.applicationId,
    })

    if (!app) {
      throw new Error('Application not found')
    }

    // Get opportunity to find requirements
    const opportunity: any = await ctx.runQuery(internal.functions.opportunities.getOpportunityByIdInternal, {
      opportunityId: app.opportunityId,
    })

    if (!opportunity) {
      throw new Error('Opportunity not found')
    }

    // Match user files to requirements using semantic search
    const matches: Array<{ fileId: any; requirement: string; matchScore: number }> = await ctx.runAction((internal.functions as any).userFilesActions.matchFilesSemantically, {
      userId: app.userId,
      requirements: opportunity.requiredDocuments,
    })

    // Determine missing requirements
    const matchedRequirements = new Set(matches.map((m: { requirement: string }) => m.requirement))
    const missing = opportunity.requiredDocuments.filter((req: string) => !matchedRequirements.has(req))

    return {
      matched: matches.map((m: { fileId: any; requirement: string; matchScore: number }) => ({
        fileId: m.fileId,
        requirement: m.requirement,
        confidence: m.matchScore / 100, // Convert 0-100 score to 0-1 confidence
      })),
      missing,
    }
  },
})

export const essayGenerationAgent = internalAction({
  args: {
    prompt: v.string(),
    userId: v.id('users'),
    opportunityId: v.id('opportunities'),
    maxIterations: v.optional(v.number()),
  },
  returns: v.object({
    finalDraft: v.string(),
    iterations: v.number(),
    qualityScore: v.number(),
  }),
  handler: async (ctx, args) => {
    const user = await ctx.runQuery(internal.functions.users.getUserById, {
      userId: args.userId,
    })

    const opportunity = await ctx.runQuery(internal.functions.opportunities.getOpportunityByIdInternal, {
      opportunityId: args.opportunityId,
    })

    if (!user || !opportunity) {
      throw new Error('User or opportunity not found')
    }

    const maxIterations = args.maxIterations ?? 3
    let currentDraft = ''
    let iterations = 0
    let qualityScore = 0

    while (iterations < maxIterations) {
      const result = await generateText({
        model: iterations === 0 ? openai('gpt-4o-mini') : openai('gpt-4o'),
        prompt: iterations === 0
          ? `Generate an essay draft for this scholarship prompt:

Prompt: ${args.prompt}

User Profile:
- Education Levels: ${formatEducationLevels(user)}
- Discipline: ${user.discipline ?? 'Not specified'}
- Academic Interests: ${user.academicInterests?.join(', ') ?? 'Not specified'}

Opportunity: ${opportunity.title} by ${opportunity.provider}

Write a compelling essay that addresses the prompt and showcases the user's qualifications.`
          : `Improve this essay draft based on feedback:

Original Prompt: ${args.prompt}
Current Draft: ${currentDraft}
Quality Score: ${qualityScore}/10

Rewrite the essay to improve clarity, relevance, and impact.`,
      })

      currentDraft = result.text

      const evaluation = await generateText({
        model: openai('gpt-4o'),
        prompt: `Evaluate this essay draft:

Prompt: ${args.prompt}
Draft: ${currentDraft}

Rate on a scale of 1-10 for:
1. Relevance to prompt
2. Clarity and structure
3. Demonstrates qualifications
4. Overall quality

Provide a single score from 1-10.`,
      })

      qualityScore = parseInt(evaluation.text.match(/\d+/)?.[0] ?? '5', 10)

      iterations++

      if (qualityScore >= 8) {
        break
      }
    }

    return {
      finalDraft: currentDraft,
      iterations,
      qualityScore,
    }
  },
})

