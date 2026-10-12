# StarAdmin theme

The interface is styled with the SCSS of [StarAdmin Free Bootstrap Admin Template](https://github.com/BootstrapDash/StarAdmin-Free-Bootstrap-Admin-Template)
3.5.0 (commit `7ab3570`, MIT, © BootstrapDash; see `LICENSE`), compiled against Bootstrap 4.6 SCSS.

`scss/shared` (Bootstrap with the template's variables, components and utilities) and `scss/demo_1` (the gradient
sidebar, navbar, cards and dashboard layout) are copied unchanged except for:

- Bootstrap is imported from `node_modules` (`bootstrap/scss/...`).
- Roboto is bundled by the app (`@fontsource-variable/roboto`) instead of loaded from Google Fonts.
- Hard-coded icon glyphs use Material Design Icons 7 codepoints (`\F054` → `\F0054`, and so on).
- The login/register screens (which need stock photos) and the promotional purchase banner are left out.

Application styles in `src/styles/app.scss` build on the template's variables and mixins.
