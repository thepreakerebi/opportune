'use node'

import { generateObject } from 'ai'
import { openai } from '@ai-sdk/openai'
import { z } from 'zod'
import { v } from 'convex/values'
import { action, internalAction } from '../_generated/server'
import { api, internal } from '../_generated/api'

/**
 * Checklist item schema for AI generation
 */
const checklistItemSchema = z.object({
  item: z.string().describe('The checklist item name (e.g., "CV", "Transcript", "Essay: Why STEM?")'),
  description: z.string().optional().describe('Optional description or instructions for this item'),
  required: z.boolean().describe('Whether this item is required'),
  category: z
    .enum(['document', 'essay', 'form', 'other'])
    .optional()
    .describe('Category of the checklist item'),
})

/**
 * Checklist extraction schema
 */
const checklistSchema = z.object({
  checklist: z.array(checklistItemSchema).describe('Generated checklist items'),
  reasoning: z.string().optional().describe('Brief explanation of checklist generation'),
})

/**
 * Step 1: AI-powered checklist extraction
 * Analyzes opportunity requirements and generates intelligent checklist
 */
export const generateApplicationChecklist = internalAction({
  args: {
    applicationId: v.id('applications'),
  },
  returns: v.object({
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
  }),
  handler: async (ctx, args) => {
    const application: any = await ctx.runQuery(internal.functions.applications.getApplicationByIdInternal, {
      applicationId: args.applicationId,
    })

    if (!application) {
      throw new Error('Application not found')
    }

    const opportunity: any = await ctx.runQuery(internal.functions.opportunities.getOpportunityByIdInternal, {
      opportunityId: application.opportunityId,
    })

    if (!opportunity) {
      throw new Error('Opportunity not found')
    }

    // Build context for AI
    const opportunityContext = `
Opportunity: ${opportunity.title}
Provider: ${opportunity.provider}
Description: ${opportunity.description}
Requirements: ${opportunity.requirements.join(', ')}
Required Documents: ${opportunity.requiredDocuments.join(', ')}
${opportunity.essayPrompts && opportunity.essayPrompts.length > 0 ? `Essay Prompts: ${opportunity.essayPrompts.join('; ')}` : ''}
Deadline: ${opportunity.deadline}
Application URL: ${opportunity.applicationUrl}
`

    const prompt = `You are an AI assistant helping a student prepare their scholarship application. 
Analyze the opportunity requirements and generate a comprehensive, actionable checklist.

The checklist should:
1. Break down required documents into specific, actionable items
2. If essay prompts are mentioned, create separate checklist items for each essay
3. Include any form fields that need to be filled (if mentioned in requirements)
4. Categorize items appropriately (document, essay, form, other)
5. Mark which items are required vs optional based on the requirements

Generate a detailed checklist that the student can follow step-by-step.

${opportunityContext}`

    const result = await generateObject({
      model: openai('gpt-4o-mini'),
      schema: checklistSchema,
      prompt,
    })

    // Convert AI-generated checklist to application format
    const checklist = result.object.checklist.map((item: z.infer<typeof checklistItemSchema>) => ({
      item: item.item,
      description: item.description,
      completed: false,
      required: item.required,
      category: item.category,
    }))

    // Update application with new checklist
    await ctx.runMutation(internal.functions.applications.updateChecklist, {
      applicationId: args.applicationId,
      checklist,
    })

    return { checklist }
  },
})

/**
 * Step 2: Document Matching for Application
 * Matches user's uploaded files to application checklist items
 * Called when viewing application page to show which files match requirements
 */
