import { Fragment, useEffect, useRef, useState } from 'react';
import { classes } from '../classes';
import { ASSET_SECTIONS, number, sectionIcons, sectionNames } from '../format';
import type { AssetSection, View } from '../types';
import { navigate, selectWorkspace, store, useWorkspace } from '../workspace';

interface Entry {
  key: string;
  label: string;
  icon: string;
  count?: number;
  badge?: string;
  title?: string;
  active: boolean;
  onSelect: () => void;
}

// Choosing a workspace on the dashboard opens the first step of its work.
const LANDING_VIEW: View = 'pending';
const MAX_UNFILTERED = 8;
// The library sections with an entry of their own: textures as Images and ImagesSeq (image sequences), then the other
// types. Models and materials have none: they are listed in the Asset library.
const ASSET_CATEGORIES: (AssetSection | 'all')[] = ['all', ...ASSET_SECTIONS];

export default function AppSidebar() {
  const { activeSyncCount, assetCount, busy, config, countSection, rssSync, ui, workspaces } = useWorkspace();

  // A workspace is selected only while one of its views is open; the dashboard covers all of them.
  const inWorkspace = ui.view !== 'dashboard';
  const activeId = config.defaultWorkspace || 'current';
  const selectedId = inWorkspace ? activeId : null;
  const games = workspaces.length ? workspaces : [{ id: 'current', name: config.name, source: config.source, destination: config.destination }];
  const folders = (source: string, destination: string) => `GDA folder: ${source}\nGame folder: ${destination}`;

  const [filter, setFilter] = useState('');
  const filterable = games.length > MAX_UNFILTERED;
  const needle = filter.trim().toLowerCase();
  const shownGames = !filterable || !needle ? games : games.filter(game => game.name.toLowerCase().includes(needle) || game.id.toLowerCase().includes(needle));

  const gameList = useRef<HTMLUListElement>(null);
  const shownIds = shownGames.map(game => game.id).join('\0');
  useEffect(() => {
    const list = gameList.current;
    const item = list?.querySelector<HTMLElement>('[aria-current="true"]');
    if (!list || !item) return;
    if (item.offsetTop < list.scrollTop) list.scrollTop = item.offsetTop;
    else if (item.offsetTop + item.offsetHeight > list.scrollTop + list.clientHeight) list.scrollTop = item.offsetTop + item.offsetHeight - list.clientHeight;
  }, [selectedId, shownIds]);

  async function chooseWorkspace(id: string) {
    if (busy || id === selectedId) return;
    const { view, category } = ui;
    const target = view === 'dashboard' ? LANDING_VIEW : view;
    // selectWorkspace ignores the workspace that is already active, so open its view directly.
    if (id === activeId) return navigate(target);
    await selectWorkspace(id);
    // selectWorkspace always ends on the dashboard; return to where the user was unless the switch failed.
    if (store.data?.config.defaultWorkspace !== id) return;
    navigate(target, target === 'library' && category !== 'all' && countSection(category) ? category : 'all');
  }

  // The Sync badge counts what the summary of the latest GDA sync report has not in sync; there is none before the first report.
  const summary = rssSync?.summary;
  const notInSync = summary && {
    count: summary.different + summary.missing + summary.invalid,
    title: `${number(summary.different)} different, ${number(summary.missing)} missing, ${number(summary.invalid)} invalid`,
  };

  const syncEntries: Entry[] = [
    { key: 'pending', label: 'Sync', icon: 'mdi-sync', count: notInSync ? notInSync.count : undefined, badge: 'badge-warning', title: notInSync ? notInSync.title : 'No GDA sync report yet' },
    {
      key: 'rssSync', label: 'Sync in progress', icon: 'mdi-check-all', count: activeSyncCount || undefined, badge: 'badge-primary',
      title: activeSyncCount ? 'GDA sync in progress' : undefined,
    },
    { key: 'history', label: 'Sync history', icon: 'mdi-history' },
    { key: 'backups', label: 'Backups', icon: 'mdi-backup-restore' },
  ].map(entry => ({ ...entry, active: ui.view === entry.key, onSelect: () => navigate(entry.key as View) }));

  const assetEntries: Entry[] = [...ASSET_CATEGORIES, ...(countSection('other') ? ['other' as const] : [])].map(category => ({
    key: category,
    label: category === 'all' ? 'Asset library' : sectionNames[category],
    icon: category === 'all' ? 'mdi-view-grid-outline' : sectionIcons[category],
    count: category === 'all' ? assetCount : countSection(category),
    badge: 'badge-light',
    active: ui.view === 'library' && ui.category === category,
    onSelect: () => navigate('library', category),
  }));

  const sections = [
    { key: 'sync', heading: 'Sync', title: folders(config.source, config.destination) as string | undefined, entries: syncEntries },
    { key: 'assets', heading: 'Assets', title: undefined as string | undefined, entries: assetEntries },
  ];

  return (
    <nav id="sidebar" className={classes('sidebar', 'sidebar-offcanvas', { active: ui.sidebarOpen })} aria-label="Main navigation">
      <h2 id="sidebar-workspaces-heading" className="sidebar-section-label">Workspaces</h2>
      {filterable ? <input value={filter} onChange={event => setFilter(event.target.value)} type="search" className="workspace-filter" placeholder="Filter workspaces" aria-label="Filter workspaces" aria-controls="sidebar-workspaces" /> : null}
      <ul id="sidebar-workspaces" ref={gameList} className="nav workspace-game-list" aria-labelledby="sidebar-workspaces-heading">
        {shownGames.map(game => (
          <li key={game.id} className={classes('nav-item', { active: game.id === selectedId })}>
            <button type="button" className={classes('nav-link', 'workspace-game', { active: game.id === selectedId })} aria-current={game.id === selectedId ? 'true' : undefined} title={`ID: ${game.id}\n${folders(game.source, game.destination)}`} disabled={!!busy} onClick={() => { void chooseWorkspace(game.id); }}>
              <span className="menu-title">{game.name}</span>
            </button>
          </li>
        ))}
      </ul>
      {!shownGames.length ? <p className="workspace-empty">No matching workspace</p> : null}
      {inWorkspace ? sections.map(section => (
        <Fragment key={section.key}>
          <h2 id={`sidebar-${section.key}-heading`} className="sidebar-section-label" title={section.title}>
            {section.heading}
          </h2>
          <ul className="nav" aria-labelledby={`sidebar-${section.key}-heading`}>
            {section.entries.map(entry => (
              <li key={entry.key} className={classes('nav-item', { active: entry.active })}>
                <button type="button" className="nav-link" aria-label={entry.label} aria-current={entry.active ? 'page' : undefined} title={entry.title} onClick={entry.onSelect}>
                  <i aria-hidden="true" className={classes('menu-icon', 'mdi', entry.icon)} /><span className="menu-title">{entry.label}</span>{entry.count !== undefined ? <span className={classes('badge', 'badge-pill', entry.badge)}>{number(entry.count)}</span> : null}
                </button>
              </li>
            ))}
          </ul>
        </Fragment>
      )) : null}
    </nav>
  );
}
