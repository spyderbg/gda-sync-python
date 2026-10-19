# Move popup design concepts

Image mockups for choosing a layout before implementation. Generated with the built-in image generation tool.
The application code was not changed for these concepts.

- [01 — Form and review](01-form-and-review.png): editable destination and name on the left, persistent review sidebar on the right.
- [02 — Folder browser](02-folder-browser.png): a file-manager tree and child-folder list, with a compact review section.
- [03 — Guided steps](03-guided-steps.png): choose destination and name first, then review changes in a second step.

## Prompt set

Reference: `build/move-folder-picker.png`, a screenshot of the existing popup. Treat it as the reference for the existing app identity and surrounding background, while substantially redesigning the popup. Remove its toast.

Shared brief for all three: high-fidelity, straight-on desktop application UI; landscape canvas about 1440 × 1000; a centered fixed-size modal about 1100 × 850 with fixed header/footer and internal scrolling. Preserve the dimmed dark-blue app sidebar/header. Use white and very pale gray surfaces, restrained #4b49ac indigo, charcoal text, thin dividers, clear sans-serif typography and consistent 8px spacing. Avoid decorative illustrations, perspective, device frames, watermarks, neon colors, excessive shadows, nested boxes and long absolute machine paths.

Preserve slash-separated clickable breadcrumbs, a compact subfolder dropdown immediately after the last folder, no Up button, an editable prefilled file name, operation/reference previews, and close/cancel controls. Use the same example in every image: `Topper_JR.dds`, 2.0 MB, copied from `../joker_reels_coins_10/art/1920x1080/08.Topper/Topper_JR.dds` into `art/1920x1080/08.Topper/Topper_JR.dds`. Show 1 file and 2 references (`RssImagesData.json`, line 9; `RssRawData.json`, line 7), clarify that the original stays, and state that a backup is saved automatically.

### 01 — Focused form + review sidebar

Title “Move asset,” file icon and filename/size below. Two columns: approximately 60% for concise source summary, destination breadcrumbs/dropdown, manual-path disclosure, filename and before/after location; approximately 40% for a pale review sidebar with counts, Files/References tabs and two reference changes. Show an internal scrollbar in the review pane. All functionality is visible at once, without a tree or stepper. Fixed footer: backup reassurance, Cancel and Apply.

### 02 — File-manager browser

Title “Move asset,” filename/size below. Destination breadcrumbs/dropdown above an integrated browser: a narrow folder tree on the left and a larger child-folder list on the right. Expand Game folder / art / 1920x1080, select 08.Topper, and show sibling game-art folders. Illustrate DDS and PNG child folders. Beneath the browser, show filename, Copy badge and short destination confirmation in a compact row. Put a restrained expandable review summary below it; keep folder finding primary. Fixed footer: backup reassurance, Cancel and Apply. No wizard or separate review sidebar.

### 03 — Guided two-step

Title “Move asset,” filename/size below. Show a slim stepper: “1 Choose destination” active, “2 Review changes” inactive. A single-column first step has a quiet source/original-kept note, destination breadcrumbs and inline dropdown, a manual-path disclosure, prefilled filename with prefix/suffix help, and a destination preview. A small teaser says “Next: review 1 file and 2 references”; defer detailed changes to the second step. No tree or sidebar. Fixed footer: backup reassurance, Cancel and Review changes.

## More variations based on 03 — Guided steps

- [04 — Compact guided form](04-compact-guided.png): keeps the horizontal two-step flow with fewer panels and a lighter source/destination summary.
- [05 — Guided folder explorer](05-guided-explorer.png): embeds a folder tree and child-folder list into the destination step.
- [06 — Vertical guided sidebar](06-guided-sidebar.png): moves the stepper to a left rail, with the destination form beside it.

These three were generated with the built-in image generation tool using 03 as the reference, with the same file and destination in every variant. The complete [generation prompts](guided-variants-prompts.json) are saved alongside the images.
