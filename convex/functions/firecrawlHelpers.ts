/**
 * Generate a personalized search query based on user profile
 * Creates a tailored search query that includes user-specific criteria
 */
export function generateProfileSearchQuery(user: {
  currentEducationLevel?: 'highschool' | 'undergraduate' | 'masters' | 'phd'
  intendedEducationLevel?: 'undergraduate' | 'masters' | 'phd'
  // Deprecated: kept for backward compatibility
  educationLevel?: 'undergraduate' | 'masters' | 'phd'
  discipline?: string
  subject?: string
  nationality?: string
  academicInterests?: Array<string>
  careerInterests?: Array<string>
  demographicTags?: Array<string>
}): string {
  const parts: Array<string> = []

  // Add education levels (prioritize intended, include current if different)
  const educationLevels = new Set<string>()
  
  // Add intended level (primary)
  if (user.intendedEducationLevel) {
    if (user.intendedEducationLevel === 'undergraduate') {
      educationLevels.add('undergraduate OR bachelors')
    } else if (user.intendedEducationLevel === 'masters') {
      educationLevels.add('masters OR graduate OR postgraduate')
    } else {
      educationLevels.add('PhD OR doctoral OR doctorate')
    }
  }
  
  // Add current level (if different from intended)
  // Highschool students should search for undergraduate opportunities
  if (user.currentEducationLevel && user.currentEducationLevel !== user.intendedEducationLevel) {
    if (user.currentEducationLevel === 'highschool') {
      educationLevels.add('undergraduate OR bachelors')
    } else if (user.currentEducationLevel === 'undergraduate') {
      educationLevels.add('undergraduate OR bachelors')
    } else if (user.currentEducationLevel === 'masters') {
      educationLevels.add('masters OR graduate OR postgraduate')
    } else {
      educationLevels.add('PhD OR doctoral OR doctorate')
    }
  }
  
  // Fallback to deprecated field if new fields not set
  if (educationLevels.size === 0 && user.educationLevel) {
    if (user.educationLevel === 'undergraduate') {
      educationLevels.add('undergraduate OR bachelors')
    } else if (user.educationLevel === 'masters') {
      educationLevels.add('masters OR graduate OR postgraduate')
    } else {
      educationLevels.add('PhD OR doctoral OR doctorate')
    }
  }
  
  // Add unique education level terms
  parts.push(...Array.from(educationLevels))

  // Add discipline/subject
  if (user.discipline) {
    parts.push(user.discipline)
  }
  if (user.subject) {
    parts.push(user.subject)
  }

  // Add academic interests
  if (user.academicInterests && user.academicInterests.length > 0) {
    parts.push(user.academicInterests.slice(0, 3).join(' OR '))
  }

  // Add nationality-based region filters
  if (user.nationality) {
    parts.push(user.nationality)
  }

  // Base scholarship search terms
  const baseTerms = 'scholarships OR grants OR fellowships OR awards OR funding'
  
  // Combine all parts
  const queryParts = parts.length > 0 ? `${baseTerms} ${parts.join(' ')}` : baseTerms
  
  // Add site filters
  return `${queryParts} application open site:edu OR site:gov OR site:org`
}

