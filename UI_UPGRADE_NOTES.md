# Property of MODU. Unauthorized copying or distribution is prohibited.

---

# UI Upgrade: Artist-Ops Sidebar Navigation

## What Changed

### 1. Layout Structure

**Before:** Single-column dashboard with top header
**After:** Sidebar navigation + main content area (desktop), collapsible sidebar (mobile)

### 2. Navigation

**New Sidebar:**
- 📊 דאשבורד (Dashboard) - Active by default
- 📅 אירועים (Events)
- 🎤 אמנים (Artists)
- 💰 כספים (Finance)
- ⚙️ הגדרות (Settings)

**Mobile:** 
- Sidebar hidden by default, slides in from right when menu button (☰) is clicked
- FAB button (+) for quick "New Booking" on mobile

### 3. Header Updates

**Desktop:**
- Left: Theme toggle, "הזמנה חדשה" button, "רענן" button
- Right: Menu toggle (mobile only), "אמא הפקות" title, Date display

**Mobile:**
- Simplified: Menu toggle, app title, theme toggle only
- FAB button replaces "הזמנה חדשה" button

### 4. Stats Cards

**New Design:**
- Icon badges on the left (💰, 📊, ⏳, ✓, ⚠️)
- Value + label stacked vertically
- Amber accent background for icons
- Better visual hierarchy

### 5. Branding

- Logo area in sidebar: "אמא הפקות" with 🎵 icon
- Spotlight Amber color palette maintained
- All text and branding uses "Ima Productions"

---

## Preserved Functionality

✅ **Login Overlay** - Google auto-login with `fetchWhoami()`
✅ **Terms Overlay** - Session-based acceptance flow
✅ **Admin RBAC** - Role-based column visibility (Admin vs Staff)
✅ **API Connection** - `window.DASHBOARD_API_URL` unchanged
✅ **CORS Fix** - `Content-Type: text/plain;charset=utf-8` for POST
✅ **Pending Counter** - Shows sheet data + offline queue
✅ **Theme Toggle** - Light/Dark mode switcher
✅ **Booking Modal** - iOS-style bottom sheet on mobile
✅ **Success Toast** - Post-save confirmation

---

## Responsive Breakpoints

| Screen Size | Sidebar Width | Layout |
|-------------|---------------|--------|
| < 768px (Mobile) | Hidden, toggle to open | Full-width main, FAB button |
| 768px - 1024px (Tablet) | 220px fixed | Sidebar + main |
| > 1024px (Desktop) | 260px fixed | Sidebar + main (max-width 1400px) |

---

## File Changes

### index.html
- Added `<div class="app-container">` wrapper
- Added `<nav class="sidebar">` with navigation items
- Restructured header with `.header-content`, `.header-right`, `.header-left`
- Added date display `<p id="dateDisplay">`
- Added FAB button for mobile
- Wrapped main content in `<main class="main-content">` and `<div class="dashboard-content">`
- Updated stats cards to include `.stat-icon` and `.stat-info`

### app.js
- Added `sidebar`, `menuToggle`, `sidebarLogo`, `logoIconFallback`, `dateDisplay`, `fabButton` to `els`
- Added `toggleSidebar()` function
- Added `updateDateTime()` function (runs every 60s)
- Nav item click handlers to toggle active state and close mobile sidebar
- FAB button click handler for mobile

### styles.css
- Added `.app-container` for flexbox layout
- Added `.sidebar`, `.sidebar-header`, `.logo`, `.nav-items`, `.nav-item`, `.sidebar-footer` styles
- Added `.main-content` with `margin-right: 260px` (desktop)
- Updated `.header` to be sticky with new `.header-content` structure
- Added `.menu-toggle`, `.greeting`, `.header-title`, `.date-display` styles
- Added `.fab` button styles (mobile only)
- Updated `.stat-card` to use flexbox with icon + info columns
- Added `.stat-icon` and `.stat-info` styles
- Mobile responsive: sidebar transforms off-screen, FAB visible, header simplified
- Tablet responsive: 220px sidebar width

---

## Testing Checklist

- [ ] Open dashboard on desktop (>1024px) - sidebar should be visible on right
- [ ] Click navigation items - active state should update, page should stay on dashboard view
- [ ] Resize to mobile (<768px) - sidebar should hide, menu toggle (☰) should appear
- [ ] Click menu toggle on mobile - sidebar should slide in from right
- [ ] Click navigation item on mobile - sidebar should close automatically
- [ ] Click FAB (+) button on mobile - "הזמנה חדשה" modal should open
- [ ] Login flow - login overlay → terms overlay → dashboard (no interruption from UI upgrade)
- [ ] Admin role - revenue/fee columns visible
- [ ] Staff role - revenue/fee columns hidden
- [ ] API calls - `fetchWhoami`, `fetchData`, `submitNewBooking` should all work unchanged
- [ ] Theme toggle - light/dark mode should apply to sidebar and all new elements

---

## Known Limitations

1. **Navigation is visual only** - Clicking nav items only updates active state. Actual page routing (events, artists, finance, settings) needs to be implemented separately.
2. **Logo image** - `#sidebarLogo` is hidden by default, needs logo URL from API or config
3. **Date localization** - Uses `he-IL` locale for Hebrew date formatting

---

## Next Steps (Optional Enhancements)

- Implement page routing for Events, Artists, Finance, Settings views
- Add logo loading from Google Drive (like header logo)
- Add user profile avatar in sidebar footer
- Add notification badge count from API
- Implement search functionality in header
- Add keyboard shortcuts (e.g., Cmd+K for search)
