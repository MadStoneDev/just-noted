# Phase 3 & 4: Table of Contents & Split View

## Status

| Phase | Status | Notes |
|-------|--------|-------|
| Phase 3: ToC | COMPLETE | Implemented 2026-02-02 |
| Phase 4: Split View | COMPLETE | Implemented 2026-02-02 |

---

## Phase 3: Table of Contents (ToC) - COMPLETE

### Overview
Add an auto-generated Table of Contents panel that detects headings (H1-H6) in the active note and provides quick navigation. The ToC appears in the right sidebar when a note is open.

### User Requirements
- **Auto-detect headings**: Parse H1-H6 from note content in real-time
- **Click-to-jump**: Clicking a heading scrolls the editor to that position
- **Current position indicator**: Highlight which heading user is currently viewing
- **Collapsible hierarchy**: Indent nested headings, allow collapsing sections
- **Toggle visibility**: Show/hide ToC panel in right sidebar

---

### 3a: Heading Detection

**File:** `src/lib/toc-parser.ts` (new file)

```typescript
export interface TocHeading {
  id: string;           // Unique identifier for scrolling
  text: string;         // Heading text content
  level: 1 | 2 | 3 | 4 | 5 | 6;
  position: number;     // Character offset in content
  element?: HTMLElement; // DOM reference for scroll-to
}

export interface TocTree {
  headings: TocHeading[];
  hasContent: boolean;
}

// Parse HTML content and extract headings
export function parseHeadings(htmlContent: string): TocHeading[];

// Build hierarchical tree from flat heading list
export function buildHeadingTree(headings: TocHeading[]): TocHeading[];

// Generate unique IDs for headings without them
export function ensureHeadingIds(content: string): string;
```

**Implementation Notes:**
- Use DOMParser to safely parse HTML
- Handle edge cases: empty headings, duplicate text, special characters
- Generate stable IDs based on text + position to handle duplicates
- Debounce parsing during typing (300ms)

---

### 3b: ToC Store State

**File:** `src/stores/notes-store.ts` (update)

Add to state:
```typescript
// ToC state
tocVisible: boolean;
tocHeadings: TocHeading[];
activeHeadingId: string | null;

// ToC actions
setTocVisible: (visible: boolean) => void;
setTocHeadings: (headings: TocHeading[]) => void;
setActiveHeadingId: (id: string | null) => void;
toggleToc: () => void;
```

---

### 3c: ToC Panel Component

**File:** `src/components/toc-panel.tsx` (new file)

```
┌─────────────────────────────┐
│ Table of Contents      [×]  │  ← Toggle close
├─────────────────────────────┤
│ ▼ Introduction              │  ← H1, clickable
│   ▼ Getting Started         │  ← H2, indented
│       Setup                  │  ← H3, more indent
│       Configuration          │
│   ▼ Advanced Topics         │
│       Performance            │  ← Currently viewing (highlighted)
│       Security               │
│ ▼ Conclusion                │
└─────────────────────────────┘
```

Features:
- Indentation based on heading level (H1=0, H2=12px, H3=24px, etc.)
- Collapse/expand icons for headings with children
- Smooth scroll animation on click
- Visual indicator for current heading (based on scroll position)
- Empty state when no headings detected
- Sticky header with close button

**Styling:**
- Max height with scroll for long ToC
- Hover states for clickable items
- Active heading highlighted with accent color
- Subtle connecting lines for hierarchy (optional)

---

### 3d: Integration with Editor

**File:** `src/components/note-block/index.tsx` (update)

- Hook into Tiptap editor content changes
- Call `parseHeadings()` on content change (debounced)
- Update store with new headings
- Add scroll event listener to track active heading

**File:** `src/components/note-block/sub-components/note-toolbar.tsx` (update)

- Add ToC toggle button to toolbar (📋 icon)
- Show active state when ToC is visible

---

### 3e: Scroll Synchronization

**File:** `src/hooks/useTocScrollSync.ts` (new file)

```typescript
export function useTocScrollSync(
  headings: TocHeading[],
  editorRef: RefObject<HTMLElement>,
): {
  activeHeadingId: string | null;
  scrollToHeading: (id: string) => void;
}
```

- Use IntersectionObserver to detect which heading is in view
- Update activeHeadingId as user scrolls
- Provide scrollToHeading function for ToC clicks
- Handle edge cases: first/last heading, no headings visible

---

### 3f: Right Sidebar Layout

**File:** `src/components/right-sidebar.tsx` (new file)

Container for ToC and future panels (like AI assistant).

