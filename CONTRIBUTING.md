# Contributing to Origami AI

We welcome contributions from the community! Whether you're fixing bugs, adding features, improving documentation, or helping with testing, your help makes Origami AI better.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Making Changes](#making-changes)
- [Pull Request Process](#pull-request-process)
- [Coding Standards](#coding-standards)
- [Commit Guidelines](#commit-guidelines)
- [Testing](#testing)
- [Documentation](#documentation)
- [Reporting Issues](#reporting-issues)

## Code of Conduct

By participating in this project, you agree to:
- Be respectful and inclusive of all contributors
- Focus on constructive feedback
- Report any Code of Conduct violations to the maintainers

## Getting Started

### Prerequisites

- Node.js >= 20.19.0
- Git
- WebGPU-capable browser (for testing features)
- Basic familiarity with React, TypeScript, and Express

### Fork & Clone

1. Fork the repository on GitHub
2. Clone your fork locally:
   ```bash
   git clone https://github.com/YOUR-USERNAME/Origami-AI.git
   cd Origami-AI
   ```
3. Add upstream remote:
   ```bash
   git remote add upstream https://github.com/IslandApps/Origami-AI.git
   ```

### Keep Your Fork Updated

```bash
# Fetch upstream changes
git fetch upstream

# Rebase your branch on upstream/main
git rebase upstream/main

# Or merge if you prefer
git merge upstream/main
```

## Development Setup

### Installation

```bash
npm install
```

### Starting Development Server

```bash
npm run dev
```

Navigate to http://localhost:3000

### Building for Production

```bash
npm run build
```

### Preview Production Build

```bash
npm run preview
```

Then visit http://localhost:4173

### Code Quality

```bash
npm run lint
```

## Making Changes

### Create a Feature Branch

```bash
git checkout -b feature/your-feature-name
```

Or for bug fixes:
```bash
git checkout -b fix/bug-description
```

### Branch Naming Convention

- **Features:** `feature/feature-name`
- **Bug fixes:** `fix/bug-description`
- **Documentation:** `docs/documentation-update`
- **Performance:** `perf/optimization-description`
- **Refactoring:** `refactor/refactoring-description`

### What to Work On

**Good Issues for Contributors:**
- Issues labeled `good first issue`
- Issues labeled `help wanted`
- Documentation improvements
- Test coverage improvements
- Performance optimizations
- Bug fixes

**Before starting**, check if:
1. Issue is already assigned to someone
2. There's active discussion about the approach
3. Your change aligns with project goals

Consider opening an issue or discussion first for large changes.

## Pull Request Process

### Before Submitting

1. **Sync with upstream:**
   ```bash
   git fetch upstream
   git rebase upstream/main
   ```

2. **Run all checks:**
   ```bash
   npm run lint
   npm run build
   npm run preview
   ```

3. **Test your changes** thoroughly in dev and production builds

4. **Commit your changes** (see Commit Guidelines below)

### Submitting a PR

1. Push your branch to your fork
2. Open a Pull Request on GitHub
3. Fill out the PR template completely
4. Link related issues: `Fixes #123`
5. Describe what changed and why

### PR Title Format

- `feat: add new feature` - New feature
- `fix: resolve bug description` - Bug fix
- `docs: update documentation` - Documentation update
- `refactor: improve code` - Code refactoring
- `perf: optimize performance` - Performance improvement
- `test: add test coverage` - Test additions
- `chore: update dependencies` - Maintenance

### PR Description

Include:
- What problem does this solve?
- How does it solve it?
- Any breaking changes?
- Testing performed
- Screenshots/videos if applicable

### Review Process

- At least one maintainer review required
- Address all feedback before merge
- Keep commits clean and squash if needed
- Rebase and force-push if requested

## Coding Standards

### TypeScript

- Use strict mode (`strict: true` in tsconfig)
- Provide explicit type annotations for function parameters and returns
- Avoid `any` type - use `unknown` with type guards instead
- Use interfaces for object shapes

Example:
```typescript
interface SlideData {
  id: string;
  title: string;
  content: string;
}

function processSlide(slide: SlideData): Promise<string> {
  // Implementation
}
```

### React Components

- Use functional components with hooks
- Use TypeScript for prop types
- Keep components focused and single-responsibility
- Use meaningful names

Example:
```typescript
interface SlideEditorProps {
  slides: SlideData[];
  onSlidesChange: (slides: SlideData[]) => void;
}

export function SlideEditor({ slides, onSlidesChange }: SlideEditorProps) {
  // Implementation
}
```

### Naming Conventions

- **Components:** PascalCase (`SlideEditor`, `VideoRenderer`)
- **Files:** snake_case or kebab-case (`slide-editor.ts`, `video_renderer.ts`)
- **Variables/Functions:** camelCase (`generateScript`, `videoRenderer`)
- **Constants:** UPPER_SNAKE_CASE (`MAX_FILE_SIZE`, `DEFAULT_MODEL`)
- **Private methods:** prefix with `_` (`_processVideo()`)

### Code Style

- 2-space indentation
- Semicolons required
- Use `const`/`let`, avoid `var`
- Add meaningful comments for complex logic
- Keep functions small and focused

### Imports

- Group imports: external → internal → types
- Use relative paths within `src/`
- Sort imports alphabetically

```typescript
import React, { useState } from 'react';
import { useSomething } from '@mlc-ai/web-llm';

import { SlideEditor } from './components/SlideEditor';
import { loadSlides } from './services/storage';
import type { SlideData } from './types/slide';
```

## Commit Guidelines

### Commit Messages

Use clear, descriptive commit messages following conventional commits:

```
type(scope): subject

body (optional)

footer (optional)
```

### Examples

```
feat(video): add scene analysis capability

Add ability to upload MP4 videos and auto-generate timestamped scene 
breakdowns using Gemini API. Includes Scene Alignment Editor for 
timeline-locked editing.

Fixes #456
```

```
fix(tts): prevent audio clipping with high volume

Audio normalization now properly handles volume levels above 1.0 
to prevent distortion during export.

Fixes #123
```

```
docs: update README with troubleshooting guide

Add comprehensive troubleshooting section to main README for common 
WebGPU and performance issues.
```

### Commit Best Practices

- Commit related changes together
- Write descriptive messages (avoid "fix stuff")
- Use imperative mood ("add feature" not "added feature")
- Keep commits atomic and logical
- Rebase and squash if needed before PR merge

## Testing

### Manual Testing Checklist

Before submitting a PR, test:

1. **Development Build**
   ```bash
   npm run dev
   ```
   - Feature works as expected
   - No console errors
   - Performance is acceptable

2. **Production Build**
   ```bash
   npm run build
   npm run preview
   ```
   - Feature still works in optimized build
   - No build errors or warnings

3. **Different Browsers**
   - Chrome/Edge (primary)
   - Firefox Nightly (if testing WebGPU features)
   - Safari (if testing screen recording)

4. **Different Scenarios**
   - Small PDFs (< 5 slides)
   - Large PDFs (> 20 slides)
   - Screen recording with/without extension
   - Local AI inference and remote API
   - Different model sizes

### Performance Testing

For changes affecting performance:
- Profile rendering times
- Check memory usage in DevTools
- Monitor GPU usage
- Test with large projects

### Browser Compatibility

Verify no console errors in:
- Chrome DevTools Console
- Firefox Developer Tools
- Safari Web Inspector

## Documentation

### README Updates

Update [README.md](README.md) when:
- Adding new features
- Changing installation steps
- Updating requirements
- Adding configuration options

### Code Comments

Add comments for:
- Complex algorithms or logic
- Non-obvious implementation choices
- Workarounds or hacks
- Performance-critical sections

```typescript
// Auto-zoom is disabled during recordings to prevent motion sickness
const autoZoomEnabled = !isRecording;

// WebGPU memory buffer patch is intentionally disabled due to 60+ second
// slowdowns in WebLLM. See CLAUDE.md for details.
```

### Changelog

For significant changes, consider updating a CHANGELOG (if one exists):
- New features
- Bug fixes
- Breaking changes
- Deprecations

## Reporting Issues

### Before Opening an Issue

1. Check if issue already exists
2. Search closed issues for similar problems
3. Check [TROUBLESHOOTING.md](TROUBLESHOOTING.md)
4. Try in incognito/private mode
5. Clear browser cache and try again

### Issue Template

**Title:** Brief, descriptive title

**Description:**
- What should happen?
- What actually happens?
- Steps to reproduce:
  1.
  2.
  3.

**Environment:**
- Browser: (Chrome 120, Firefox Nightly, etc.)
- OS: (Windows 11, macOS Sonoma, Ubuntu 22.04)
- Node version: (output of `node -v`)

**Additional Info:**
- Console errors (F12 → Console tab)
- Screenshots or screen recordings
- Relevant configuration

### Issue Labels

Help categorize your issue:
- `bug` - Something isn't working
- `feature-request` - New feature idea
- `documentation` - Documentation improvement
- `performance` - Performance concern
- `question` - Usage question
- `help-wanted` - External help needed

## Performance Considerations

### Memory Usage

- Large models (Llama 3.2 3B) use 2.5GB+ VRAM
- Smaller models (Gemma 2 2B) use ~2GB VRAM
- Test with realistic project sizes
- Profile with DevTools Performance tab

### Rendering Performance

- FFmpeg.wasm rendering is CPU and GPU intensive
- Test video output quality and speed
- Consider memory/speed tradeoffs
- Document any performance impacts

### File Size

- Watch bundle size in Vite build output
- Large dependencies should be justified
- Consider code splitting if adding large libraries

## Release Process

(For Maintainers)

1. Create release branch from main
2. Update version numbers
3. Update CHANGELOG
4. Create GitHub release with notes
5. Tag commit with version

## Getting Help

- Check [CLAUDE.md](CLAUDE.md) for architecture details
- Review existing code for patterns
- Ask questions in GitHub Discussions
- Reach out to maintainers for guidance

## Recognition

Contributors are recognized in:
- GitHub commit history
- Release notes for significant contributions
- CONTRIBUTORS.md file (if maintained)

Thank you for contributing to Origami AI! 🎬✨
