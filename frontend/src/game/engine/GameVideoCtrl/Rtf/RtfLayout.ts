// The pages of an RTF (a project of the RTF Tool: a game's help pages), as the backend lays them out from the project
// for the asset library and the browser game: each page's background and its text sections, each section's text in
// every language as runs of text, inline images, paytable figures and variables, and the text styles.

export type RtfRun = { style?: string } & (
  | { text: string }
  | { image: string | null; id: string; found: boolean; scale: number }
  | { video: string | null; id: string; found: boolean; frames: number; fps: number; scale: number }
  /** A win the game computes: looked up by the figure's first id, count and multiplier. */
  | { figure: string; ids?: string[]; count?: number; multiplier?: number }
  /** A value the game fills in, such as _serial_number_, with the value the project names for it. */
  | { variable: string; value?: string }
);

export interface RtfSection {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  horizontal: 'left' | 'center' | 'right';
  vertical: 'top' | 'middle' | 'bottom';
  wrap: boolean;
  style: string;
  texts: Record<string, { case?: string; runs: RtfRun[] }>;
}

export interface RtfStyle {
  face: string;
  weight: number;
  size: number;
  /** One color, or a gradient from top to bottom. */
  fill: string[];
  letterSpacing: number;
  lineSpacing: number;
  outline?: { color: string; width: number };
  shadow?: { color: string; x: number; y: number; blur: number };
}

export interface RtfLayoutPage {
  id: string;
  width: number;
  height: number;
  background: string | null;
  found: boolean;
  sections: RtfSection[];
}

export interface RtfLayout {
  languages: string[];
  pages: RtfLayoutPage[];
  styles: Record<string, RtfStyle>;
}
