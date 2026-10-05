# Navigation menu: instructions for the Claude Code agent

You are restructuring the **navigation panel** (the left sidebar) of EGT GDA Sync so that it follows the user's working process and stays usable when there are many workspaces. The Dashboard leaves the panel and becomes a link in the header of every page. Read this whole file before changing anything.

## 1. Scope: work only on the navigation panel and the Dashboard link

This is a hard constraint. **Change the navigation panel, add the Dashboard link to the page headers, and nothing else.**

You may edit:

- `frontend/src/layout/AppSidebar.vue` (the panel itself; most of the work happens here)
- the `/* Sidebar */` block of `frontend/src/styles/app.scss` (and the sidebar-only classes it defines)
- `frontend/src/components/PageHeader.vue` and `frontend/src/components/WorkspaceHeader.vue`, **only** to add the Dashboard link (section 6). Its styles go in those files or in the `/* Page header */` block of `app.scss`
- `frontend/src/views/ActivityView.vue` and `frontend/src/views/SettingsView.vue`, **only** to remove their own `Dashboard` quick link, which the shared header link replaces (section 6)
- steps and selectors in `tests/e2e/` that click sidebar items, only as far as the new navigation logic requires (see section 8)
- new files that exist only to serve the panel, for example `frontend/src/layout/SidebarSection.vue`

You must **not** edit:

- the rest of the page content: everything else in `frontend/src/views/*` and `frontend/src/components/*` (including `DashboardView.vue`), `AppFooter.vue`, and `AppHeader.vue` apart from its Workspace settings button (section 4.2)
- shared state and types: `frontend/src/workspace.ts`, `frontend/src/types.ts`, `frontend/src/format.ts`, `frontend/src/App.vue`. Read them, call their existing exports, but do not change them. This means **no new `View` values, no new routes or pages, and no new store fields.**
- anything in `egt_gda_sync/` (the backend and its HTTP API), `config/`, `scripts/`, `bundle/`, `pyproject.toml`, `README.md`

If a menu item needs something that exists only outside the panel (a page, an API, state), **do not build it**. Link the item to the closest existing destination described below, or leave it out, and list it under "Follow-up work" in your final report (section 9). Do not widen the scope to make the menu look complete.

Other working-tree changes in the repository belong to the user. Do not revert, reformat, stage or commit them, and do not commit your own work unless asked.

## 2. What the panel is for

The navigation menu represents the **hierarchy of the working process**. The user manages many game workspaces and repeatedly does the same chain of work: look at everything, pick a workspace, see what differs, sync it, and look at its assets. The menu is a helper for operating that chain with a lot of workspaces.

It has two levels:

- **Global level** (about all workspaces): **Workspaces**. The **Dashboard**, the overview of all workspaces, is global too, but it is **not in the menu**: it is reached from the link in every page header (section 6).
- **Workspace level** (about one workspace): **Sync** and **Assets** in the menu, and **Workspace settings** as a gear button in the site header (`AppHeader.vue`)

What a workspace is, in the user's words and in `workspace.json` fields:

- `game_name` is the display name.
- `game_path` is the game's **resources folder**. It contains a list of `*.json` files that hold the resource paths of that game (section 5.4). These files **differ for every workspace**.
- `gda_path` is the **GDA folder**. It holds the **new resources** that should be used for the game.
- The **Sync** section is about the difference between the two folders.

## 3. Current state (verify in the code before relying on it)

