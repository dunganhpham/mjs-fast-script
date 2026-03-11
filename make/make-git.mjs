import { writeFileSync, existsSync, mkdirSync } from "fs";
import { resolve } from "path";
if (process.argv[2]) process.chdir(resolve(process.argv[2]));

// ─── .gitignore (comprehensive Node.js) ───
const gitignore = `
# ─── Dependencies ───
node_modules/
.pnp
.pnp.js
.yarn/

# ─── Build ───
dist/
build/
out/
.next/
.nuxt/
.output/
*.tsbuildinfo

# ─── Test & Coverage ───
coverage/
.nyc_output/
junit.xml
e2e-results.xml
playwright-report/
test-results/

# ─── Environment ───
.env
.env.local
.env.*.local
!.env.example
!.env.test

# ─── IDE ───
.vscode/*
!.vscode/settings.json
!.vscode/extensions.json
!.vscode/launch.json
!.vscode/tasks.json
!.vscode/*.code-snippets
.idea/
*.swp
*.swo
*~
*.sublime-workspace
*.sublime-project

# ─── OS ───
.DS_Store
Thumbs.db
ehthumbs.db
Desktop.ini

# ─── Logs ───
logs/
*.log
npm-debug.log*
yarn-debug.log*
yarn-error.log*
pnpm-debug.log*
lerna-debug.log*

# ─── Docker (local volumes) ───
docker-data/
.docker/

# ─── Terraform ───
.terraform/
*.tfstate
*.tfstate.*
*.tfvars
!terraform.tfvars.example
.terraform.lock.hcl

# ─── Database ───
*.sqlite
*.sqlite3
*.db

# ─── Secrets & Certs ───
*.pem
*.key
*.crt
*.p12
*.pfx
!nginx/ssl/.gitkeep

# ─── Misc ───
.cache/
.tmp/
*.bak
*.orig
.turbo/
`;

// ─── .gitattributes ───
const gitattributes = `
# ─── Auto detect text files and normalize line endings ───
* text=auto eol=lf

# ─── Source code ───
*.ts     text diff=typescript
*.tsx    text diff=typescript
*.js     text diff=javascript
*.jsx    text diff=javascript
*.mjs    text diff=javascript
*.cjs    text diff=javascript
*.json   text diff=json
*.css    text diff=css
*.scss   text diff=css
*.html   text diff=html
*.xml    text diff=xml
*.svg    text diff=xml
*.sql    text
*.graphql text

# ─── Config ───
*.yml    text diff=yaml
*.yaml   text diff=yaml
*.toml   text
*.ini    text
*.cfg    text
*.conf   text
*.env    text

# ─── Documentation ───
*.md     text diff=markdown
*.txt    text
LICENSE  text

# ─── Docker ───
Dockerfile text
*.dockerignore text

# ─── Shell ───
*.sh     text eol=lf diff=bash
*.bash   text eol=lf diff=bash

# ─── Windows ───
*.bat    text eol=crlf
*.cmd    text eol=crlf
*.ps1    text eol=crlf

# ─── Binary (no diff, no merge) ───
*.png    binary
*.jpg    binary
*.jpeg   binary
*.gif    binary
*.ico    binary
*.webp   binary
*.avif   binary
*.mp4    binary
*.webm   binary
*.woff   binary
*.woff2  binary
*.ttf    binary
*.eot    binary
*.otf    binary
*.zip    binary
*.tar.gz binary
*.pdf    binary

# ─── Lock files (no diff in PR) ───
package-lock.json linguist-generated=true
yarn.lock         linguist-generated=true
pnpm-lock.yaml    linguist-generated=true

# ─── Generated ───
dist/**           linguist-generated=true
coverage/**       linguist-generated=true
`;

