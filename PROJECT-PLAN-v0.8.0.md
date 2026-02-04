# Just Noted - Project Plan v0.8.0

## What is Just Noted?

**Just Noted** is a distraction-free, privacy-first note-taking web application. It's designed for writers, developers, students, and anyone who needs a fast, clean place to capture ideas without the bloat of traditional note apps.

### Core Philosophy

- **Zero-friction writing** - Start writing immediately, no account required
- **Privacy-first** - No tracking, no forced registration, your notes stay yours
- **Hybrid storage** - Local-first for quick notes, cloud sync when you want it
- **Minimalist by design** - Only the features you need, nothing you don't

### Target Users

- Writers working on long-form content who need word goals and statistics
- Developers who want Markdown support and code blocks
- Students taking quick notes between classes
- Anyone tired of overcomplicated note apps

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 15, React 19, TypeScript |
| Styling | Tailwind CSS 4, SASS |
| Editor | TipTap (Markdown-based rich text) |
| State | Zustand |
| Database | PostgreSQL (Supabase) + Redis (Upstash) |
| Auth | Supabase Auth |
| Email | Mailersend |
| Monitoring | LogRocket + Google Analytics |
| Deployment | Vercel |

---

## Versioning System

We follow **Semantic Versioning** with a twist focused on user-facing value:

```
MAJOR . MINOR . FEATURE
  0   .   8   .   0
```

### MAJOR (0.x.x → 1.x.x)
- **1.0.0** = Production-ready, public launch
- Breaking changes that affect user data or workflows
- Major architectural rewrites
- We're currently in **v0.x.x** (pre-release/beta)

### MINOR (x.8.x)
- Significant new capabilities or feature sets
- Examples: Notebooks system, Split View, Table of Contents
- Each minor version represents a milestone

### FEATURE (x.x.0)
- Bug fixes, optimizations, polish
- Small enhancements within existing features
- UI/UX improvements

### Version History

| Version | Milestone |
|---------|-----------|
| v0.1.0 | Core note-taking with local Redis storage |
| v0.2.0 | Cloud sync with Supabase for authenticated users |
| v0.3.0 | Note sharing with public links |
| v0.4.0 | Backup system with IndexedDB |
| v0.5.0 | Writing statistics (word count, goals, reading time) |
| v0.6.0 | Notebooks system with organization |
| v0.7.0 | Table of Contents + Split View |
| **v0.8.0** | **UI/UX Modernization + Security Hardening** |
| v0.9.0 | Performance optimization + Final polish |
| v1.0.0 | Public launch |

---

## Features Completed (v0.1.0 - v0.7.0)

### Core Note-Taking
- [x] Create, edit, delete unlimited notes
- [x] Auto-save on every keystroke (debounced)
- [x] Rich text editing with Markdown support
- [x] Headings (H1-H6), lists, task lists, quotes, code blocks
- [x] Text formatting (bold, italic, underline, strikethrough, highlight)
- [x] Links and image insertion
- [x] Text alignment options

### Hybrid Storage
- [x] Redis-backed local storage for anonymous users
- [x] Supabase PostgreSQL for authenticated users
- [x] Seamless transfer between local and cloud
- [x] Offline capability with sync on reconnect

### Notebooks
- [x] Create and organize notes into notebooks
- [x] Customizable covers (colors, gradients, photos)
- [x] Photo upload for custom covers
- [x] Predefined photo templates
- [x] Drag-to-reorder notebooks
- [x] "Loose notes" for uncategorized items

### Note Management
- [x] Pin/unpin important notes
- [x] Mark notes as private
- [x] Collapse long notes in list view
- [x] Full-text search across title + content
- [x] Filter by source, pinned status, notebook
- [x] Delete with 5-second undo window
- [x] Multi-select bulk actions

### Writing Features
- [x] Word count goals (words or characters)
- [x] Real-time statistics panel
- [x] Page format estimates (Novel, A4, A5)
- [x] Reading time estimate
- [x] Keyboard shortcuts
- [x] Distraction-free full-screen mode
- [x] Full-width toggle

### Table of Contents (v0.7.0)
- [x] Auto-generated from heading structure
- [x] Click headings to jump to sections
- [x] Hierarchical display with indentation
- [x] Current position indicator
- [x] Collapsible sections

### Split View (v0.7.0)
- [x] Two-pane layout (main + reference)
- [x] Horizontal or vertical layout
- [x] Adjustable pane sizes
- [x] Toggle reference note editability

### Sharing
- [x] Generate public share links
- [x] Share with specific users
- [x] View analytics (total views, per-user tracking)
- [x] Share link expiration