- `AppSidebar.vue` currently renders: a Dashboard item, a "Workspace" list of buttons, a "Main Menu" category (Asset library, Needs sync, In sync, Sync activity), a collapsible "Asset types" item, and a "Workspace settings" item. The workspace list always highlights one workspace, even on the dashboard.
- Page headers: `DashboardView`, `ActivityView` and `SettingsView` render `PageHeader.vue` (a title and the `links` and `links-right` quick-link slots). `LibraryView`, which serves `library`, `pending` and `synced`, renders `WorkspaceHeader.vue` instead. `ActivityView` and `SettingsView` each already have their own `Dashboard` quick link in `links-right`; the other pages have none.
- `AppHeader.vue` renders the shared site header: the app name opens the dashboard on wide screens; on small screens the mini logo toggles the panel. The title is "Dashboard" on the dashboard and the workspace name on other views. At its right corner a gear button (`Workspace settings`) opens the settings view. Leave the rest of the site header as it is.
- Navigation is done with `navigate(view, category?)` from `workspace.ts`. Views that exist: `dashboard`, `library`, `pending` ("Needs sync"), `synced` ("In sync"), `activity`, `settings`. `ui.view` and `ui.category` hold the current location. `navigate()` resets the category to `all`, clears search, filters and selection, and closes the off-canvas panel.
- The app starts on `dashboard`. Several actions leave the dashboard on their own: searching (`ui.query` switches to `library`), inspecting an asset, and saving settings.
- Workspaces come from `config.value.workspaces` (`workspaces` export): `{ id, name, source, destination }`. These map to the `workspace.json` fields as **`name` = `game_name`, `source` = `game_path`, `destination` = `gda_path`**. The backend does this translation; the frontend never sees the `game_*` names. The active workspace id is `config.value.defaultWorkspace`.
- `selectWorkspace(id)` switches the backend's active workspace and then **always navigates to the dashboard** and shows a toast. It returns immediately without doing anything when `id` is already the active one. It does not throw: on failure it shows an error toast and leaves the view unchanged.
- Only the **active** workspace is loaded. `assets`, `pending`, `syncedCount`, `countStatus(status)` and `countType(type)` describe the active workspace only. There is no data for the inactive ones, so the menu cannot show counts for them.
- Asset types come from `ASSET_TYPES`, `typeNames` and `typeIcons` in `format.ts` (textures, models, materials, audio). `other` files exist as a type but are not in `ASSET_TYPES`.
- `config/workspace.json` (template `config/workspace.json.template`) has `defaultWorkspace` and a `workspaces` list of `id`, `game_name`, `game_path`, `gda_path`.
- The status meaning (`new`, `modified`, `synced`) and the direction of the copy are decided by the backend. Do not change them, and keep the menu wording neutral: name the two folders "Game folder" and "GDA folder" and **do not draw an arrow between them**.

## 4. Navigation logic

### 4.1 The rule

**A workspace is selected in the menu only while a workspace-level view is open.** The Dashboard is about all the workspaces, so while it is visible no single workspace may look selected, and the workspace-level sections have nothing to act on.

Derive this, do not store it. No new store fields, no extra panel state for it:

```ts
const inWorkspace = computed(() => ui.view !== 'dashboard');
const selectedId = computed(() => inWorkspace.value ? config.value.defaultWorkspace || 'current' : null);
```

Because it is derived from `ui.view`, it also stays correct when something outside the panel changes the view (search, inspecting an asset, saving settings): the menu then shows the active workspace as selected.

### 4.2 What the menu shows in each state

| | Dashboard visible | A workspace-level view visible (`library`, `pending`, `synced`, `activity`, `settings`) |
| --- | --- | --- |
| Workspaces list | **no entry highlighted**, no `aria-current` | the active workspace highlighted, `aria-current="true"` |
| Sync section | **hidden** | shown, with the workspace name |
| Assets section | **hidden** | shown, with the workspace name |
| Workspace settings (gear in the site header, not in the menu) | **hidden** | shown (highlighted on the settings view) |

The menu has no Dashboard item in either state. The Dashboard link in the page header is on every page in both states (section 6).

Hide the workspace-level items instead of disabling them, so that on the first screen the menu shows only Workspaces, and the rest appears once a workspace is chosen. **Workspace settings** edits one workspace, so its gear in the site header is hidden on the dashboard as well. "Stop application" on the settings page stays reachable from the dashboard through the dashboard page's own "Settings" and "Workspace settings" links.

### 4.3 Transitions

| User action | Result |
| --- | --- |
| App opens | Dashboard; nothing selected; Sync, Assets and Workspace settings hidden |
| Click **Dashboard** in the page header | Dashboard opens; selection cleared; Sync, Assets and Workspace settings hidden |
| Click a workspace **while on the Dashboard** | That workspace becomes selected and its **Needs sync** view opens (the first step of the working process after choosing a workspace). Keep the landing view in one named constant, so it is easy to change |
| Click a **different** workspace **while in a workspace view** | The workspace switches and the user **stays where they were**: same view, and for `library` the same asset-type category (rules below) |
| Click the already selected workspace | Nothing |
| Click a Sync or Assets item | That view opens for the selected workspace (`navigate(...)`) |
| Switching fails | `selectWorkspace` shows the error toast. Change nothing else |

