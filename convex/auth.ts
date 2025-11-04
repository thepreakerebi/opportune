import Google from '@auth/core/providers/google'
import { convexAuth } from '@convex-dev/auth/server'
import { internal } from './_generated/api'
import type { MutationCtx } from './_generated/server'

/**
 * Convex Auth configuration with Google OAuth
 * Reference: https://labs.convex.dev/auth/config/oauth/google
 */
export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    Google({
      profile(googleProfile) {
        return {
          id: googleProfile.sub,
          name: googleProfile.name ?? undefined,
          email: googleProfile.email ?? undefined,
          image: googleProfile.picture ?? undefined,
        }
      },
    }),
  ],
  /**
   * Callback: Sync user data to our custom users table after user is created/updated
   * Called after successful authentication
   */
  callbacks: {
    async afterUserCreatedOrUpdated(ctx: MutationCtx, args: { userId: string }) {
      const authUserId = args.userId as any

      // Get auth user to access email, name, and image
      const authUser = await ctx.db.get(authUserId)
      if (!authUser) {
        return
      }

      // Get email from auth user (stored in auth_users table)
      // For OAuth providers, email is typically stored in the auth_users table
      const email = (authUser as any).email
      if (!email) {
        return
      }

      // Check if user already exists
      const existing = await ctx.db
        .query('users')
        .withIndex('by_email', (q: any) => q.eq('email', email))
        .first()

      const name = (authUser as any).name
      const image = (authUser as any).image

      if (existing) {
        // Update existing user
        await ctx.db.patch(existing._id, {
          name: name ?? existing.name,
          picture: image ?? existing.picture,
          updatedAt: Date.now(),
        })

        // Schedule profile matching if profile was updated
        await ctx.scheduler.runAfter(0, internal.functions.matching.tagRecommendedOpportunities as any, {
          userId: existing._id,
        })
      } else {
        // Create new user
        const userId = await ctx.db.insert('users', {
          email,
          name: name ?? undefined,
          picture: image ?? undefined,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        })

        // Schedule profile matching for new user
        await ctx.scheduler.runAfter(0, internal.functions.matching.tagRecommendedOpportunities as any, {
          userId,
        })
      }
    },
  },
})

