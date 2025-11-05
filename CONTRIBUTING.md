# Contributing to Opportune

Thank you for your interest in contributing to Opportune! This document provides guidelines and instructions for contributing to the project.

## 🤝 Code of Conduct

By participating in this project, you agree to maintain a respectful and inclusive environment. We are committed to:

- Being respectful and considerate of all contributors
- Welcoming newcomers and helping them learn
- Focusing on constructive feedback
- Being open to different perspectives and ideas

## 🚀 Getting Started

1. **Fork the repository** on GitHub
2. **Clone your fork**:
   ```bash
   git clone https://github.com/your-username/opportune.git
   cd opportune
   ```
3. **Add upstream remote**:
   ```bash
   git remote add upstream https://github.com/thepreakerebi/opportune.git
   ```
4. **Install dependencies**:
   ```bash
   npm install
   ```
5. **Set up your development environment** (see main README.md)

## 📝 Development Process

### Branch Naming

Use descriptive branch names:
- `feature/feature-name` - For new features
- `fix/bug-description` - For bug fixes
- `docs/documentation-update` - For documentation changes
- `refactor/component-name` - For refactoring
- `test/test-description` - For adding tests

### Making Changes

1. **Create a feature branch**:
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes**:
   - Write clean, readable code
   - Follow the coding standards (see below)
   - Add comments for complex logic
   - Update documentation as needed

3. **Test your changes**:
   - Test manually in the browser
   - Check Convex Dashboard for function logs
   - Verify no TypeScript errors: `npm run lint`

4. **Format your code**:
   ```bash
   npm run format
   ```

5. **Commit your changes**:
   ```bash
   git commit -m "feat: add your feature description"
   ```
   
   Use [Conventional Commits](https://www.conventionalcommits.org/):
   - `feat:` - New feature
   - `fix:` - Bug fix
   - `docs:` - Documentation changes
   - `style:` - Code style changes (formatting, etc.)
   - `refactor:` - Code refactoring
   - `test:` - Adding or updating tests
   - `chore:` - Maintenance tasks
   - `perf:` - Performance improvements

6. **Push to your fork**:
   ```bash
   git push origin feature/your-feature-name
   ```

7. **Create a Pull Request**:
   - Open a PR on GitHub
   - Use a clear, descriptive title
   - Fill out the PR description template
   - Link any related issues
   - Request review from maintainers

## 📋 Coding Standards

### TypeScript

- **Strict mode**: All code must pass TypeScript strict checks
- **Type everything**: Avoid `any` when possible, use proper types
- **Function signatures**: Always include `args` and `returns` validators for Convex functions

### Code Style

- **Formatting**: Use Prettier (configured in the project)
- **Linting**: Follow ESLint rules (run `npm run lint`)
- **Imports**: Group imports logically:
  1. External packages
  2. Convex generated files (`_generated`)
  3. Internal modules
  4. Relative imports

### Convex Functions

- **Use new syntax**: Always use the new Convex function syntax:
  ```typescript
  export const myFunction = query({
    args: { ... },
    returns: v.object({ ... }),
    handler: async (ctx, args) => { ... }
  })
  ```

- **Authorization**: Always use `requireAuth()` or `requireOwnership()` for user data
- **Error handling**: Use try-catch for external API calls
- **Type safety**: Use proper `Id<TableName>` types

### Accessibility

- Use semantic HTML elements
- Include proper ARIA labels
- Ensure keyboard navigation works
- Maintain color contrast ratios
- Test with screen readers

### Documentation

- **Comments**: Document complex logic and public APIs
- **Function descriptions**: Add JSDoc comments for exported functions
- **README updates**: Update README.md when adding new features

## 🧪 Testing

Currently, we don't have automated tests set up, but manual testing is expected:

1. **Test your changes** in the development environment
2. **Check Convex Dashboard** for function logs and errors
3. **Test edge cases** and error scenarios
4. **Verify** no TypeScript errors: `npm run lint`

In the future, we plan to add:
- Unit tests for utility functions
- Integration tests for API endpoints
- E2E tests for critical workflows

## 🐛 Reporting Bugs

When reporting bugs, please include:

1. **Description**: Clear description of the bug
2. **Steps to reproduce**: Detailed steps to reproduce the issue
3. **Expected behavior**: What should happen
4. **Actual behavior**: What actually happens
5. **Environment**: Node version, OS, browser (if applicable)
6. **Screenshots**: If applicable, include screenshots
7. **Logs**: Any relevant error logs from Convex Dashboard

## 💡 Feature Requests

When requesting features:

1. **Check existing issues**: Make sure the feature hasn't been requested
2. **Describe the use case**: Explain why this feature would be useful
3. **Describe the solution**: How you envision it working
4. **Consider alternatives**: Are there other ways to solve this?

## 🔍 Pull Request Process

1. **Update documentation** if your PR changes functionality
2. **Add comments** for complex code
3. **Follow coding standards** and pass linting
4. **Write a clear PR description**:
   - What changes were made
   - Why the changes were made
   - How to test the changes
   - Screenshots (if UI changes)

5. **Link related issues** using GitHub keywords (fixes #123, closes #456)
6. **Respond to feedback** promptly and constructively
7. **Keep PRs focused**: One feature or fix per PR

### PR Review Checklist

- [ ] Code follows project style guidelines
- [ ] No TypeScript errors
- [ ] Code is properly formatted
- [ ] Documentation updated if needed
- [ ] Changes tested manually
- [ ] No breaking changes (or documented if necessary)

## 🎯 Areas We Need Help

We welcome contributions in these areas:

- **Frontend Development**: UI components and user experience
- **Testing**: Writing unit and integration tests
- **Documentation**: Improving docs, adding examples
- **Internationalization**: Multi-language support
- **Performance**: Optimizing queries and API calls
- **Security**: Security audits and improvements
- **Accessibility**: WCAG compliance improvements

## ❓ Questions?

- Check existing [Issues](https://github.com/thepreakerebi/opportune/issues)
- Start a [Discussion](https://github.com/thepreakerebi/opportune/discussions)
- Reach out to maintainers via GitHub

## 🙏 Thank You!

Your contributions help make Opportune better for students everywhere. Thank you for taking the time to contribute!

