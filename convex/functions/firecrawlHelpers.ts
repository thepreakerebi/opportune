/**
 * Generate a personalized search query based on user profile
 * Creates a tailored search query that includes user-specific criteria
 */
export function generateProfileSearchQuery(user: {
  educationLevel?: 'undergraduate' | 'masters' | 'phd'
  discipline?: string
  subject?: string
  nationality?: string
  academicInterests?: Array<string>
  careerInterests?: Array<string>
  demographicTags?: Array<string>
}): string {
  const parts: Array<string> = []

  // Add education level
  if (user.educationLevel) {
    if (user.educationLevel === 'undergraduate') {
      parts.push('undergraduate OR bachelors')
    } else if (user.educationLevel === 'masters') {
      parts.push('masters OR graduate OR postgraduate')
    } else {
      // user.educationLevel must be 'phd' at this point
      parts.push('PhD OR doctoral OR doctorate')
    }
  }

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