export const matchDocumentsToApplication = action({
  args: {
    applicationId: v.id('applications'),
  },
  returns: v.object({
    matches: v.array(
      v.object({
        checklistItemIndex: v.number(),
        checklistItem: v.string(),
        fileId: v.id('userFiles'),
        fileName: v.string(),
        fileType: v.string(),
        matchScore: v.number(),
        matchReason: v.optional(v.string()),
      }),
    ),
    unmatchedItems: v.array(
      v.object({
        checklistItemIndex: v.number(),
        checklistItem: v.string(),
        description: v.optional(v.string()),
      }),
    ),
  }),
  handler: async (ctx, args): Promise<{
    matches: Array<{
      checklistItemIndex: number
      checklistItem: string
      fileId: any
      fileName: string
      fileType: string
      matchScore: number
      matchReason?: string
    }>
    unmatchedItems: Array<{
      checklistItemIndex: number
      checklistItem: string
      description?: string
    }>
  }> => {
    const user = await ctx.runQuery(api.functions.users.getCurrentUser, {})
    if (!user) {
      throw new Error('Not authenticated')
    }

    const application: any = await ctx.runQuery(internal.functions.applications.getApplicationByIdInternal, {
      applicationId: args.applicationId,
    })

    if (!application) {
      throw new Error('Application not found')
    }

    // Verify ownership
    if (application.userId !== user._id) {
      throw new Error('Unauthorized')
    }

    // Get checklist items that need documents (filter out essays, forms, etc. if needed)
    const documentItems = application.checklist.filter(
      (item: { category?: string }) => item.category === 'document' || !item.category,
    )

    // Get user files for semantic matching
    const userFiles: any = await ctx.runQuery(internal.functions.userFiles.getUserFilesInternal, {
      userId: user._id,
    })

    // Extract requirements from checklist items
    const requirements = documentItems.map((item: { item: string }) => item.item)

    // Perform semantic matching
    const semanticMatches: Array<{ fileId: any; requirement: string; matchScore: number }> = await ctx.runAction(
      (internal.functions as any).userFilesActions.matchFilesSemantically,
      {
        userId: user._id,
        requirements,
      },
    )

    // Build matches array with checklist item context
    const matches: Array<{
      checklistItemIndex: number
      checklistItem: string
      fileId: any
      fileName: string
      fileType: string
      matchScore: number
      matchReason?: string
    }> = []

    const matchedItemIndices = new Set<number>()

    for (const semanticMatch of semanticMatches) {
      // Find which checklist item this matches
      const itemIndex = documentItems.findIndex((item: { item: string }) => item.item === semanticMatch.requirement)

      if (itemIndex >= 0) {
        const checklistItem = documentItems[itemIndex]
        const file = userFiles.find((f: any) => f._id === semanticMatch.fileId)

        if (file) {
          matches.push({
            checklistItemIndex: itemIndex,
            checklistItem: checklistItem.item,
            fileId: file._id,
            fileName: file.fileName,
            fileType: file.fileType,
            matchScore: semanticMatch.matchScore,
            matchReason: `Semantic match: ${semanticMatch.matchScore}% similarity`,
          })
          matchedItemIndices.add(itemIndex)
        }
      }
    }

    // Find unmatched items
    const unmatchedItems = documentItems
      .map((item: { item: string; description?: string }, index: number) => ({ item, index }))
      .filter(({ index }: { index: number }) => !matchedItemIndices.has(index))
      .map(({ item, index }: { item: { item: string; description?: string }; index: number }) => ({
        checklistItemIndex: index,
        checklistItem: item.item,
        description: item.description,
      }))

    return {
      matches,
      unmatchedItems,
    }
  },
})

/**
 * BlockNote.js block structure types
 */
type BlockNoteBlock = {
  id: string
  type: string
  props?: Record<string, any>
  content?: Array<{
    type: 'text'
    text: string
    styles?: {
      bold?: boolean
      italic?: boolean
      underline?: boolean
      strikethrough?: boolean
      textColor?: string
      backgroundColor?: string
    }
  }>
  children?: Array<BlockNoteBlock>
}

/**
 * Step 3: Essay/Doc Builder Pre-generation
 * Generates essay drafts using BlockNote.js block structure
 * Only called when user explicitly triggers it
 */