### Backup & Recovery
- [x] IndexedDB local backups
- [x] Automatic backup on create/update/delete
- [x] Version history access
- [x] Restore previous versions
- [x] Export backup data

### User Features
- [x] Email/password authentication
- [x] User profiles
- [x] Contact form
- [x] Privacy policy page

### Statistics Sidebar (Recently Updated)
- [x] Modern, clean card-based layout
- [x] Notebook name display
- [x] Table of Contents integration
- [x] Word/character counts
- [x] Page size estimates
- [x] Word goal progress

---

## v0.8.0 Roadmap - To-Do List

### Item #1: Code Optimization Audit

**Goal**: Audit the entire codebase for performance improvements

- [ ] **Large File Analysis**
  - [ ] `notes-store.ts` (~550 lines) - Split into smaller stores?
  - [ ] `sidebar/index.tsx` (~800 lines) - Extract sub-components
  - [ ] `use-combined-notes.tsx` (~1000 lines) - Refactor and simplify
  - [ ] `share-note-button.tsx` (~400 lines) - Break down

- [ ] **React Performance**
  - [ ] Audit unnecessary re-renders with React DevTools
  - [ ] Add `React.memo()` to expensive components
  - [ ] Optimize `useMemo` and `useCallback` usage
  - [ ] Review Zustand store subscriptions for over-subscribing

- [ ] **Network & Data**
  - [ ] Audit API call frequency and debouncing
  - [ ] Review Redis operation efficiency
  - [ ] Check Supabase query optimization
  - [ ] Lazy load heavy components (editor, modals)

- [ ] **Bundle Size**
  - [ ] Analyze bundle with `next build` output
  - [ ] Check for duplicate dependencies
  - [ ] Tree-shake unused TipTap extensions
  - [ ] Lazy load icons and heavy libraries

- [ ] **Memory Management**
  - [ ] Check for memory leaks in long sessions
  - [ ] Clean up event listeners properly
  - [ ] Review IndexedDB cleanup patterns

---

### Item #2: Security Audit - IN PROGRESS

**Status**: Audit completed 2026-02-04. Fixes in progress.

---

#### CRITICAL ISSUES (Fix Immediately)

| # | Issue | Location | Status |
|---|-------|----------|--------|
| 1 | **Missing auth on AI endpoints** - userId accepted from request body without verification | `/api/ai/analyze-patterns`, `/api/ai/reverse-entries` | [x] FIXED |
| 2 | **Missing auth on user-activity** - Anyone can update activity for any userId | `/api/user-activity/route.ts` | [x] FIXED |
| 3 | **Subscription data leak** - Any user can query any other user's subscription | `/api/subscription/route.ts` | [x] FIXED |
| 4 | **Open redirect vulnerability** - `next` param used directly in redirect | `/auth/confirm/route.ts:22` | [x] FIXED |
| 5 | **XSS via dangerouslySetInnerHTML** - No sanitization library installed | Multiple components | [x] FIXED |

---

#### HIGH SEVERITY ISSUES

| # | Issue | Location | Status |
|---|-------|----------|--------|
| 6 | **Unsafe link URLs** - TipTap accepts `javascript:` protocol in links | `tip-tap-editor.tsx` | [x] FIXED |
| 7 | **No RLS policies** - Authorization only in app code, not database | Supabase tables | [x] FIXED |
| 8 | **Paddle webhook bypass** - Signature verification skipped in non-production | `/api/webhooks/paddle/route.ts:41` | [ ] ACCEPTED RISK |
| 9 | **LogRocket collects PII** - Sends user email, sessions without explicit consent | `logrocket-provider.tsx` | [x] FIXED |
| 10 | **AI sends notes externally** - Full note content sent to Anthropic API | `/api/ai/analyze-patterns` | [x] DOCUMENTED |

---

#### MEDIUM SEVERITY ISSUES

| # | Issue | Location | Status |
|---|-------|----------|--------|
| 11 | **Non-timing-safe API key** - Simple string comparison vulnerable to timing attacks | `/api/admin/cleanup/route.ts:9` | [x] FIXED |
| 12 | **In-memory rate limiting** - Not persistent, bypassed on restart/scaling | AI endpoint routes | [x] FIXED |
| 13 | **Client-side only validation** - Username validation can be bypassed | `profile-block.tsx` | [x] FIXED |
| 14 | **Sensitive data in logs** - User IDs, emails, Paddle IDs logged | Multiple files | [x] FIXED |
| 15 | **Weak shortcode entropy** - Modulo bias in generation, 9 chars may be enumerable | `sharing.ts:49` | [ ] ACCEPTED RISK |
| 16 | **Redis stores unencrypted** - Notes stored as plain JSON | Redis storage | [ ] ACCEPTED RISK |
| 17 | **IndexedDB key in localStorage** - Encryption key stored in plain text | `notes-backup.ts` | [ ] ACCEPTED RISK |