```
┌──────────────────────────────────────────────────────────┐
│  Main Content Area                    │  Right Sidebar   │
│  ┌────────────────────────────────┐   │  ┌────────────┐  │
│  │                                │   │  │ ToC Panel  │  │
│  │       Note Editor              │   │  │            │  │
│  │                                │   │  │            │  │
│  │                                │   │  └────────────┘  │
│  └────────────────────────────────┘   │                  │
└──────────────────────────────────────────────────────────┘
```

- Collapsible/resizable panel
- Remember visibility preference in localStorage
- Animate open/close

---

### Phase 3 Files Summary

**New Files:**
1. `src/lib/toc-parser.ts` - Heading detection utilities
2. `src/hooks/useTocScrollSync.ts` - Scroll synchronization
3. `src/components/toc-panel.tsx` - ToC display component
4. `src/components/right-sidebar.tsx` - Right sidebar container

**Modified Files:**
1. `src/stores/notes-store.ts` - Add ToC state
2. `src/components/note-block/index.tsx` - Parse headings on change
3. `src/components/note-block/sub-components/note-toolbar.tsx` - Add toggle
4. `src/components/note-wrapper.tsx` - Include right sidebar

---

## Phase 4: Split View Mode - COMPLETE

### Overview
Allow users to view two notes side-by-side: one for editing, one for reference. Similar to distraction-free mode, this is a toggle that changes the layout.

### User Requirements
- **Toggle button**: In toolbar, similar to distraction-free mode
- **Split options**: Horizontal (side-by-side) or Vertical (top-bottom)
- **Left pane**: Active note being edited (full editor)
- **Right pane**: Reference note (read-only or editable, user choice)
- **Note picker**: Dropdown to select which note to reference
- **Keyboard shortcut**: Quick toggle (e.g., Ctrl+Shift+S)
- **Remember state**: Persist split view preference and last referenced note

---

### 4a: Split View Store State

**File:** `src/stores/notes-store.ts` (update)

Add to state:
```typescript
// Split view state
splitViewEnabled: boolean;
splitViewDirection: 'horizontal' | 'vertical';
referenceNoteId: string | null;
referenceNoteEditable: boolean;

// Split view actions
setSplitViewEnabled: (enabled: boolean) => void;
toggleSplitView: () => void;
setSplitViewDirection: (direction: 'horizontal' | 'vertical') => void;
setReferenceNoteId: (noteId: string | null) => void;
setReferenceNoteEditable: (editable: boolean) => void;
```

---

### 4b: Split View Layout

**File:** `src/components/split-view-container.tsx` (new file)

```
Horizontal Split (side-by-side):
┌─────────────────────────────────────────────────────────────┐
│  Main Note (Edit)                │  Reference Note          │
│  ┌───────────────────────────┐   │  ┌───────────────────┐   │
│  │ Title                     │   │  │ [Select Note ▼]   │   │
│  │                           │   │  ├───────────────────┤   │
│  │ Content...                │   │  │ Reference content │   │
│  │                           │   │  │                   │   │
│  │                           │ ⋮ │  │                   │   │
│  │                           │   │  │                   │   │
│  └───────────────────────────┘   │  └───────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                                   ↑
                              Drag to resize

Vertical Split (top-bottom):
┌─────────────────────────────────────────────────────────────┐
│  Main Note (Edit)                                           │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ Title                                                 │  │
│  │ Content...                                            │  │
│  └───────────────────────────────────────────────────────┘  │
├─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─┤ ← Drag to resize
│  Reference Note                                             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ [Select Note ▼]                               [Edit?] │  │
│  │ Reference content...                                  │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

Features:
- Resizable divider (drag to resize panes)
- Minimum pane sizes (prevent collapsing too small)
- Remember pane sizes in localStorage
- Smooth animations on toggle

---

### 4c: Reference Note Selector

**File:** `src/components/reference-note-selector.tsx` (new file)

```
┌──────────────────────────────────┐
│ 🔍 Search notes...               │
├──────────────────────────────────┤
│ Recent:                          │
│   📄 Meeting Notes               │
│   📄 Project Ideas               │
├──────────────────────────────────┤
│ Same Notebook:                   │
│   📄 Chapter 1                   │
│   📄 Chapter 2                   │
│   📄 Chapter 3                   │
├──────────────────────────────────┤
│ All Notes:                       │
│   📄 ... (filtered list)         │
└──────────────────────────────────┘
```

Features:
- Search/filter notes
- Group by: Recent, Same Notebook, All Notes
- Show notebook indicator on notes
- Keyboard navigation (arrow keys + enter)

---

### 4d: Reference Note Pane

**File:** `src/components/reference-note-pane.tsx` (new file)

```
┌────────────────────────────────────────────┐
│ [Select Note ▼] Meeting Notes    [🔒][×]   │ ← Header
├────────────────────────────────────────────┤
│                                            │
│  Note content displayed here               │
│  (read-only by default)                    │
│                                            │
│  Can be made editable with toggle          │
│                                            │
└────────────────────────────────────────────┘
```

Features:
- Note selector dropdown in header
- Lock/unlock toggle for edit mode
- Close button to exit split view
- Scrollable content area
- Use same Tiptap editor (read-only mode or editable)

---

### 4e: Toolbar Integration

**File:** `src/components/note-block/sub-components/note-toolbar.tsx` (update)

Add split view controls:
```
[Bold][Italic][...] | [ToC] [Split View ▼] [Distraction-Free]
                              │
                              ▼
                    ┌─────────────────────┐
                    │ ◉ Side by Side      │
                    │ ○ Top & Bottom      │
                    ├─────────────────────┤
                    │ ☐ Editable Reference │
                    └─────────────────────┘
