import { cronJobs } from 'convex/server'
import { internal } from './_generated/api'

const crons = cronJobs()

// Generate deadline alerts daily
crons.interval(
  'generate-deadline-alerts',
  { hours: 24 },
  internal.functions.alerts.generateDeadlineAlerts,
  {},
)

// Generate missing doc alerts twice daily
crons.interval(
  'generate-missing-doc-alerts',
  { hours: 12 },
  internal.functions.alerts.generateMissingDocAlerts,
  {},
)

// Generate auto-nudges daily
crons.interval(
  'generate-auto-nudges',
  { hours: 24 },
  internal.functions.alerts.generateAutoNudges,
  {},
)

// Daily general Firecrawl search at 2 AM UTC
// Runs broad "catch-all" search prompts to discover all opportunities
// After completion, triggers automated AI-powered matching workflow
crons.cron(
  'daily-general-search',
  '0 2 * * *', // 2 AM UTC daily
  internal.functions.firecrawl.runGeneralSearch,
  {
    searchQuery:
      '2025 scholarships OR grants OR fellowships OR awards OR funding undergraduate OR bachelors OR masters OR graduate OR postgraduate OR PhD OR doctoral application open site:edu OR site:gov OR site:org',
    limit: 100,
  },
)

// Daily AI-powered matching and tagging at 3 AM UTC
// Runs after general search completes to intelligently match opportunities to users
// Uses Vercel AI SDK workflow patterns with GPT-4o for robust matching
crons.cron(
  'daily-ai-matching-workflow',
  '0 3 * * *', // 3 AM UTC daily (runs after general search)
  internal.functions.matching.runDailyAIMatchingWorkflow,
  {},
)

export default crons