export const generateEssayDraft = action({
  args: {
    applicationId: v.id('applications'),
    checklistItemIndex: v.number(), // Which checklist item (essay) to generate
  },
  returns: v.object({
    documentId: v.id('documents'),
    blocks: v.any(), // BlockNote.js blocks
  }),
  handler: async (ctx, args): Promise<{
    documentId: any
    blocks: any
  }> => {
    const user = await ctx.runQuery(api.functions.users.getCurrentUser, {})
    if (!user) {
      throw new Error('Not authenticated')
    }

    const application: any = await ctx.runQuery(internal.functions.applications.getApplicationByIdInternal, {
      applicationId: args.applicationId,
    })

    if (!application) {
      throw new Error('Application not found')
    }

    // Verify ownership
    if (application.userId !== user._id) {
      throw new Error('Unauthorized')
    }

    // Get checklist item
    if (args.checklistItemIndex < 0 || args.checklistItemIndex >= application.checklist.length) {
      throw new Error('Invalid checklist item index')
    }

    const checklistItem = application.checklist[args.checklistItemIndex]

    // Only generate for essay items
    if (checklistItem.category !== 'essay') {
      throw new Error('Checklist item is not an essay')
    }

    // Get opportunity and user profile for context
    const opportunity: any = await ctx.runQuery(internal.functions.opportunities.getOpportunityByIdInternal, {
      opportunityId: application.opportunityId,
    })

    if (!opportunity) {
      throw new Error('Opportunity not found')
    }

    const userProfile: any = await ctx.runQuery(internal.functions.users.getUserById, {
      userId: user._id,
    })

    if (!userProfile) {
      throw new Error('User profile not found')
    }

    // Build context for essay generation
    const essayPrompt = checklistItem.item
    const essayDescription = checklistItem.description || ''
    const opportunityTitle = opportunity.title
    const opportunityProvider = opportunity.provider
    const opportunityDescription = opportunity.description

    // Build user profile context
    const profileContext = `
User Profile:
- Name: ${userProfile.name || 'Not provided'}
- Current Education: ${userProfile.currentEducationLevel || userProfile.educationLevel || 'Not specified'}
- Intended Education: ${userProfile.intendedEducationLevel || 'Not specified'}
- Discipline: ${userProfile.discipline || 'Not specified'}
- Subject: ${userProfile.subject || 'Not specified'}
- Academic Interests: ${userProfile.academicInterests?.join(', ') || 'Not specified'}
- Career Interests: ${userProfile.careerInterests?.join(', ') || 'Not specified'}
- Nationality: ${userProfile.nationality || 'Not specified'}
- GPA: ${userProfile.academicStatus?.gpa || 'Not specified'}
`

    const generationPrompt = `You are an AI assistant helping a student write a compelling scholarship essay.

Essay Prompt: ${essayPrompt}
${essayDescription ? `Additional Instructions: ${essayDescription}` : ''}

Opportunity Details:
- Title: ${opportunityTitle}
- Provider: ${opportunityProvider}
- Description: ${opportunityDescription}

${profileContext}

Generate a well-structured, compelling essay draft that:
1. Directly addresses the essay prompt
2. Incorporates relevant information from the user's profile
3. Demonstrates the user's qualifications, interests, and goals
4. Is written in a professional, engaging tone
5. Is approximately 500-800 words

Return the essay as plain text that can be formatted into BlockNote.js blocks.`

    // Generate essay content using AI
    const essayResult = await generateObject({
      model: openai('gpt-4o'),
      schema: z.object({
        essay: z.string().describe('The full essay text'),
        title: z.string().optional().describe('Suggested title for the essay'),
      }),
      prompt: generationPrompt,
    })

    // Convert essay text to BlockNote.js blocks
    // Simple structure: heading + paragraphs
    const blocks: Array<BlockNoteBlock> = []

    // Add title if provided
    if (essayResult.object.title) {
      blocks.push({
        id: `block_${Date.now()}_title`,
        type: 'heading',
        props: {
          level: 1,
        },
        content: [
          {
            type: 'text',
            text: essayResult.object.title,
            styles: {
              bold: true,
            },
          },
        ],
        children: [],
      })
    }

    // Split essay into paragraphs and create blocks
    const paragraphs = essayResult.object.essay.split('\n\n').filter((p) => p.trim().length > 0)

    for (const paragraph of paragraphs) {
      // Check if it's a heading (starts with # or all caps)
      if (paragraph.trim().startsWith('#') || paragraph.trim().match(/^[A-Z][A-Z\s]+$/)) {
        blocks.push({
          id: `block_${Date.now()}_${Math.random().toString(36).substring(7)}`,
          type: 'heading',
          props: {
            level: 2,
          },
          content: [
            {
              type: 'text',
              text: paragraph.replace(/^#+\s*/, '').trim(),
            },
          ],
          children: [],
        })
      } else {
        // Regular paragraph
        blocks.push({
          id: `block_${Date.now()}_${Math.random().toString(36).substring(7)}`,
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: paragraph.trim(),
            },
          ],
          children: [],
        })
      }
    }

    // Create document in database
    const documentId: any = await ctx.runMutation(api.functions.documents.createDocument, {
      name: checklistItem.item,
      type: 'essay',
      blocks,
      applicationId: args.applicationId,
      opportunityId: application.opportunityId,
      tags: ['ai-generated', 'draft'],
    })

    return {
      documentId,
      blocks,
    }
  },
})