---

#### LOW SEVERITY ISSUES

| # | Issue | Location | Status |
|---|-------|----------|--------|
| 18 | **Error message disclosure** - Detailed Supabase errors returned to client | Multiple endpoints | [x] FIXED |

---

#### Security Fixes Applied

**Date: 2026-02-05**

1. **Authentication added to all API endpoints** - Now verify `supabase.auth.getUser()` before processing
2. **DOMPurify installed and applied** - All `dangerouslySetInnerHTML` uses now sanitized
3. **URL validation added** - TipTap editor and image upload now validate URLs (http/https only)
4. **Open redirect fixed** - Auth confirm validates redirect is relative path without protocol
5. **Timing-safe API key comparison** - Uses `crypto.timingSafeEqual` for admin API keys
6. **Redis-based rate limiting** - Replaced in-memory Map with Upstash Redis for persistence
7. **Server-side validation** - Added comprehensive validators in `src/utils/validation.ts`
8. **Sensitive data removed from logs** - All console.log statements sanitized
9. **Row-Level Security policies** - Created migration in `supabase/migrations/20260205_rls_policies.sql`
10. **Service role client** - Added for webhook handlers to bypass RLS safely
11. **Analytics consent system** - Users must opt-in before LogRocket/GA tracks them

**Consent System Files:**
- `src/hooks/use-analytics-consent.ts` - Hook for managing consent state
- `src/components/ui/consent-banner.tsx` - Banner shown to users without consent
- Updated `src/components/providers/logrocket-provider.tsx` - Only initializes after consent
- Updated `src/app/layout.tsx` - Added consent banner component

**LogRocket Privacy Improvements:**
- Only initializes after explicit user consent
- Text and input sanitization enabled by default
- Network request/response bodies not captured
- Authorization headers not captured
- User email no longer sent (only username)

**RLS Migration File:** `supabase/migrations/20260205_rls_policies.sql`

Tables with RLS policies:
- `authors` - Users can only access their own profile
- `notes` - Users can only access their own notes
- `notebooks` - Users can only access their own notebooks
- `collections` - Users can only access their own collections
- `collections_notes` - Users can only access notes in their collections
- `shared_notes` - Note owners control sharing; public notes readable by all
- `shared_notes_readers` - Note owners manage readers
- `shared_notes_analytics` - Note owners view analytics
- `subscriptions` - Users can only view their own subscription

---

#### Files Requiring Changes

**Critical Priority:**
```
src/app/api/ai/analyze-patterns/route.ts    - Add auth verification
src/app/api/ai/reverse-entries/route.ts     - Add auth verification
src/app/api/user-activity/route.ts          - Add auth verification
src/app/api/subscription/route.ts           - Verify user owns subscription
src/app/auth/confirm/route.ts               - Validate redirect URL
```

**High Priority:**
```
src/components/backup-manager.tsx           - Add DOMPurify
src/components/reference-note-pane.tsx      - Add DOMPurify
src/components/split-view-note-block.tsx    - Add DOMPurify
src/components/ui/version-history.tsx       - Add DOMPurify
src/components/shared-note-page.tsx         - Add DOMPurify
src/components/tip-tap-editor.tsx           - Validate link URLs
src/components/ui/image-upload.tsx          - Validate image URLs
```

**Medium Priority:**
```
src/app/api/admin/cleanup/route.ts          - Use timing-safe comparison
src/app/actions/supabaseActions.ts          - Remove sensitive logs
src/app/api/webhooks/paddle/route.ts        - Remove sensitive logs
src/app/actions/notes.ts                    - Remove sensitive logs
src/app/get-access/actions.ts               - Generic error messages
src/components/profile-block.tsx            - Server-side validation
```

**Database:**
```
supabase/migrations/                        - Add RLS policies for all tables
```

---

#### Recommended Fix Order

1. **Install DOMPurify** - `npm install dompurify @types/dompurify`
2. **Fix API auth** - Add `supabase.auth.getUser()` verification to all endpoints
3. **Fix open redirect** - Validate `next` is relative path
4. **Sanitize all HTML** - Wrap dangerouslySetInnerHTML with DOMPurify
5. **Validate URLs** - Only allow http/https protocols in links/images
6. **Implement RLS** - Database-level authorization
7. **Clean up logs** - Remove sensitive data from console.log
8. **Redis rate limiting** - Replace in-memory Map with Redis

