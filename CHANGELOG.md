# Changelog

All notable changes to the PageToMD extension are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/) and versions use semantic versioning.

---

## [1.3.0] - 2025-06-22

### Added

**Batch Mode**
- "Batch Convert" button in the popup that converts all open http/https tabs in the current window
- Each tab is converted and downloaded as a separate file using the browser Downloads API
- Tabs are processed sequentially to avoid overwhelming the browser
- Requests `<all_urls>` permission on first use if not already granted
- Shows conversion count summary (e.g. "Converted 5 of 6 tabs")

**Settings and Options Page**
- Full settings page (`options.html`) accessible from the popup gear icon or Firefox add-on preferences
- Configurable default behaviour applied every time the popup opens:
  - Always include YAML front matter
  - Always auto-copy to clipboard
  - Always strip tracking parameters
  - Always generate table of contents
  - Preferred heading style (ATX `#` style or Setext underline style)
  - Default export format (Markdown, HTML, Plain text, reStructuredText)
  - Default front matter template (Generic, Jekyll, Hugo, Obsidian, Astro)
  - Default image handling mode (Keep as-is, Absolute URLs, Strip all)
- Settings persist via `browser.storage.local`

**Cloud Sync**
- Save converted files directly to cloud storage services from the popup
- "Cloud Save" button appears after a successful conversion
- Supported services:
  - **GitHub** - Pushes files to a repository via the GitHub Contents API. Supports create and update. Configurable repo owner, repo name, and folder path.
  - **Dropbox** - Uploads files via the Dropbox Files API with `autorename`. Configurable folder path.
  - **Google Drive** - Uploads files via multipart Drive API v3. Configurable folder ID. MIME type detection based on file extension.
- All cloud credentials and paths configurable in the Settings page
- "Test Connection" button in settings to verify credentials before use
- Cloud API hosts added as optional permissions to keep initial install footprint small

**Custom Conversion Rules**
- Define custom CSS selector rules in the Settings page
- Three actions per rule:
  - **Remove** - Strip the element and all its content entirely
  - **Unwrap** - Remove the element tag but preserve its inner content
  - **Collapse** - Replace the element with its plain text content
- Rules are applied to the extracted DOM node before Turndown processes the page
- Add, view, and delete rules through a card-based UI with action badges
- CSS selector validation on rule creation

**Page Readability Score**
- After conversion, a readability panel appears in the preview showing:
  - **Flesch Reading Ease** score (0-100 scale) with color-coded label:
    - Green: Very Easy (90+), Easy (70-89)
    - Yellow: Standard (60-69)
    - Orange: Fairly Difficult (40-59)
    - Red: Difficult (below 40)
  - **Flesch-Kincaid Grade Level**
  - Word count and sentence count
- Syllable counting uses a weighted vowel algorithm with corrections for silent-e and -le suffixes
- Markdown formatting is stripped before text analysis for accurate scoring

### Changed
- Version bumped from 1.2.0 to 1.3.0
- Added `storage` and `downloads` to required permissions in manifest.json
- Added `options_ui` pointing to `options.html`, opening in a new tab
- Added optional permissions for GitHub, Dropbox, and Google Drive API hosts
- Popup header now includes a gear icon button to open Settings
- Export format buttons row added below the main Convert button for batch and cloud actions
- Popup preview height reduced slightly to accommodate the readability panel
- Background script now handles three new message types: `batchConvert`, `saveToCloud`, and `getSettings`
- Content script now returns a `readability` object alongside the conversion response
- Custom rules are passed through options from popup to content script during conversion

---

## [1.2.0] - 2025-06-21

### Added

**Multiple Export Formats**
- Export dropdown in popup with four format options:
  - **Markdown (.md)** - Default Turndown output
  - **HTML (.html)** - Converted from markdown with heading, link, image, code block, list, and paragraph support
  - **Plain text (.txt)** - Markdown formatting stripped, only content text remains
  - **reStructuredText (.rst)** - Converted with underline-style headings (`=`, `-`, `~`, `^`, `"`), directive code blocks, and inline reference links
- Download filename extension matches the selected format
- Copy button copies the selected format to clipboard
- Preview panel displays the converted format output

**Front Matter Templates**
- Template dropdown in popup with five SSG/SSG-compatible options:
  - **Generic** - Title, source URL, date, author, description, tags, reading time, word count
  - **Jekyll** - Layout: post, ISO 8601 date, tags array, source URL
  - **Hugo** - ISO 8601 date and lastmod, author array, reading_time, source URL
  - **Obsidian** - Title, source URL, date, tags, description (minimal metadata vault-friendly format)
  - **Astro** - Published date in ISO 8601, author string, tags, source URL, reading_time
