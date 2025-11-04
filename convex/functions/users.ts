import { v } from 'convex/values'
import { internalMutation, internalQuery, mutation, query } from '../_generated/server'
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

export const getCurrentUser = query({
  args: {},
  returns: v.union(
    v.object({
      _id: v.id('users'),
      email: v.string(),
      name: v.optional(v.string()),
      picture: v.optional(v.string()),
      educationLevel: v.optional(
        v.union(v.literal('undergraduate'), v.literal('masters'), v.literal('phd')),
      ),
      subject: v.optional(v.string()),
      discipline: v.optional(v.string()),
      nationality: v.optional(v.string()),
      language: v.optional(v.string()),
      academicStatus: v.optional(
        v.object({
          gpa: v.optional(v.number()),
          year: v.optional(v.number()),
        }),
      ),
      demographicTags: v.optional(v.array(v.string())),
      careerInterests: v.optional(v.array(v.string())),
      academicInterests: v.optional(v.array(v.string())),
      createdAt: v.number(),
      updatedAt: v.number(),
    }),
    v.null(),
  ),
  handler: async (ctx) => {
    return await getUserFromAuth(ctx)
  },
})

export const createProfile = mutation({
  args: {
    educationLevel: v.optional(
      v.union(v.literal('undergraduate'), v.literal('masters'), v.literal('phd')),
    ),
    subject: v.optional(v.string()),
    discipline: v.optional(v.string()),
    nationality: v.optional(v.string()),
    language: v.optional(v.string()),
    academicStatus: v.optional(
      v.object({
        gpa: v.optional(v.number()),
        year: v.optional(v.number()),
      }),
    ),
    demographicTags: v.optional(v.array(v.string())),
    careerInterests: v.optional(v.array(v.string())),
    academicInterests: v.optional(v.array(v.string())),
  },
  returns: v.id('users'),
  handler: async (ctx, args) => {
    const user = await getUserFromAuth(ctx)
    if (!user) {
      throw new Error('Not authenticated')
    }

    // Update existing user profile
    await ctx.db.patch(user._id, {
      educationLevel: args.educationLevel,
      subject: args.subject,
      discipline: args.discipline,
      nationality: args.nationality,
      language: args.language,
      academicStatus: args.academicStatus,
      demographicTags: args.demographicTags,
      careerInterests: args.careerInterests,
      academicInterests: args.academicInterests,
      updatedAt: Date.now(),
    })

    return user._id
  },
})

export const updateProfile = mutation({
  args: {
    educationLevel: v.optional(
      v.union(v.literal('undergraduate'), v.literal('masters'), v.literal('phd')),
    ),
    subject: v.optional(v.string()),
    discipline: v.optional(v.string()),
    nationality: v.optional(v.string()),
    language: v.optional(v.string()),
    academicStatus: v.optional(
      v.object({
        gpa: v.optional(v.number()),
        year: v.optional(v.number()),
      }),
    ),
    demographicTags: v.optional(v.array(v.string())),
    careerInterests: v.optional(v.array(v.string())),
    academicInterests: v.optional(v.array(v.string())),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await getUserFromAuth(ctx)
    if (!user) {
      throw new Error('Not authenticated')
    }

    await ctx.db.patch(user._id, {
      educationLevel: args.educationLevel,
      subject: args.subject,
      discipline: args.discipline,
      nationality: args.nationality,
      language: args.language,
      academicStatus: args.academicStatus,
      demographicTags: args.demographicTags,
      careerInterests: args.careerInterests,
      academicInterests: args.academicInterests,
      updatedAt: Date.now(),
    })

    return null
  },
})

export const deleteProfile = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const user = await getUserFromAuth(ctx)
    if (!user) {
      throw new Error('Not authenticated')
    }

    await ctx.db.delete(user._id)
    return null
  },
})

export const syncUserFromAuth = internalMutation({
  args: {
    email: v.string(),
    name: v.optional(v.string()),
    picture: v.optional(v.string()),
  },
  returns: v.id('users'),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query('users')
      .withIndex('by_email', (q: any) => q.eq('email', args.email))
      .first()

    if (existing) {
      await ctx.db.patch(existing._id, {
        name: args.name,
        picture: args.picture,
        updatedAt: Date.now(),
      })
      return existing._id
    }

    const userId = await ctx.db.insert('users', {
      email: args.email,
      name: args.name,
      picture: args.picture,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })

    return userId
  },
})

export const getUserById = internalQuery({
  args: {
    userId: v.id('users'),
  },
  returns: v.union(
    v.object({
      _id: v.id('users'),
      email: v.string(),
      name: v.optional(v.string()),
      picture: v.optional(v.string()),
      educationLevel: v.optional(
        v.union(v.literal('undergraduate'), v.literal('masters'), v.literal('phd')),
      ),
      subject: v.optional(v.string()),
      discipline: v.optional(v.string()),
      nationality: v.optional(v.string()),
      language: v.optional(v.string()),
      academicStatus: v.optional(
        v.object({
          gpa: v.optional(v.number()),
          year: v.optional(v.number()),
        }),
      ),
      demographicTags: v.optional(v.array(v.string())),
      careerInterests: v.optional(v.array(v.string())),
      academicInterests: v.optional(v.array(v.string())),
      createdAt: v.number(),
      updatedAt: v.number(),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    return await ctx.db.get(args.userId)
  },
})