/**
 * Autofill data schema for form fields
 */
const autofillFieldSchema = z.object({
  fieldName: z.string().describe('Name of the form field (e.g., "Full Name", "Email", "GPA")'),
  value: z.string().describe('The pre-filled value for this field'),
  fieldType: z.enum(['text', 'email', 'number', 'date', 'textarea', 'select']).optional(),
  suggested: z.boolean().optional().describe('Whether this is a suggested value that user should review'),
})

/**
 * Application preview schema
 */
const applicationPreviewSchema = z.object({
  sections: z.array(
    z.object({
      sectionTitle: z.string(),
      fields: z.array(autofillFieldSchema),
    }),
  ),
  matchedDocuments: z.array(
    z.object({
      requirement: z.string(),
      fileId: z.string(),
      fileName: z.string(),
      matchScore: z.number(),
    }),
  ),
  notes: z.string().optional().describe('Additional notes or instructions for the user'),
})

/**
 * Steps 4 & 5: Guided Autofill and Application Preview
 * Generates autofill data and application preview
 * This is where uploaded docs are matched AND autofill happens
 * Triggered by user when they want to see the preview
 */
export const generateApplicationPreview = action({
  args: {
    applicationId: v.id('applications'),
  },
  returns: v.object({
    preview: v.object({
      sections: v.array(
        v.object({
          sectionTitle: v.string(),
          fields: v.array(
            v.object({
              fieldName: v.string(),
              value: v.string(),
              fieldType: v.optional(
                v.union(
                  v.literal('text'),
                  v.literal('email'),
                  v.literal('number'),
                  v.literal('date'),
                  v.literal('textarea'),
                  v.literal('select'),
                ),
              ),
              suggested: v.optional(v.boolean()),
            }),
          ),
        }),
      ),
      matchedDocuments: v.array(
        v.object({
          requirement: v.string(),
          fileId: v.id('userFiles'),
          fileName: v.string(),
          matchScore: v.number(),
        }),
      ),
      notes: v.optional(v.string()),
    }),
  }),
  handler: async (ctx, args): Promise<{
    preview: {
      sections: Array<{
        sectionTitle: string
        fields: Array<{
          fieldName: string
          value: string
          fieldType?: 'text' | 'email' | 'number' | 'date' | 'textarea' | 'select'
          suggested: boolean
        }>
      }>
      matchedDocuments: Array<{
        requirement: string
        fileId: any
        fileName: string
        matchScore: number
      }>
      notes?: string
    }
  }> => {
    const user = await ctx.runQuery(api.functions.users.getCurrentUser, {})
    if (!user) {
      throw new Error('Not authenticated')
    }

    const application: any = await ctx.runQuery(internal.functions.applications.getApplicationByIdInternal, {
      applicationId: args.applicationId,
    })

    if (!application) {
      throw new Error('Application not found')
    }

    // Verify ownership
    if (application.userId !== user._id) {
      throw new Error('Unauthorized')
    }

    // Get opportunity and user profile
    const opportunity: any = await ctx.runQuery(internal.functions.opportunities.getOpportunityByIdInternal, {
      opportunityId: application.opportunityId,
    })

    if (!opportunity) {
      throw new Error('Opportunity not found')
    }

    const userProfile: any = await ctx.runQuery(internal.functions.users.getUserById, {
      userId: user._id,
    })

    if (!userProfile) {
      throw new Error('User profile not found')
    }

    // Step 1: Match documents to requirements (using semantic matching)
    const documentMatches: Array<{ fileId: any; requirement: string; matchScore: number }> = await ctx.runAction(
      (internal.functions as any).userFilesActions.matchFilesSemantically,
      {
        userId: user._id,
        requirements: opportunity.requiredDocuments,
      },
    )

    // Get file details for matched documents
    const userFiles: any = await ctx.runQuery(internal.functions.userFiles.getUserFilesInternal, {
      userId: user._id,
    })

    const matchedDocuments = documentMatches.map((match: { fileId: any; requirement: string; matchScore: number }) => {
      const file = userFiles.find((f: any) => f._id === match.fileId)
      return {
        requirement: match.requirement,
        fileId: match.fileId,
        fileName: file?.fileName || 'Unknown',
        matchScore: match.matchScore,
      }
    })

    // Step 2: Generate autofill data using AI
    const autofillPrompt = `You are an AI assistant helping a student fill out a scholarship application form.

Opportunity Details:
- Title: ${opportunity.title}
- Provider: ${opportunity.provider}
- Description: ${opportunity.description}
- Requirements: ${opportunity.requirements.join(', ')}
- Required Documents: ${opportunity.requiredDocuments.join(', ')}
- Application URL: ${opportunity.applicationUrl}

User Profile:
- Name: ${userProfile.name || 'Not provided'}
- Email: ${userProfile.email || 'Not provided'}
- Current Education: ${userProfile.currentEducationLevel || userProfile.educationLevel || 'Not specified'}
- Intended Education: ${userProfile.intendedEducationLevel || 'Not specified'}
- Discipline: ${userProfile.discipline || 'Not specified'}
- Subject: ${userProfile.subject || 'Not specified'}
- Academic Interests: ${userProfile.academicInterests?.join(', ') || 'Not specified'}
- Career Interests: ${userProfile.careerInterests?.join(', ') || 'Not specified'}
- Nationality: ${userProfile.nationality || 'Not specified'}
- Language: ${userProfile.language || 'Not specified'}
- GPA: ${userProfile.academicStatus?.gpa || 'Not specified'}
- Year: ${userProfile.academicStatus?.year || 'Not specified'}
- Demographic Tags: ${userProfile.demographicTags?.join(', ') || 'Not specified'}

Matched Documents:
${matchedDocuments.map((m: { requirement: string; fileName: string; matchScore: number }) => `- ${m.requirement}: ${m.fileName} (${m.matchScore}% match)`).join('\n')}

Generate a comprehensive autofill preview organized into logical sections (e.g., "Personal Information", "Academic Background", "Application Details", etc.).
For each field, provide:
- Field name (common form field names)
- Pre-filled value from user profile
- Field type (text, email, number, date, textarea, select)
- Whether the value is suggested (may need user review)

Include all relevant information that would typically be requested in a scholarship application form.
Organize fields into logical sections that match typical application forms.`

    const previewResult = await generateObject({
      model: openai('gpt-4o-mini'),
      schema: applicationPreviewSchema,
      prompt: autofillPrompt,
    })

    return {
      preview: {
        sections: previewResult.object.sections.map((section: z.infer<typeof applicationPreviewSchema>['sections'][number]) => ({
          sectionTitle: section.sectionTitle,
          fields: section.fields.map((field: z.infer<typeof autofillFieldSchema>) => ({
            fieldName: field.fieldName,
            value: field.value,
            fieldType: field.fieldType,
            suggested: field.suggested ?? false,
          })),
        })),
        matchedDocuments: matchedDocuments.map((m: { requirement: string; fileId: any; fileName: string; matchScore: number }) => ({
          requirement: m.requirement,
          fileId: m.fileId,
          fileName: m.fileName,
          matchScore: m.matchScore,
        })),
        notes: previewResult.object.notes,
      },
    }
  },
})