- All templates properly escape double quotes in values

**Table of Contents Generation**
- "Generate table of contents" checkbox in popup
- Automatically parses all ATX headings from the converted markdown
- H1 headings are excluded (typically the page title)
- Generates indented list items based on heading depth (H2 at root, H3/H4/etc. indented)
- Anchor links are lowercase with spaces converted to hyphens, special characters stripped
- TOC is inserted between the title and body content under an H2 heading

**Image Handling Options**
- "Image handling" dropdown in popup with three modes:
  - **Keep as-is** - Uses the original image src attribute unchanged
  - **Convert to absolute URLs** - Resolves relative image paths against the page origin using the URL API
  - **Strip all images** - Removes images entirely, keeping only the alt text
- Tracking parameter stripping still applies to image URLs when enabled

**Dark Mode Popup**
- Full dark theme support via `@media (prefers-color-scheme: dark)`
- Automatically follows the Firefox browser theme setting
- Dark palette covers: background, text, borders, inputs, selects, buttons, status messages, preview panel, scrollbar, and readability panel
- Dark background: `#1a1a2e`, card background: `#12121f`, borders: `#2d2d44`

### Changed
- Version bumped from 1.1.0 to 1.2.0
- `popup.html` extended with new dropdown controls for export format, front matter template, and image mode
- `popup.js` extended with `markdownToHtml()`, `markdownToTxt()`, and `markdownToRst()` conversion functions
- `content.js` extended with `buildFrontMatter()` template switch, `generateTableOfContents()`, and updated image Turndown rule
- `popup.css` extended with dark mode media query covering all UI elements

---

## [1.1.0] - 2025-06-20

### Added

**Shift Heading Depth**
- "Shift heading depth" checkbox in popup to adjust heading levels
- Sub-control dropdown with four options: +1 demote, -1 promote, +2 demote, -2 promote
- Headings are clamped between H1 and H6 (no out-of-range values)
- Applied after Turndown conversion using regex replacement on ATX heading markers

**Auto-Copy to Clipboard**
- "Auto-copy to clipboard" checkbox in popup
- When enabled, the converted output is automatically copied to the clipboard after conversion completes
- Uses the `document.execCommand("copy")` fallback pattern for popup context compatibility

**Strip Tracking Parameters**
- "Strip tracking parameters from links" checkbox in popup (enabled by default)
- Removes 30 known tracking and analytics parameters from URLs in both links and images:
  - UTM parameters: `utm_source`, `utm_medium`, `utm_campaign`, `utm_term`, `utm_content`
  - Social click IDs: `fbclid`, `gclid`, `gclsrc`, `dclid`, `msclkid`, `igshid`, `twclid`, `ttclid`
  - Email marketing: `mc_eid`, `mc_cid`, `_hsenc`, `_hsmi`, `hsCtaTracking`, `vero_id`
  - Other: `oly_anon_id`, `oly_enc_id`, `otc`, `wickedid`, `li_fat_id`, `sc_ref`, `si`, `_ga`, `_gl`
- Uses the URL API for reliable parameter parsing and removal
- Applied via custom Turndown rules for both `<a>` and `<img>` elements

**Metadata Extraction**
- Enhanced front matter with metadata pulled from page HTML:
  - **Description** - From `<meta name="description">` or `<meta property="og:description">`
  - **Tags/Keywords** - From `<meta name="keywords">`, parsed from comma-separated values
  - **Author** - From `<meta name="author">` or JSON-LD structured data (`application/ld+json`)

**Word Count and Reading Time**
- Word count included in the generic front matter as `word_count`
- Reading time calculated at 200 words per minute, included as `reading_time` in front matter
- Both metrics displayed in the preview character/line count bar

### Changed
- Version bumped from 1.0.0 to 1.1.0
- `popup.html` extended with shift heading depth toggle and sub-control, auto-copy checkbox, and tracking strip checkbox
- `popup.js` extended with heading shift option collection and visibility toggle logic
- `content.js` extended with `TRACKING_PARAMS` array, `stripTrackingParams()`, `extractDescription()`, `extractTags()`, `extractAuthor()`, `countWords()`, and `estimateReadingTime()`
- Turndown service custom rules updated to apply tracking parameter stripping to both links and images
