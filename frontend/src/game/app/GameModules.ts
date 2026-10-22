// What the page and the C++ export use of a game's modules, whichever game plays (GameApp.GetGameModule): no C++
// counterpart.

import type { EInfoViewPageType } from '@game/alpha_family/libs/AlphaFamily/Views/IInfoView.data';

/** Views that a view module's CreateViews() adds together, under a comment (none: after a blank line). */
export interface ViewGroup {
  comment: string;
  views: string[];
}

/** A view module: its views in the groups of its CreateViews(). */
export interface ViewModule {
  GetViewGroups(): readonly ViewGroup[];
}

/** An info screen module: its info view's pages. */
export interface InfoViewPages {
  GetInfoView(): { GetPages(): { current: EInfoViewPageType; next: EInfoViewPageType } } | null;
}