```

---

### 4f: Keyboard Shortcuts

**File:** `src/hooks/useKeyboardShortcuts.ts` (update or new)

```typescript
// Split view shortcuts
'Ctrl+Shift+S' or 'Cmd+Shift+S': Toggle split view
'Ctrl+Shift+H' or 'Cmd+Shift+H': Switch to horizontal split
'Ctrl+Shift+V' or 'Cmd+Shift+V': Switch to vertical split
'Escape' (when in split view): Close split view
```

---

### 4g: Persistence

**File:** `src/lib/split-view-storage.ts` (new file)

```typescript
interface SplitViewPreferences {
  enabled: boolean;
  direction: 'horizontal' | 'vertical';
  paneSizes: [number, number]; // percentages
  lastReferenceNoteId: string | null;
  referenceEditable: boolean;
}

export function saveSplitViewPrefs(prefs: SplitViewPreferences): void;
export function loadSplitViewPrefs(): SplitViewPreferences | null;
```

---

### Phase 4 Files Summary

**New Files:**
1. `src/components/split-view-container.tsx` - Main split view layout
2. `src/components/reference-note-selector.tsx` - Note picker dropdown
3. `src/components/reference-note-pane.tsx` - Reference note display
4. `src/lib/split-view-storage.ts` - Persistence utilities
5. `src/hooks/useKeyboardShortcuts.ts` - Keyboard shortcuts (if not exists)

**Modified Files:**
1. `src/stores/notes-store.ts` - Add split view state
2. `src/components/note-block/sub-components/note-toolbar.tsx` - Add toggle
3. `src/components/note-wrapper.tsx` - Integrate split view container
4. `src/app/globals.css` - Split view styling

---

## Implementation Order

### Phase 3 (ToC):
1. Create `toc-parser.ts` - heading detection
2. Add ToC state to store
3. Create `toc-panel.tsx` component
4. Create `right-sidebar.tsx` container
5. Integrate with editor (parse on change)
6. Add scroll synchronization hook
7. Add toolbar toggle button
8. Polish: animations, empty states, keyboard nav

### Phase 4 (Split View):
1. Add split view state to store
2. Create `split-view-container.tsx` with resizable panes
3. Create `reference-note-selector.tsx` dropdown
4. Create `reference-note-pane.tsx` display
5. Add toolbar controls and dropdown
6. Implement keyboard shortcuts
7. Add persistence (localStorage)
8. Polish: animations, edge cases, mobile handling

---

## Verification Checklist

### Phase 3 (ToC):
- [ ] Headings auto-detected when typing
- [ ] Click heading jumps to correct position
- [ ] Current heading highlighted while scrolling
- [ ] Nested headings properly indented
- [ ] Collapse/expand works for sections
- [ ] ToC toggle button works
- [ ] Empty state shown when no headings
- [ ] Performance good with many headings

### Phase 4 (Split View):
- [ ] Toggle enables/disables split view
- [ ] Horizontal and vertical modes work
- [ ] Reference note selector shows all notes
- [ ] Selected reference note displays correctly
- [ ] Pane resize by dragging works
- [ ] Pane sizes remembered after reload
- [ ] Read-only and editable modes work
- [ ] Keyboard shortcuts work
- [ ] Mobile: gracefully degrade or disable

---

## Future Considerations

- **Phase 3 Enhancement**: AI-powered heading suggestions
- **Phase 3 Enhancement**: Export ToC as standalone document
- **Phase 4 Enhancement**: Multiple reference panes (3+ way split)
- **Phase 4 Enhancement**: Linked scrolling between panes
- **Phase 4 Enhancement**: Drag text from reference to main note
