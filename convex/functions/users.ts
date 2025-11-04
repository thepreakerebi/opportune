import { v } from 'convex/values'
import { internalMutation, internalQuery, mutation, query } from '../_generated/server'
import { internal } from '../_generated/api'
import { getAuthenticatedUser, requireAuth } from './authHelpers'

const educationLevelValidator = v.optional(
  v.union(v.literal('undergraduate'), v.literal('masters'), v.literal('phd')),
)

const currentEducationLevelValidator = v.optional(
  v.union(
    v.literal('highschool'),
    v.literal('undergraduate'),
    v.literal('masters'),
    v.literal('phd'),
  ),
)

export const getCurrentUser = query({
  args: {},
  returns: v.union(
    v.object({
      _id: v.id('users'),
      email: v.string(),
      name: v.optional(v.string()),
      picture: v.optional(v.string()),
      currentEducationLevel: currentEducationLevelValidator,
      intendedEducationLevel: educationLevelValidator,
      // Deprecated: kept for backward compatibility
      educationLevel: educationLevelValidator,
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
    return await getAuthenticatedUser(ctx)
  },
})

export const createProfile = mutation({
  args: {
    currentEducationLevel: currentEducationLevelValidator,
    intendedEducationLevel: educationLevelValidator,
    // Deprecated: kept for backward compatibility
    educationLevel: educationLevelValidator,
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
    const user = await requireAuth(ctx)

    // Update existing user profile
    await ctx.db.patch(user._id, {
      currentEducationLevel: args.currentEducationLevel,
      intendedEducationLevel: args.intendedEducationLevel,
      educationLevel: args.educationLevel, // Deprecated
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
    currentEducationLevel: currentEducationLevelValidator,
    intendedEducationLevel: educationLevelValidator,
    // Deprecated: kept for backward compatibility
    educationLevel: educationLevelValidator,
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
    const user = await requireAuth(ctx)

    await ctx.db.patch(user._id, {
      currentEducationLevel: args.currentEducationLevel,
      intendedEducationLevel: args.intendedEducationLevel,
      educationLevel: args.educationLevel, // Deprecated
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
    const user = await requireAuth(ctx)

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
      currentEducationLevel: currentEducationLevelValidator,
      intendedEducationLevel: educationLevelValidator,
      // Deprecated: kept for backward compatibility
      educationLevel: educationLevelValidator,
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

/**
 * Get all users with completed profiles
 * Used for daily profile searches and matching
 */
export const getAllUsersWithProfiles = internalQuery({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id('users'),
      email: v.string(),
      currentEducationLevel: currentEducationLevelValidator,
      intendedEducationLevel: educationLevelValidator,
      // Deprecated: kept for backward compatibility
      educationLevel: educationLevelValidator,
      discipline: v.optional(v.string()),
      subject: v.optional(v.string()),
      nationality: v.optional(v.string()),
      academicInterests: v.optional(v.array(v.string())),
      careerInterests: v.optional(v.array(v.string())),
      demographicTags: v.optional(v.array(v.string())),
    }),
  ),
  handler: async (ctx) => {
    // Get all users - filtering will happen in the search query generation
    const allUsers = await ctx.db.query('users').collect()
    
    // Return users that have at least some profile data
    return allUsers.filter((user) => 
      user.currentEducationLevel || user.intendedEducationLevel || user.educationLevel ||
      user.discipline || user.subject || 
      (user.academicInterests && user.academicInterests.length > 0)
    )
  },
})
