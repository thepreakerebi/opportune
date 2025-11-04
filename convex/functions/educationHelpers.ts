/**
 * Helper functions for education level logic
 * Provides utilities for handling current and intended education levels
 */

export type EducationLevel = 'undergraduate' | 'masters' | 'phd'
export type CurrentEducationLevel = 'highschool' | 'undergraduate' | 'masters' | 'phd'

export interface UserEducationLevels {
  currentEducationLevel?: CurrentEducationLevel
  intendedEducationLevel?: EducationLevel
  educationLevel?: EducationLevel // Deprecated, for backward compatibility
}

/**
 * Get the effective education level for matching opportunities
 * Priority: intendedEducationLevel > currentEducationLevel > educationLevel (deprecated)
 * 
 * This represents the level the user is seeking opportunities for.
 * Typically, users seek opportunities at their intended/next level.
 * Note: highschool maps to undergraduate for matching purposes
 */
export function getEffectiveEducationLevel(
  user: UserEducationLevels,
): EducationLevel | undefined {
  if (user.intendedEducationLevel) {
    return user.intendedEducationLevel
  }
  // Map highschool to undergraduate for matching
  if (user.currentEducationLevel === 'highschool') {
    return 'undergraduate'
  }
  if (user.currentEducationLevel) {
    return user.currentEducationLevel
  }
  return user.educationLevel
}

/**
 * Get all education levels for a user (current and intended)
 * Used for comprehensive matching that includes both current and next level opportunities
 * Note: highschool maps to undergraduate for matching purposes
 */
export function getAllEducationLevels(
  user: UserEducationLevels,
): Array<EducationLevel> {
  const levels = new Set<EducationLevel>()
  
  // Map highschool to undergraduate for matching (highschool students seek undergrad opportunities)
  if (user.currentEducationLevel === 'highschool') {
    levels.add('undergraduate')
  } else if (user.currentEducationLevel) {
    levels.add(user.currentEducationLevel)
  }
  if (user.intendedEducationLevel) {
    levels.add(user.intendedEducationLevel)
  }
  // Include deprecated field for backward compatibility
  if (user.educationLevel) {
    levels.add(user.educationLevel)
  }
  
  return Array.from(levels)
}

/**
 * Format education level for display or AI prompts
 */
export function formatEducationLevels(user: UserEducationLevels): string {
  const parts: Array<string> = []
  
  if (user.currentEducationLevel) {
    const displayName = user.currentEducationLevel === 'highschool' ? 'high school' : user.currentEducationLevel
    parts.push(`Current: ${displayName}`)
  }
  if (user.intendedEducationLevel) {
    parts.push(`Seeking: ${user.intendedEducationLevel}`)
  }
  // Include deprecated field only if new fields aren't set
  if (!user.currentEducationLevel && !user.intendedEducationLevel && user.educationLevel) {
    parts.push(`Education Level: ${user.educationLevel}`)
  }
  
  return parts.length > 0 ? parts.join(', ') : 'Not specified'
}

