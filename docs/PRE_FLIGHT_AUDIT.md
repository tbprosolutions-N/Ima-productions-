# NPC Pre-Flight Audit Report

**Date:** 2026-02-16  
**Scope:** Load & Data Resilience, UI/UX Polishing, Responsive & Viewport Consistency

---

## 1. Load & Data Resilience (Performance)

### ✅ What’s in good shape

- **React Query:** Global defaults in `App.tsx`: `staleTime: 2 * 60 * 1000`, `gcTime: 10 * 60 * 1000`, `refetchOnWindowFocus: false`. Hooks in `useSupabaseQuery.ts` use `STALE_TIME` (2 min) and `gcTime` (10 min) for events, artists, clients — avoids refetch on every navigation.
- **Events table:** TanStack Table with `getPaginationRowModel()` — only one page of rows is rendered (default 10). Good for DOM size with large lists.
- **List keys:** Most lists use stable IDs: `key={client.id}`, `key={artist.id}`, `key={row.id}`, `key={e.id}`, `key={item.to}` (Sidebar), etc.

### ⚠️ UI debt & bottlenecks

| Issue | Location | Recommendation |
|-------|----------|----------------|
| **No server-side pagination** | Events (and effectively artists/clients) | With 2,000+ events, `fetchEvents()` and Supabase `.select('*')` load all rows into memory. Add `.range(from, to)` (or cursor) and only fetch the current page (e.g. 50–100 per page). Same idea for artists/clients if they grow large. |
| **Events not using React Query** | `EventsPage.tsx` | Events are fetched with local `useState` + `fetchEvents()`, not `useEventsQuery`. That bypasses the shared cache and can cause duplicate requests when switching tabs. Prefer `useEventsQuery(currentAgency?.id)` and use its `data` + `isLoading` for consistency with Artists/Clients. |
| **Index as key** | `FinancePage.tsx` ~1422: `reportRows.slice(0, 200).map((r, idx) => <tr key={idx}>` | If report rows had a stable id (e.g. event id + type), use it. For a read-only report table, `key={idx}` is acceptable but document that rows are order-stable. |
| **Index as key** | `SettingsPage.tsx` ~1297: FAQ `key={i}` | FAQ items are static; consider `key={item.q}` or a dedicated id for clarity and to avoid React warnings if the list is ever reordered. |
| **Index as key** | `QATestPage.tsx` ~482: `key={idx}` | Prefer a stable id from the result object if available. |

**Summary (Performance):** Cache settings are good. Main risk is loading 2,000+ events (and long notes) in one request without pagination. Events table already limits rendered rows via pagination; the bottleneck is the initial fetch and memory. Add server-side (or at least chunked) loading for Events when approaching large datasets.

---

## 2. UI/UX Polishing (The “Boutique” Look)

### ✅ Empty states

- **Finance:** “אין נתונים להצגה” + “לחץ על הוסף או העלה קבצים כדי להתחיל” with icon and clear CTA.
- **Artists:** “אין נתונים להצגה” / “לא נמצאו תוצאות” (when search) + “לחץ על הוסף אמן כדי להתחיל” + “הוסף אמן ראשון” button.
- **Clients:** “אין נתונים להצגה” + “לחץ על הוסף לקוח כדי להתחיל” + “הוסף לקוח ראשון” button.
- **Events:** “מוכנים להפיק את האירוע הראשון?” + “אין נתונים להצגה. לחץ על צור אירוע כדי להתחיל” + “צור אירוע ראשון”.
- **Calendar, Documents, Sync Monitor, Dashboard:** Empty states with short message and/or loading handled.

Empty states are present and user-friendly in Hebrew.

### ⚠️ Loading / disabled states (primary actions)

| Issue | Location | Recommendation |
|-------|----------|----------------|
| **Event form submit** | `EventsPage.tsx` ~1416–1418: `<Button type="submit">` | No `disabled` or loading state. User can click “הוסף” / “עדכן” multiple times. | Add `saving` state and `disabled={saving}` on submit; show “שומר...” or spinner while `handleSubmit` is in progress. |
| **Client form submit** | `ClientsPage.tsx` ~761: Submit button | No saving/disabled state. | Add `saving` state and disable submit (and optionally show “שומר...”) during `handleSubmit`. |
| **Artist form submit** | `ArtistsPage.tsx` ~443: Submit button | No saving/disabled state. | Same as Clients: add `saving` and disable + feedback during submit. |
| **Bulk delete (events)** | `EventsPage.tsx` ~1089: “מחק נבחרים” | Only `disabled={!isOwner}`. No loading during `bulkDelete`. | Add `bulkDeleting` state; set true at start of `bulkDelete`, false in finally; `disabled={!isOwner \|\| bulkDeleting}` and show “מוחק...” or spinner. |
| **Delete client/artist** | `ClientsPage.tsx` / `ArtistsPage.tsx` | Delete runs on button click (with confirm). No inline loading on the row. | Optional: disable the delete button (or show spinner) for that row while the delete request is in flight to avoid double clicks. |

**Good examples:** Dashboard quick event has `disabled={saving}` and “יוצר...”. Settings backup has `sheetsSyncing` and spinner. Settings delete user has `deleteUserLoading` and “מסיר...”. Login and SetupWizard disable submit and show spinner.

### ✅ Input validation (forms)

- **Events:** `event_date`, `client_business_name` (and others) use HTML5 `required`. No explicit empty-event guard before submit; browser validation blocks empty required fields.
- **Dashboard quick event:** `if (!form.business_name.trim()) return` — prevents empty submit (no Hebrew toast; could add “נא למלא שם עסק”).
- **Clients:** Form has `required` on name (and email in markup). No email format validation.
- **Artists:** Name is `required`. No email format validation.
- **Settings add user:** `if (!newUser.full_name.trim() \|\| !newUser.email.trim())` + toast.

