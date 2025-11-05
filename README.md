# Opportune

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](http://makeapullrequest.com)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue)](https://www.typescriptlang.org/)
[![Convex](https://img.shields.io/badge/Convex-1.28-orange)](https://www.convex.dev/)

An AI-powered web platform for students (undergraduate, masters, PhD) to discover, track, and apply for scholarships, grants, awards, and fellowships with maximum personalization, automation, and guided support.

**Status**: 🚧 Active Development - MVP Complete

## 📑 Table of Contents

- [Overview](#-overview)
- [Key Features](#-key-features)
- [Tech Stack](#️-tech-stack)
- [Prerequisites](#-prerequisites)
- [Installation & Setup](#-installation--setup)
- [Project Structure](#-project-structure)
- [Key Concepts](#-key-concepts)
- [Development](#-development)
- [API Documentation](#-api-documentation)
- [Deployment](#-deployment)
- [Security](#-security)
- [Monitoring](#-monitoring)
- [Troubleshooting](#-troubleshooting)
- [Contributing](#-contributing)
- [Roadmap](#-roadmap)
- [Architecture](#️-architecture)
- [Project Status](#-project-status)
- [Acknowledgments](#-acknowledgments)
- [License](#-license)
- [Support & Community](#-support--community)

## 🎯 Overview

Opportune leverages cutting-edge AI technology to help students find and apply for educational opportunities. The platform automatically discovers opportunities from across the web, matches them to your profile using AI-powered semantic analysis, and guides you through the entire application process with intelligent assistance.

## ✨ Key Features

### 🎓 Opportunity Discovery
- **Automated Daily Search**: Firecrawl-powered web search discovers new opportunities daily
- **Personalized Matching**: AI-powered matching algorithm finds opportunities tailored to your profile
- **Semantic Search**: Natural language search with vector embeddings for intelligent discovery
- **Profile-Based Recommendations**: Opportunities matched to your education level, discipline, and interests

### 📝 Guided Application Workflow
- **AI-Generated Checklists**: Automatically extracted from opportunity requirements
- **Document Matching**: Intelligent matching of your uploaded files to application requirements
- **Essay/Document Builder**: AI-assisted essay and document generation using BlockNote.js
- **Guided Autofill**: AI-powered form autofill based on your profile and opportunity details
- **Application Preview**: Complete preview of your application before submission

### 📊 Tracking & Management
- **Application Status Tracking**: Monitor progress with status indicators (Saved, In Progress, Submitted, Awaiting Docs)
- **Progress Calculation**: Automatic progress bars based on checklist completion
- **Calendar Integration**: Visual calendar of deadlines and important dates
- **Alert System**: Automated alerts for deadlines, missing documents, and reminders

### 🤖 AI Assistant
- **Chat Interface**: Natural language chat agent for answering questions about opportunities and applications
- **Real-time Streaming**: Responses streamed in real-time for better UX
- **Context-Aware**: Understands your profile, applications, and opportunities

### 🔔 Notifications
- **Email Notifications**: Automated email alerts via Resend integration
- **Deadline Alerts**: Reminders at 7, 3, and 1 day before deadlines
- **Missing Document Alerts**: Automatic detection and notification of missing required documents
- **Auto-Nudges**: Intelligent reminders for incomplete applications

## 🛠️ Tech Stack

### Backend
- **[Convex](https://www.convex.dev/)**: Backend-as-a-Service for database, real-time sync, and serverless functions
- **[Vercel AI SDK](https://sdk.vercel.ai/)**: AI workflow orchestration and tool calling
- **[OpenAI](https://openai.com/)**: GPT-4o for complex reasoning, GPT-4o-mini for cost-effective operations
- **[Firecrawl](https://www.firecrawl.dev/)**: Web scraping and content extraction
- **[Resend](https://resend.com/)**: Email delivery service

### Frontend
- **[TanStack Start](https://tanstack.com/start/latest)**: Full-stack React framework
- **[TanStack Router](https://tanstack.com/router/latest)**: Type-safe routing
- **[TanStack Query](https://tanstack.com/query/latest)**: Data fetching and caching
- **[Tailwind CSS](https://tailwindcss.com/)**: Utility-first CSS framework

### AI & ML
- **OpenAI GPT-4o**: Complex reasoning, tool calling, essay generation
- **OpenAI GPT-4o-mini**: Cost-effective classification and summarization
- **OpenAI text-embedding-3-small**: Vector embeddings for semantic search
- **Convex Vector Search**: Native vector search capabilities

## 📋 Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js** 18+ and npm
- **Git**
- **Convex Account** ([Sign up](https://www.convex.dev/))
- **OpenAI API Key** ([Get one here](https://platform.openai.com/api-keys))
- **Firecrawl API Key** ([Get one here](https://www.firecrawl.dev/))
- **Resend API Key** ([Get one here](https://resend.com/))
- **Google OAuth Credentials** (for authentication)

## 🚀 Installation & Setup

### 1. Clone the Repository

```bash
git clone https://github.com/thepreakerebi/opportune.git
cd opportune
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Set Up Convex

```bash
# Login to Convex (if not already logged in)
npx convex dev

# This will prompt you to:
# - Login or create an account
# - Create a new project or select existing
# - Configure your deployment
```

### 4. Configure Environment Variables

Set the following environment variables in your Convex project:

#### Required Environment Variables

```bash
# OpenAI API Key (for AI features)
npx convex env set OPENAI_API_KEY 'sk-your-openai-api-key-here'

# Firecrawl API Key (for web scraping)
npx convex env set FIRECRAWL_API_KEY 'your-firecrawl-api-key-here'

# Resend API Key (for email notifications)
npx convex env set RESEND_API_KEY 're_your-resend-api-key-here'

# Google OAuth (for authentication)
npx convex env set AUTH_GOOGLE_ID 'your-google-client-id'
npx convex env set AUTH_GOOGLE_SECRET 'your-google-client-secret'
```

#### Optional Environment Variables

```bash
# Resend Webhook Secret (for email event tracking)
npx convex env set RESEND_WEBHOOK_SECRET 'your-webhook-secret'
```

### 5. Configure Google OAuth

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Navigate to **APIs & Services** > **Credentials**
4. Click **Create Credentials** > **OAuth 2.0 Client ID**
5. Configure:
   - **Application type**: Web application
   - **Authorized JavaScript origins**: 
     - `http://localhost:5173` (for local development)
     - Your production URL
   - **Authorized redirect URIs**:
     - `https://your-deployment.convex.site/api/auth/callback/google`
     - Replace `your-deployment` with your actual Convex deployment URL
6. Copy the **Client ID** and **Client Secret** and set them as environment variables

### 6. Configure Resend (Optional)

1. Go to [Resend Dashboard](https://resend.com/)
2. Create a new API key
3. Set up a webhook (optional):
   - URL: `https://your-deployment.convex.site/resend-webhook`
   - Enable all `email.*` events
   - Copy the webhook secret
4. Update sender email in `convex/functions/emails.ts`:
   - Replace `'Opportune <notifications@shamp.io>'` with your verified domain

### 7. Start Development Server

```bash
npm run dev
```

This will start:
- Frontend dev server (Vite) on `http://localhost:5173`
- Convex backend dev server

## 📁 Project Structure

```
opportune/
├── convex/                    # Backend (Convex)
│   ├── functions/            # Serverless functions
│   │   ├── agents/          # AI agent workflows and tools
│   │   ├── alerts.ts        # Alert generation and management
│   │   ├── applications.ts # Application CRUD operations
│   │   ├── applicationWorkflow.ts # Guided application workflow
│   │   ├── calendar.ts      # Calendar and event queries
│   │   ├── documents.ts    # Document management
│   │   ├── emails.ts       # Email notification system
│   │   ├── embeddings.ts   # Vector embedding generation
│   │   ├── firecrawl.ts    # Firecrawl integration
│   │   ├── matching.ts     # AI-powered opportunity matching
│   │   ├── opportunities.ts # Opportunity CRUD operations
│   │   ├── opportunitiesSearch.ts # User-initiated search
│   │   ├── semanticSearch.ts # Vector-based semantic search
│   │   ├── userFiles.ts    # User file upload management
│   │   └── users.ts        # User profile management
│   ├── schema.ts            # Database schema definition
│   ├── crons.ts             # Scheduled jobs configuration
│   ├── auth.ts              # Authentication configuration
│   └── http.ts              # HTTP route handlers
├── src/                      # Frontend (TanStack Start)
│   ├── routes/              # Route definitions
│   └── router.tsx           # Router configuration
├── public/                   # Static assets
└── package.json             # Dependencies and scripts
```

## 🔑 Key Concepts

### Database Schema

The application uses the following main tables:

- **`users`**: User profiles with education levels, interests, and academic status
- **`opportunities`**: Scholarship/grant opportunities with requirements and metadata
- **`applications`**: User applications with status, checklists, and progress
- **`documents`**: User-created documents (essays, cover letters) using BlockNote.js
- **`userFiles`**: User-uploaded files (CV, transcripts, etc.)
- **`alerts`**: Notifications and reminders for users
- **`userOpportunityMatches`**: User-specific opportunity matching data

### Function Types

- **`query`**: Read-only operations, synchronous, client-callable
- **`mutation`**: Write operations, synchronous, client-callable
- **`action`**: Can call external APIs, async, Node.js runtime, client-callable
- **`internalQuery`**: Internal read operations
- **`internalMutation`**: Internal write operations
- **`internalAction`**: Internal async operations

### Authentication

The app uses [Convex Auth](https://labs.convex.dev/auth) with Google OAuth. Users are automatically synced to the `users` table upon authentication.

### Automated Workflows

**Daily Cron Jobs:**
- **2 AM UTC**: General Firecrawl search for new opportunities
- **3 AM UTC**: AI-powered matching workflow to match opportunities to users
- **Every 24 hours**: Deadline alerts generation
- **Every 12 hours**: Missing document alerts generation
- **Every 24 hours**: Auto-nudges for incomplete applications

## 🧪 Development

### Available Scripts

```bash
# Start development servers (frontend + backend)
npm run dev

# Start frontend only
npm run dev:web

# Start Convex backend only
npm run dev:convex

# Build for production
npm run build

# Run linting
npm run lint

# Format code
npm run format
```

### Testing Backend Functions

You can test Convex functions directly in the Convex Dashboard:
1. Go to https://dashboard.convex.dev
2. Select your project
3. Navigate to **Functions** tab
4. Call functions directly with test data

### Viewing Database

Access your database in the Convex Dashboard:
1. Go to https://dashboard.convex.dev
2. Select your project
3. Navigate to **Data** tab
4. Browse tables and query data

## 📚 API Documentation

### Main Queries

- `api.functions.users.getCurrentUser` - Get current authenticated user
- `api.functions.opportunities.listOpportunities` - List opportunities with filtering
- `api.functions.opportunities.getRecommendedOpportunities` - Get personalized recommendations
- `api.functions.applications.getUserApplications` - Get user's applications
- `api.functions.calendar.getCalendarEvents` - Get calendar events
- `api.functions.alerts.getAlertFeed` - Get user's alert feed

### Main Mutations

- `api.functions.users.createProfile` - Create user profile
- `api.functions.users.updateProfile` - Update user profile
- `api.functions.applications.createApplication` - Create new application
- `api.functions.applications.updateApplicationStatus` - Update application status
- `api.functions.documents.createDocument` - Create document (BlockNote.js)

### Main Actions

- `api.functions.opportunitiesSearch.searchOpportunities` - Search for opportunities
- `api.functions.applicationWorkflow.generateEssayDraft` - Generate essay draft
- `api.functions.applicationWorkflow.generateApplicationPreview` - Generate application preview
- `api.functions.agents.workflows.chatAgent` - Chat with AI assistant
- `api.functions.userFiles.actions.generateFileUploadUrl` - Get file upload URL

## 🚢 Deployment

### Frontend Deployment

The frontend can be deployed to any static hosting service:
- **Vercel** (recommended): `vercel deploy`
- **Netlify**: `netlify deploy`
- **Cloudflare Pages**: Connect your GitHub repository

### Backend Deployment

Convex automatically deploys your backend when you push to your connected repository. For manual deployment:

```bash
npx convex deploy
```

### Environment Variables in Production

Make sure to set all environment variables in your Convex Dashboard:
1. Go to **Settings** → **Environment Variables**
2. Add all required variables
3. Restart your deployment

## 🔒 Security

- All user data is encrypted at rest
- Authentication handled by Convex Auth
- File uploads validated for type and size
- Magic byte verification for uploaded files
- Authorization checks on all mutations
- Ownership verification for user resources

## 📊 Monitoring

Monitor your application:
- **Convex Dashboard**: Function logs, database queries, errors
- **OpenAI Dashboard**: API usage and costs
- **Resend Dashboard**: Email delivery metrics

## 🐛 Troubleshooting

### Common Issues

**"Not authenticated" errors**
- Ensure you're signed in via Google OAuth
- Check that `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET` are set correctly

**Firecrawl errors**
- Verify `FIRECRAWL_API_KEY` is set correctly
- Check API quota limits in Firecrawl dashboard

**Email not sending**
- Verify `RESEND_API_KEY` is set correctly
- Ensure sender email is verified in Resend
- Check `convex/functions/emails.ts` for correct sender address

**Embeddings not generating**
- Verify `OPENAI_API_KEY` is set correctly
- Check OpenAI API quota and billing

**Type errors after changes**
- Regenerate Convex types: `npx convex dev`
- Restart your development server

## 🤝 Contributing

We welcome contributions! Opportune is an open-source project and we appreciate your help in making it better.

**📖 See [CONTRIBUTING.md](CONTRIBUTING.md) for detailed contribution guidelines.**

### Quick Start

1. **Fork the repository**
   - Click the "Fork" button on GitHub
   - Or use GitHub CLI: `gh repo fork thepreakerebi/opportune`

2. **Create a feature branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```

3. **Make your changes**
   - Follow our coding standards (see below)
   - Write tests if applicable
   - Update documentation as needed

4. **Commit your changes**
   ```bash
   git commit -m "feat: add your feature description"
   ```
   We follow [Conventional Commits](https://www.conventionalcommits.org/):
   - `feat:` for new features
   - `fix:` for bug fixes
   - `docs:` for documentation changes
   - `style:` for formatting changes
   - `refactor:` for code refactoring
   - `test:` for adding tests
   - `chore:` for maintenance tasks

5. **Push to your fork**
   ```bash
   git push origin feature/your-feature-name
   ```

6. **Create a Pull Request**
   - Open a PR on GitHub
   - Fill out the PR template
   - Link any related issues
   - Wait for review and address feedback

### Development Workflow

1. **Set up your development environment** (see Installation & Setup above)
2. **Run the development server**: `npm run dev`
3. **Make changes** to the codebase
4. **Run linting**: `npm run lint`
5. **Format code**: `npm run format`
6. **Test your changes** thoroughly

### Coding Standards

- **TypeScript**: Strict mode enabled, all code must be typed
- **ESLint**: Follow the project's ESLint configuration
- **Formatting**: Use Prettier (run `npm run format` before committing)
- **Imports**: Group imports logically (external → internal → relative)
- **Functions**: Use the new Convex function syntax with `args` and `returns` validators
- **Comments**: Document complex logic and public APIs
- **Accessibility**: Follow WCAG guidelines (see user rules)

### Areas We Need Help

- 🐛 **Bug Fixes**: Check the [Issues](https://github.com/thepreakerebi/opportune/issues) tab
- 🎨 **UI/UX Improvements**: Frontend components and user experience
- 📚 **Documentation**: Improving docs, adding examples, tutorials
- 🧪 **Testing**: Adding unit tests and integration tests
- 🌍 **Internationalization**: Multi-language support
- ⚡ **Performance**: Optimizing queries and reducing API costs
- 🔒 **Security**: Security audits and improvements

### Pull Request Guidelines

- **Keep PRs focused**: One feature or fix per PR
- **Write clear descriptions**: Explain what and why
- **Add tests**: If applicable, add tests for new features
- **Update documentation**: Update README or inline docs as needed
- **Respond to feedback**: Be open to suggestions and iterate

### Code of Conduct

We are committed to providing a welcoming and inclusive environment. Please:

- Be respectful and considerate
- Welcome newcomers and help them learn
- Focus on constructive feedback
- Be open to different perspectives

### Questions?

- Check existing [Issues](https://github.com/thepreakerebi/opportune/issues)
- Start a [Discussion](https://github.com/thepreakerebi/opportune/discussions)
- Reach out to maintainers

## 📋 Roadmap

### Current Status: MVP Complete ✅

- [x] Core opportunity discovery
- [x] AI-powered matching
- [x] Application workflow
- [x] Alert system
- [x] Email notifications
- [x] Chat agent

### Upcoming Features

- [ ] Frontend implementation
- [ ] Mobile app support
- [ ] Multi-language support
- [ ] Advanced analytics dashboard
- [ ] Social features (share opportunities)
- [ ] Application templates
- [ ] Integration with external application portals

## 🏗️ Architecture

### High-Level Flow

```
User Registration → Profile Creation → Opportunity Discovery → 
AI Matching → Application Creation → Guided Workflow → 
Document Matching → Submission Tracking → Alerts & Notifications
```

### Key Design Decisions

- **Convex Backend**: Chosen for real-time sync, built-in auth, and serverless functions
- **Vercel AI SDK**: Provides structured tool calling and workflow patterns
- **Vector Embeddings**: Enables semantic understanding beyond keyword matching
- **Hybrid Matching**: Combines AI reasoning, semantic similarity, and keyword matching for best results

## 📊 Project Status

| Component | Status | Notes |
|-----------|--------|-------|
| Backend Logic | ✅ Complete | MVP features implemented |
| Database Schema | ✅ Complete | All tables defined |
| AI Matching | ✅ Complete | Hybrid scoring implemented |
| Application Workflow | ✅ Complete | Full guided workflow |
| Alert System | ✅ Complete | Automated alerts + emails |
| Frontend | 🚧 In Progress | Ready for implementation |
| Testing | 📝 Planned | Unit and integration tests needed |
| Documentation | ✅ Complete | README and inline docs |

## 🙏 Acknowledgments

- [Convex](https://www.convex.dev/) for the amazing backend platform
- [TanStack](https://tanstack.com/) for the excellent React tooling
- [OpenAI](https://openai.com/) for powerful AI capabilities
- [Firecrawl](https://www.firecrawl.dev/) for web scraping
- [Resend](https://resend.com/) for email delivery
- All contributors and supporters of this project

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 📞 Support & Community

- **GitHub Issues**: [Report bugs or request features](https://github.com/thepreakerebi/opportune/issues)
- **GitHub Discussions**: [Ask questions and share ideas](https://github.com/thepreakerebi/opportune/discussions)
- **Documentation**: 
  - [Convex Documentation](https://docs.convex.dev/)
  - [Vercel AI SDK Documentation](https://sdk.vercel.ai/docs)
  - [TanStack Documentation](https://tanstack.com/docs)

## ⭐ Star History

If you find this project helpful, please consider giving it a star ⭐ on GitHub!

## 📈 Stats

![GitHub stars](https://img.shields.io/github/stars/thepreakerebi/opportune?style=social)
![GitHub forks](https://img.shields.io/github/forks/thepreakerebi/opportune?style=social)
![GitHub issues](https://img.shields.io/github/issues/thepreakerebi/opportune)
![GitHub pull requests](https://img.shields.io/github/issues-pr/thepreakerebi/opportune)

---

**Built with ❤️ using [Convex](https://www.convex.dev/), [TanStack](https://tanstack.com/), and [OpenAI](https://openai.com/)**

**Made for students, by developers who care about education access.**