Two details of the existing code you must handle in the panel:

1. **Clicking the workspace that is already the backend's active one while on the Dashboard** is the normal case right after launch. `selectWorkspace` returns early for it and would not leave the dashboard. Detect `id === config.value.defaultWorkspace` and call `navigate(landing)` directly instead.
2. **`selectWorkspace` always ends on the dashboard.** Wrap it in the panel: remember `ui.view` and `ui.category` first, `await selectWorkspace(id)`, and only if `config.value.defaultWorkspace === id` afterwards call `navigate(...)` with the target. If the switch started on the Dashboard, the target is the landing view. Otherwise it is the remembered view.

Carry-over rules when switching between two workspaces:

- `pending`, `synced`, `activity` and `settings` carry over as they are.
- For `library`, **the asset-type category carries over**. Asset types are nearly the same in every workspace, so the user can compare "Textures" across games with one click each. If the new workspace has no assets of that type (`countType(type) === 0` after the switch), fall back to the whole library (`all`).
- Resource-list selections (section 5.4) **never** carry over, because those lists are different in every workspace.

### 4.4 What is stable and what changes between workspaces

| Part of the menu | Between workspaces |
| --- | --- |
| Workspaces, Sync items | the same entries; only badges and tooltips change |
| Asset types (textures, models, materials, audio) | **the same list in the same order every time.** Define it once from `ASSET_TYPES`; only the counts change. Do not rebuild or reorder it on a switch |
| The `*.json` resource lists | **different for each workspace** (section 5.4): the whole group is replaced on a switch |

## 5. Target menu

Use the existing StarAdmin sidebar look (same classes, colours, icons from Material Design Icons, spacing). Add no dependencies.

There is **no Dashboard item** in the menu any more: remove the existing one, so the panel starts with Workspaces. The way to the Dashboard is the page-header link (section 6).

Sections, top to bottom:

### 5.1 Workspaces

A section with the heading **Workspaces** that lists **every** workspace from `workspaces` in the order of `workspace.json`. The list is the only way to choose a workspace.

- One entry per workspace, showing `name`. Put the `id` and the two folders ("Game folder: …", "GDA folder: …") in the `title` attribute (tooltip), not in the visible text.
- Selection, `aria-current` and clicks follow section 4. Disable the entries while `busy` is set, as the current list does.
- Use the same `nav-item`, `nav-link` and `menu-title` styling as Sync and Assets, including the full-width active background. Workspace entries are text-only; Sync and Assets use their item icons. Do not render navigation dots. Long workspace names may wrap.
- It must stay usable with **many** workspaces (assume 30 or more):
  - cap the list height with its own scrollbar so the sections below stay reachable, and scroll the selected entry into view
  - when there are more than 8 workspaces, show a small "Filter workspaces" text input above the list that filters by name or id (case-insensitive, local state in the panel only, empty-state text "No matching workspace")
  - everything must work with the keyboard (Tab to reach, Enter or Space to select) and with a screen reader
- When there is no `workspaces` list (an older single-workspace configuration), show one entry for `config.value.name` with the id `current`, as the current code does, so the section is never empty.

### 5.2 Sync (workspace level)

Shown only in a workspace view (section 4.2). Heading **Sync**, without the workspace name. The heading's `title` names the two folders ("Game folder: …", "GDA folder: …"), taken from `config.value.source` and `config.value.destination`; do not print long paths in the menu itself.

It shows how the game's resources and the GDA folder differ, using the existing statuses and views:

| Item | Destination | Badge |
| --- | --- | --- |
| Needs sync | `navigate('pending')` | number of assets that are `new` or `modified` (`pending.length`), warning colour |
| In sync | `navigate('synced')` | `syncedCount`, success colour |
| Sync activity | `navigate('activity')` | none |

Where space allows, show the split of "Needs sync" in a `title` tooltip (for example "3 new, 2 modified"), using `countStatus('new')` and `countStatus('modified')`. Keep the existing accessible names `Needs sync`, `In sync` and `Sync activity` (section 8).