// ─── GitHub Issue Template: Bug Report ───
const bugTemplate = `
name: Bug Report
description: Report a bug to help us improve
title: "[Bug]: "
labels: ["bug", "triage"]
assignees: []

body:
  - type: markdown
    attributes:
      value: |
        Thanks for reporting this bug! Please fill in the details below.

  - type: textarea
    id: description
    attributes:
      label: Describe the bug
      description: A clear and concise description of the bug
      placeholder: What happened?
    validations:
      required: true

  - type: textarea
    id: steps
    attributes:
      label: Steps to reproduce
      description: How to reproduce the bug
      placeholder: |
        1. Go to '...'
        2. Click on '...'
        3. See error
    validations:
      required: true

  - type: textarea
    id: expected
    attributes:
      label: Expected behavior
      description: What you expected to happen
    validations:
      required: true

  - type: textarea
    id: actual
    attributes:
      label: Actual behavior
      description: What actually happened
    validations:
      required: true

  - type: textarea
    id: logs
    attributes:
      label: Relevant logs / screenshots
      description: Paste any relevant logs or screenshots

  - type: dropdown
    id: severity
    attributes:
      label: Severity
      options:
        - Low (cosmetic issue)
        - Medium (feature partially broken)
        - High (feature completely broken)
        - Critical (system down / data loss)
    validations:
      required: true

  - type: input
    id: environment
    attributes:
      label: Environment
      description: e.g. Node 20, Ubuntu 22.04, Chrome 120
      placeholder: Node 20.x, npm 10.x

  - type: input
    id: version
    attributes:
      label: Version
      placeholder: v1.0.0

  - type: checkboxes
    id: checklist
    attributes:
      label: Checklist
      options:
        - label: I have searched for existing issues
          required: true
        - label: I can reproduce this bug consistently
`;

// ─── GitHub Issue Template: Feature Request ───
const featureTemplate = `
name: Feature Request
description: Suggest a new feature or improvement
title: "[Feature]: "
labels: ["enhancement"]
assignees: []

body:
  - type: textarea
    id: problem
    attributes:
      label: Problem statement
      description: What problem does this feature solve?
      placeholder: I'm frustrated when...
    validations:
      required: true

  - type: textarea
    id: solution
    attributes:
      label: Proposed solution
      description: How should this feature work?
    validations:
      required: true

  - type: textarea
    id: alternatives
    attributes:
      label: Alternatives considered
      description: Any other approaches you've considered?

  - type: textarea
    id: context
    attributes:
      label: Additional context
      description: Screenshots, mockups, related issues, etc.

  - type: dropdown
    id: priority
    attributes:
      label: Priority
      options:
        - Nice to have
        - Should have
        - Must have
    validations:
      required: true

  - type: checkboxes
    id: checklist
    attributes:
      label: Checklist
      options:
        - label: I have searched for existing feature requests
          required: true
`;

// ─── GitHub Issue Template Config ───
const issueConfig = `
blank_issues_enabled: true
contact_links:
  - name: Documentation
    url: https://docs.example.com
    about: Check out the docs before opening an issue
  - name: Discussions
    url: https://github.com/your-org/your-app/discussions
    about: Ask questions and share ideas
`;

// ─── GitHub PR Template ───
const prTemplate = `
## Summary
<!-- Brief description of changes -->


## Type of change
- [ ] Bug fix (non-breaking change which fixes an issue)
- [ ] New feature (non-breaking change which adds functionality)
- [ ] Breaking change (fix or feature that would cause existing functionality to not work as expected)
- [ ] Refactoring (no functional changes)
- [ ] Documentation update
- [ ] CI/CD or infrastructure change
- [ ] Dependencies update

## Related issues
<!-- Link to related issues: Fixes #123, Closes #456 -->


## Changes made
<!-- Bullet list of changes -->
-
-
-

## Screenshots / Recordings
<!-- If applicable, add screenshots or screen recordings -->


## Testing
- [ ] Unit tests added/updated
- [ ] Integration tests added/updated
- [ ] E2E tests added/updated (if applicable)
- [ ] Manual testing done

## Checklist
- [ ] My code follows the code style of this project
- [ ] I have performed a self-review of my code
- [ ] I have commented my code in hard-to-understand areas
- [ ] My changes generate no new warnings
- [ ] New and existing tests pass locally
- [ ] I have updated the documentation (if applicable)
- [ ] I have added relevant labels to this PR

## Deployment notes
<!-- Any special deployment steps, migrations, env vars needed? -->

`;

