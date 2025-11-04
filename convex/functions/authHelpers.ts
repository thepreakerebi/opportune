import { auth } from '../auth'
import type { MutationCtx, QueryCtx } from '../_generated/server'

/**
 * Shared authorization helper functions
 */

/**
 * Get the current authenticated user from Convex Auth
 * Returns null if not authenticated
 */
export async function getAuthenticatedUser(ctx: QueryCtx | MutationCtx) {
  const authUserId = await auth.getUserId(ctx)
  if (!authUserId) {
    return null
  }

  // Get auth user to access email
  const authUser = await ctx.db.get(authUserId)
  if (!authUser) {
    return null
  }

  // Get email from auth user (stored in auth_users table)
  const email = (authUser as any).email
  if (!email) {
    return null
  }

  // Find user by email from accounts
  const user = await ctx.db
    .query('users')
    .withIndex('by_email', (q: any) => q.eq('email', email))
    .first()

  return user
}

/**
 * Require authentication - throws error if user is not authenticated
 * Returns the authenticated user
 */
export async function requireAuth(ctx: QueryCtx | MutationCtx) {
  const user = await getAuthenticatedUser(ctx)
  if (!user) {
    throw new Error('Not authenticated')
  }
  return user
}

/**
 * Require ownership - verifies that a resource belongs to the authenticated user
 * Throws error if user is not authenticated or doesn't own the resource
 */
export async function requireOwnership(
  ctx: QueryCtx | MutationCtx,
  resourceUserId: string,
  resourceType: string = 'Resource',
) {
  const user = await requireAuth(ctx)
  if (user._id !== resourceUserId) {
    throw new Error(`${resourceType} not found or access denied`)
  }
  return user
}