### 5.3 Assets (workspace level)

Shown only in a workspace view. Heading **Assets**, without the workspace name. It lists the assets of the selected workspace by **every supported asset type**:

- first item: `Asset library` (all assets), `navigate('library')`, badge `assets.length`
- then one item per type in `ASSET_TYPES` (use `typeNames` and `typeIcons` for the label and icon), `navigate('library', type)`, badge `countType(type)`; the same list in the same order for every workspace (section 4.4)
- add `Other files` (`other`) as the last item **only** when `countType('other') > 0`
- an item is active when `ui.view === 'library'` and `ui.category` matches (`all` for the library item)

Show the types directly, not behind a collapsed "Asset types" parent, because this is the main working list. The section may be collapsible if that keeps a long menu manageable; if so, default it to open and make the toggle a real button with `aria-expanded`.

### 5.4 Resource lists from the `*.json` files (design only, not part of this task)

Each workspace's game folder (`game_path`) holds the `*.json` files that list that game's resource paths, and **those resource lists are the part of the Assets section that differs from workspace to workspace**. The structure on disk, for reference (see `/media/plamen/data/Egt/games/resources/joker_reels_coins_10`):

- `AllRssData.json` is the index. Its `include` array lists the other JSON files, as paths relative to `game_path` (some point outside it, for example `../common/features/taxation/RssData.json`).
- The included files each describe one kind of resource, for example `RssImagesData.json` (`images[]` with `id` and `path`), `RssImagesSeqData.json` (`imagesSeq[]`), `RssAudioData.json` (`audioEvents[]` with `samples[]`), `RssFontsData.json` (`fonts[]`), `RssMoviesData.json` (`movies[]`), `RssRawData.json` (`rawFiles[]`), plus `RssTextStylesData.json`, `RssRtfsData.json`, `RssElementsListData.json` and `RssIData.json`. Resource `path` values are relative to `game_path`.

The intended menu, for a later step: below the asset types, a second group in the Assets section, "Resource lists", with one entry per file named in the selected workspace's `AllRssData.json`. Each entry shows the file's name in plain words (for example `RssImagesData.json` → "Images"), the number of resources in it as a badge, and opens the assets filtered to that file. The group is rebuilt whenever the workspace changes and is never carried over (section 4.3).

Reading these files needs a backend endpoint and a filter in the library view, and the frontend has no state for them today. That is outside the navigation panel, so for this task:

- Build only the asset-type entries (5.3).
- Produce the Assets entries from one small computed list of `{ key, label, icon, count, active, onSelect }`, so that a later change can add a second group without rewriting the template.
- Do **not** add an API call, parse any JSON file, render an empty "Resource lists" group, or invent a loading state for them.
- Put the resource lists into "Follow-up work" in your final report.

## 6. Dashboard link in the page header

The Dashboard is the overview of all the workspaces. It is no longer a menu item. Instead, the header of **every page** has a **Dashboard** link that calls `navigate('dashboard')`. On small screens this is also the direct way back to the Dashboard, because there the navbar logo toggles the panel instead.

- Add the link **once in each shared header component**, `PageHeader.vue` and `WorkspaceHeader.vue`, not separately in each view. Then every page (`dashboard`, `library`, `pending`, `synced`, `activity`, `settings`) has it, and a later page that uses one of these components gets it too.
- Put it in the same place with the same look in both components: the first element of the header, before the page title, aligned left. Use the dashboard icon (`mdi-view-dashboard-outline`, `aria-hidden`) and the visible text `Dashboard`. Follow the pattern of the existing quick links, `<a href="#" @click.prevent="navigate('dashboard')">`, so its role is `link` and its accessible name is exactly `Dashboard`.
- On the Dashboard page itself keep the link in the same place, marked with `aria-current="page"`.
- Remove the `Dashboard` quick link from `links-right` in `ActivityView.vue` and `SettingsView.vue`, so that no page has two Dashboard links. Leave their other quick links as they are.
- Change nothing else in the headers. The page content that shows all workspaces is **not** part of this task (the app does not load per-workspace data yet; see section 9).

## 7. Behaviour and quality requirements

