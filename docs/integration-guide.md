# Integration guide

Built for the **Shopify Horizon** theme (or a Horizon-based theme with the
same "theme blocks" architecture — a section that accepts `{ "type": "@theme" }`
in its block list).

## 1. Copy the files

- `blocks/back-in-stock-alert.liquid` → your theme's `blocks/` folder
- `assets/back-in-stock-alert.js` → your theme's `assets/` folder

## 2. Add the translation keys

Add the keys from `locales/en.default.json` / `locales/fr.json` (storefront
text) and `locales/en.default.schema.json` / `locales/fr.schema.json` (editor
labels) to your own locale files. Add more languages as needed — Shopify
falls back to the default locale for anything you don't translate.

## 3. Add the block in the theme editor

Open the theme editor, go to a product page, select the product information
section, and add the **Back in Stock Alert** block wherever you'd like it
(right after the buy buttons is a natural spot). If it doesn't show up in the
block picker's default shortlist, search for it by name — it's a real
`@theme` block, just not always surfaced in the curated list (see
`docs/gotchas.md`, #5).

## 4. Configure it

From the block's settings in the theme editor:

- Popup title
- Submit button text
- Consent checkbox text (review the wording for your own compliance
  requirements — GDPR/CASL/etc. — before publishing)
- Confirmation message
- Continue shopping button text

## 5. Wire up the actual notification backend

**This block only builds the front-end.** A theme cannot safely store signup
requests or send emails on its own — writing a metafield from the storefront
would require exposing an Admin API token publicly, which anyone could steal.
`#submitToNotifyMe` in `assets/back-in-stock-alert.js` is a clearly-marked stub
— replace it with a real call to whichever backend you choose:

- **A third-party app with a public storefront API** (e.g. Notify Me!, Swym
  Back in Stock Alerts) — the app handles storage + email entirely in the
  background; this block's UI stays 100% custom. Verify the app's plan
  actually exposes API access before committing to it — some free tiers limit
  API access to their own widget.
- **A backend you already run** (Shopify Flow + metafields, or your own
  serverless function) — more setup and ongoing maintenance, but no
  third-party dependency.

Never put a secret/Admin API key directly in this file — only a public,
storefront-facing key, if your backend provides one.

## 6. Optional: Bundle Selector integration

If your theme also has
[shopify-bundle-selector](https://github.com/pteyo032/shopify-bundle-selector)
installed, copy the included `assets/bundle-selector.js` over the original
(diff first if you've customized it). When one or more units in a selected
tier are out of stock, "Add to cart" now opens this same popup listing every
unavailable unit — one email covers all of them — instead of the generic
"select all options" error. If this block isn't present on a given page,
`bundle-selector.js` falls back to its original behavior automatically.

## What this does *not* do

- Store signup requests or send emails by itself (see step 5)
- Prevent duplicate signups from the same email for the same variant
- Show anything on collection pages or in quick-add — product page only