**Recommendation:** Add optional client-side email format check (e.g. simple regex or type="email") on Client/Artist forms and show a short Hebrew message (e.g. “נא להזין כתובת אימייל תקינה”) on blur or submit. Keep server-side validation as source of truth.

---

## 3. Responsive & Viewport Consistency

### ✅ MainLayout & mobile

- **Hamburger:** Visible on `md:hidden`, fixed header with `h-14 min-h-[44px]`, button `h-11 w-11 min-h-[44px] min-w-[44px]` — meets 44×44px.
- **Logo:** Text “NPC” in header with `text-lg font-bold`, `truncate`; no image in header so scaling is consistent. Sidebar logo is in a separate component (56×56) and used in drawer.
- **Overflow:** Root layout has `overflow-x-hidden`; main content has `overflow-x-hidden overflow-y-auto` and `min-w-0 max-w-[100vw]` to avoid horizontal “ghost” scroll on mobile.

### ✅ Touch targets

- **Button (ui):** Default and icon sizes use `min-h-[44px] min-w-[44px]` and `--modu-control-height-lg: 44px`.
- **MainLayout:** Hamburger and install banner buttons explicitly 44×44.
- **Sidebar:** Nav links use `min-h-[44px]` and `py-3` for tap area.
- **EventsPage:** Action buttons (edit, delete, etc.) use `min-h-[44px] min-w-[44px]` where checked.

### ⚠️ Gaps to fix

| Issue | Location | Recommendation |
|-------|----------|----------------|
| **Sidebar theme / logout** | `Sidebar.tsx` ~209–228: `<Button variant="ghost">` | No explicit `min-h-[44px]`. Button default size is `h-[var(--modu-control-height-lg)]` (44px) and `min-w-[44px]`, so height is already 44px. For consistency and future-proofing, add `min-h-[44px]` to these two buttons. |
| **Artists list actions** | `ArtistsPage.tsx` ~244–261: Edit/Delete `size="sm"` with `h-8 px-2` | Height 32px &lt; 44px. On mobile, small tap targets. | Use a wrapper with `min-h-[44px] min-w-[44px]` and center the icon, or use `Button` with `size="icon"` so it gets 44×44. |
| **Clients table/grid actions** | `ClientsPage.tsx`: FolderOpen, FileDown, Edit, Trash2 as `size="sm"` | Same as Artists: ensure tap area is at least 44×44 (e.g. icon button size or padding). |
| **Finance expense list** | `FinancePage.tsx`: Pencil, צפה, הורד, מחק buttons | Some are `size="sm"`. Prefer 44×44 for primary actions on touch devices. |

### ✅ Overflow

- **Events table:** `overflow-x-auto table-scroll-wrap` + `min-w-[800px]` — horizontal scroll is intentional on small viewports; no layout breach.
- **Finance report table:** `overflow-x-auto` + `min-w-[700px]` — same.
- **General:** `min-w-0` and `max-w-[100vw]` used in main content; no evidence of full-page horizontal scroll from normal content.

**Summary (Responsive):** Hamburger and main CTA buttons are 44×44. Sidebar nav is 44px height. Small action buttons (Artists/Clients/Finance list rows) are the main place to enforce 44×44 for “every icon and button” on mobile.

---

## Summary: UI Debt & Performance Bottlenecks

### High priority

1. **Events form double-submit:** Add `saving` state and disable submit + show “שומר...” on Events add/edit dialog.
2. **Clients/Artists form double-submit:** Add `saving` and disable submit (and optional “שומר...”) on both forms.
3. **Events data loading at scale:** Plan server-side (or chunked) pagination for Events when approaching 2,000+ rows; keep TanStack Table pagination for rendering.

### Medium priority

4. **Bulk delete (events):** Disable “מחק נבחרים” and show loading while `bulkDelete` runs.
5. **Events data source:** Switch Events to `useEventsQuery` so they use the same cache as Artists/Clients and avoid duplicate fetches.
6. **Touch targets:** Ensure all list-row actions (Artists, Clients, Finance) use at least 44×44px (e.g. icon button size or padded wrapper).

### Low priority

7. **Stable keys:** Replace `key={idx}` / `key={i}` with stable ids where possible (Finance report rows, Settings FAQ, QATestPage).
8. **Email validation:** Optional client-side email format + Hebrew error message on Client/Artist forms.
9. **Sidebar theme/logout:** Add explicit `min-h-[44px]` to theme and logout buttons for consistency.

---

## Checklist (quick reference)

| Dimension | Item | Status |
|-----------|------|--------|
| Performance | Pagination/virtualization for long lists | ✅ Events: client-side pagination (table). ❌ No server-side limit on fetch. |
| Performance | React Query staleTime/cacheTime | ✅ 2 min / 10 min, refetchOnWindowFocus false. |
| Performance | Unique keys on .map() | ✅ Most use id. ⚠️ A few use index (Finance report, FAQ, QA). |
| UI | Empty states (Finance, Artists, Clients) | ✅ All have message + CTA. |
| UI | Loading/disabled on Save, Delete, Sync | ⚠️ Events/Clients/Artists submit and Events bulk delete lack loading state. |
| UI | Input validation & Hebrew errors | ✅ required used; optional email format + message. |
| Responsive | Hamburger & logo | ✅ Accessible; logo scales (text). |
| Responsive | 44×44 touch targets | ✅ Main buttons. ⚠️ List row actions (Artists/Clients/Finance) sometimes &lt; 44px. |
| Responsive | No horizontal overflow | ✅ Layout uses overflow-x-hidden and min-w-0. |