---

### Item #3: UI/UX Modernization

**Goal**: Create a clean, modern, minimalist, and inviting interface

#### Current State Assessment

**What's Working Well:**
- Statistics sidebar (recently updated) - clean, modern cards
- Notebook covers with photos
- Split view layout

**What Needs Improvement:**
- Main note list appearance feels dated
- Note card styling lacks modern polish
- Header/navigation could be cleaner
- Buttons and inputs need consistency
- Color palette needs refinement
- Spacing and typography could be improved
- Mobile experience needs attention

#### Proposed UI Updates

- [ ] **Design System Audit**
  - [ ] Define consistent color palette (light/dark)
  - [ ] Standardize spacing scale
  - [ ] Create typography hierarchy
  - [ ] Define border radius standards
  - [ ] Establish shadow/elevation system

- [ ] **Note Cards Redesign**
  - [ ] Modern card styling with subtle shadows
  - [ ] Better visual hierarchy for title vs content
  - [ ] Cleaner pinned/private indicators
  - [ ] Improved hover states
  - [ ] Better collapsed state design

- [ ] **Sidebar Refresh**
  - [ ] Cleaner filter controls
  - [ ] Better notebook list styling
  - [ ] Modern search input
  - [ ] Improved icons and spacing

- [ ] **Editor Polish**
  - [ ] Cleaner toolbar design
  - [ ] Better focus states
  - [ ] Improved heading styles
  - [ ] Modern placeholder text styling

- [ ] **Header Simplification**
  - [ ] Reduce visual clutter
  - [ ] Better logo/branding placement
  - [ ] Cleaner navigation items
  - [ ] Improved profile menu

- [ ] **Button & Input Standardization**
  - [ ] Consistent button styles (primary, secondary, ghost)
  - [ ] Modern input field design
  - [ ] Better focus indicators
  - [ ] Smooth hover/active transitions

- [ ] **Color & Theme**
  - [ ] Refined light theme colors
  - [ ] Polished dark theme
  - [ ] Better contrast ratios
  - [ ] Subtle accent colors

- [ ] **Animation & Polish**
  - [ ] Smooth page transitions
  - [ ] Subtle hover animations
  - [ ] Loading state improvements
  - [ ] Toast notification styling

- [ ] **Mobile Experience**
  - [ ] Touch-friendly tap targets
  - [ ] Improved responsive breakpoints
  - [ ] Better mobile navigation
  - [ ] Optimized mobile editor

---

## Ideas & Inspiration for UI Modernization

### Modern Design Principles to Apply

1. **Generous Whitespace** - Let elements breathe, avoid cramped layouts
2. **Subtle Depth** - Soft shadows instead of hard borders
3. **Consistent Corners** - Pick one radius (8px?) and use it everywhere
4. **Muted Colors** - Avoid harsh whites and blacks, use subtle grays
5. **Typography Focus** - Let good typography do the heavy lifting
6. **Micro-interactions** - Small animations that feel polished

### Specific UI Suggestions

**Note Cards:**
```
Current: Flat, bordered boxes with harsh lines
Proposed: Soft shadow cards, rounded corners, subtle hover lift
```

**Color Palette Suggestion:**
```
Background: #FAFAFA (light), #0F0F0F (dark)
Card: #FFFFFF (light), #1A1A1A (dark)
Border: #E5E5E5 (light), #2A2A2A (dark)
Primary: #3B82F6 (blue) or #6366F1 (indigo)
Text: #171717 (light), #EDEDED (dark)
Muted: #737373
```

**Inspiration References:**
- Notion's clean card layouts
- Linear's modern interface
- Apple Notes' simplicity
- iA Writer's typography focus
- Craft's visual polish

---

## Priority Order

1. **Security Audit** (Item #2) - Protect users first
2. **UI/UX Modernization** (Item #3) - Visual refresh for impact
3. **Code Optimization** (Item #1) - Polish and performance

---

## Success Criteria for v0.8.0

- [ ] Zero known security vulnerabilities
- [ ] All API routes have proper authorization
- [ ] Consistent, modern UI across all pages
- [ ] Note cards look clean and inviting
- [ ] Mobile experience is polished
- [ ] Bundle size reduced or maintained
- [ ] No significant performance regressions
- [ ] Ready for v0.9.0 final polish phase

---

## Notes

- This document is a living plan and will be updated as we progress
- Each item should be tackled systematically with code review
- UI changes should be tested across devices before finalizing
- Security fixes should be prioritized over visual changes

---

*Last Updated: February 2026*
*Version: 0.8.0 Planning Phase*
