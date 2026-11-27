# JustNoted: sidebar and modals redesign (handoff)

Mockups only. Use them for layout, behaviour and hierarchy. Keep JustNoted's existing colours, fonts and components where they already exist.

## In scope
1. The rail's rule: Notes, Notebooks and Shared swap the sidebar only, and the editor stays put. Search is a floating box (Ctrl+K). At the bottom, the bell opens a popover, and Help and Settings open full pages with a Back arrow. Tools and Roadmap move into Help. The rail highlight always matches what's on screen.
2. Sidebar: the count sits in the header ("20", or "3 of 20" while searching). Trash, Export all and Select move into the header's "..." menu, and the footer goes. Keep one sort dropdown plus one Filter button, with no duplicate sort/source controls anywhere. Previews are 13px and meta 12px, at 4.5:1 contrast or better. Previews strip markdown and HTML entities. The selected note always matches the editor.
3. Editor header: breadcrumb (notebook / title), save status, then Wide (aqua when on, in both states), History, Tags, the "..." menu and a Share button.
4. Filter popover: a solid background, anchored to the Filter button, filters only (sorting stays in the sidebar dropdown).
5. Share: a centred dialog on desktop (bottom sheet on phones only). Invite comes first, then the link. No views count until shared. The Scribe upsell is one quiet line.
6. Version history: a right drawer with the list on the left (13-14px dates), a changes/full-text preview, and Restore in the footer.
7. Notifications: a popover from the bell. Opening a shared note switches the rail to Shared and selects the note.
8. Every panel and dialog closes on Esc, on a click outside, and with its X. Esc closes only the topmost one.

## Out of scope
- The formatting toolbar. Leave it exactly as it is; the mockups omit it on purpose. Don't build a floating or smaller one.
- Editor body styles, note content, sync logic.

Files: project/*.dc.html (open in a browser for reference; they're HTML mockups, not code to copy).
