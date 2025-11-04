import { cronJobs } from 'convex/server'
import { internal } from './_generated/api'

const crons = cronJobs()

crons.interval(
  'generate-deadline-alerts',
  { hours: 24 },
  internal.functions.alerts.generateDeadlineAlerts,
  {},
)

crons.interval(
  'generate-missing-doc-alerts',
  { hours: 12 },
  internal.functions.alerts.generateMissingDocAlerts,
  {},
)

crons.cron(
  'weekly-general-search',
  '0 0 * * 0',
  internal.functions.firecrawl.runGeneralSearch,
  {
    searchQuery:
      '2025 scholarships OR grants OR fellowships OR awards OR funding undergraduate OR bachelors OR masters OR graduate OR postgraduate OR PhD OR doctoral application open site:edu OR site:gov OR site:org',
    limit: 100,
  },
)

export default crons