- **Active state**: at most one menu item is highlighted at a time, and it matches `ui.view`/`ui.category`. On the Dashboard no menu item is highlighted. The selected workspace follows section 4.1 and is independent of the item highlighting.
- **Responsive**: the panel is off-canvas on small screens, controlled by `ui.sidebarOpen`; `navigate()` already closes it. Selecting a workspace must keep working there. The header's Dashboard link must stay visible at phone width. Do not add scrollbars to the whole page.
- **Accessibility**: the `<nav>` keeps `aria-label="Main navigation"`. Each section has a heading element referenced with `aria-labelledby` by its list. Every interactive element in the panel is a `<button>` with visible text and a visible focus ring; icons are `aria-hidden`. The header link keeps a visible focus ring too.
- **Counts**: badges update as the state changes (rescan, sync, workspace switch). No manual copies of the numbers.
- **Style**: follow the surrounding code (TypeScript with `<script setup>`, same naming and indentation, the SCSS variables already used in `app.scss`). Reuse the existing classes (`nav-item`, `nav-link`, `menu-icon`, `menu-title`, `badge`, `workspace-game`, `sub-count`) before adding new ones. Keep comments short and only where the reason is not obvious.
- **Text**: English, sentence case for items, uppercase small labels for section headings as the existing "Workspace" label does.

## 8. Tests and names to keep

Keep the accessible names that `tests/e2e/test_app.py` uses (`exact=True` for some): `Asset library`, `Needs sync`, `In sync`, `Sync activity`, and `Workspace settings` for the header's gear button. Add new names for new items. The menu's `Dashboard` button goes away and the header link (role `link`, name `Dashboard`) takes its place. No current test clicks either; the tests only check the `Dashboard` heading, which stays.

The new navigation logic **intentionally** breaks the e2e steps that click a Sync or Assets item, or the Workspace settings gear in the site header, while the Dashboard is open, because they are now hidden there. The tests that do this are `open_library()`, `test_syncing_all_pending_makes_the_workspace_current_including_after_reload` (it clicks "Needs sync" right after the dashboard loads and after a reload), `test_validates_workspace_folders_and_saves_a_project_configuration` and `test_stops_the_local_application_and_leaves_a_clear_closed_workspace_screen` (both click "Workspace settings" right after the dashboard loads). Update such a step to choose the workspace first, with the smallest change, for example a helper:

```python
def select_workspace(page):
    page.get_by_role("list", name="Workspaces").get_by_role("button").first.click()
```

After that click the Needs sync view is open, so `open_library()` goes on to click `Asset library`. The Needs sync page header has its own "Workspace settings" button, so the two settings tests click the gear within `get_by_role("banner")`, the site header. Do not change anything else in the tests.

Before changing code, run the baseline and write down what already fails, because the user is editing the interface in parallel and some e2e tests may already fail for unrelated reasons (for example, a missing "Asset library" heading or a `.sidebar .profile-name` selector). Do not "fix" those; only make sure you add no new failures.

```bash
.venv/bin/python -m pytest -q --ignore=tests/e2e      # backend and API tests
python scripts/build.py                               # rebuilds the interface into egt_gda_sync/static
.venv/bin/python -m pytest -q tests/e2e               # browser tests need the built interface
npm --prefix frontend run typecheck                   # Vue and TypeScript
```

Also try the panel in a browser at desktop width and at phone width (about 375 px), with the demo configuration and with a `workspace.json` that has at least 30 workspaces (use a temporary copy under the scratchpad directory; never edit `config/workspace.json` itself). Walk through every row of the transition table in section 4.3, including the first click on the already-active workspace after launch, and a switch from `library` + a category to a workspace that has no assets of that type. Check that every page shows exactly one Dashboard link in its header, at both widths.

## 9. Final report

End with a short report that contains:

1. what changed, per file
2. what you ran (the commands above) and the results, including failures that already existed before your change
3. the e2e steps you changed because of section 8, and why
4. assumptions you made where this file was unclear
5. **Follow-up work** that you deliberately did not do because it is outside the navigation panel, at least:
   - a Dashboard page that summarizes all workspaces (needs per-workspace data from the backend)
   - the "Resource lists" group built from each workspace's `AllRssData.json` and its `include` files, with its endpoint and library filter
   - a dedicated Workspaces overview page, if the user wants one