// ─── CODEOWNERS ───
const codeowners = `
# ─── Default owners for the whole repo ───
* @your-org/engineering

# ─── Specific area owners ───
/src/           @your-org/backend-team
/src/api/       @your-org/api-team
/src/auth/      @your-org/security-team

# ─── Infrastructure ───
/terraform/     @your-org/devops-team
/k8s/           @your-org/devops-team
/helm/          @your-org/devops-team
/nginx/         @your-org/devops-team
Dockerfile*     @your-org/devops-team
docker-compose* @your-org/devops-team
Jenkinsfile     @your-org/devops-team

# ─── CI/CD ───
/.github/       @your-org/devops-team
.gitlab-ci.yml  @your-org/devops-team

# ─── Config ───
package.json    @your-org/engineering
tsconfig*.json  @your-org/engineering

# ─── Docs ───
*.md            @your-org/engineering
/docs/          @your-org/docs-team
`;

// ─── CONTRIBUTING.md ───
const contributing = `
# Contributing

Thank you for your interest in contributing!

## Getting Started

1. Fork the repository
2. Clone your fork: \`git clone https://github.com/your-username/your-app.git\`
3. Install dependencies: \`npm ci\`
4. Create a branch: \`git checkout -b feat/my-feature\`

## Development

\`\`\`bash
npm run dev          # Start dev server
npm test             # Run tests
npm run lint         # Run linter
npm run typecheck    # Type check
\`\`\`

## Commit Convention

We use [Conventional Commits](https://www.conventionalcommits.org/):

\`\`\`
<type>(<scope>): <subject>

feat(api): add user registration endpoint
fix(auth): resolve token expiration issue
docs: update API documentation
\`\`\`

**Types**: feat, fix, docs, style, refactor, perf, test, build, ci, chore, revert

## Pull Request Process

1. Ensure all tests pass
2. Update documentation if needed
3. Fill in the PR template
4. Request review from code owners
5. Squash merge after approval

## Code Style

- Follow the ESLint and Prettier configs
- Write meaningful commit messages
- Add tests for new features
- Keep PRs focused and small

## Reporting Bugs

Use the [Bug Report](../../issues/new?template=bug-report.yml) template.

## Requesting Features

Use the [Feature Request](../../issues/new?template=feature-request.yml) template.
`;

// ─── Write files ───
const dirs = [
  ".github/ISSUE_TEMPLATE",
];

for (const d of dirs) {
  if (!existsSync(d)) mkdirSync(d, { recursive: true });
}

const files = [
  { name: ".gitignore", content: gitignore },
  { name: ".gitattributes", content: gitattributes },
  { name: ".github/ISSUE_TEMPLATE/bug-report.yml", content: bugTemplate },
  { name: ".github/ISSUE_TEMPLATE/feature-request.yml", content: featureTemplate },
  { name: ".github/ISSUE_TEMPLATE/config.yml", content: issueConfig },
  { name: ".github/PULL_REQUEST_TEMPLATE.md", content: prTemplate },
  { name: ".github/CODEOWNERS", content: codeowners },
  { name: "CONTRIBUTING.md", content: contributing },
];

for (const file of files) {
  if (!existsSync(file.name)) {
    writeFileSync(file.name, file.content.trim());
    console.log(`✅ ${file.name} created`);
  } else {
    console.log(`⚠️ ${file.name} already exists`);
  }
}

console.log(`
🚀 Git config setup done!

Files:
  .gitignore                               → Comprehensive Node.js ignore (deps, build, env, IDE, OS, TF, secrets)
  .gitattributes                           → Line endings, diff drivers, binary detection, linguist
  .github/ISSUE_TEMPLATE/bug-report.yml    → Bug report form (severity, steps, env)
  .github/ISSUE_TEMPLATE/feature-request.yml → Feature request form (priority)
  .github/ISSUE_TEMPLATE/config.yml        → Issue template config + contact links
  .github/PULL_REQUEST_TEMPLATE.md         → PR checklist (type, testing, deployment notes)
  .github/CODEOWNERS                       → Code ownership per directory
  CONTRIBUTING.md                          → Contributing guide
`);
