# Technical gotchas

Things that cost real debugging time while building this — recorded so you
don't have to rediscover them.

1. **The real event name is not `product:select`.** `StandardEvents.productSelect`
   (imported from `@shopify/events`, a module Shopify hosts, not vendored in the
   theme) actually resolves to **`shopify:product:select`** — the `shopify:`
   prefix plus the name you'd guess. Using the imported constant in real code
   works without ever noticing this; the trap only bites if you write a
   diagnostic/test listener with a hand-typed string. Confirmed by fetching and
   reading `https://cdn.shopify.com/storefront/standard-events.js` directly
   rather than guessing.

2. **Never re-derive availability in JS — read it from Liquid's already-rendered
   output.** Rebuilding `variant.available` logic in JavaScript risks drifting
   from the theme's own source of truth if the variant JSON shape ever changes.
   Instead, this component waits for the theme's standard section refetch (the
   same one every other reactive component uses), then reads a `data-available`
   attribute Liquid already computed on the freshly-rendered copy of itself. The
   JS only copies already-correct values into the live DOM — it never computes
   availability itself.

3. **The Bundle Selector has its own, completely separate event system.**
   Changing a tier or a per-unit variant inside a bundle picker dispatches
   `bundle-tier:change` (a theme-specific event), never `product:select`. A
   component that only listens for the standard variant-select event will never
   see anything happen inside a bundle context — the two systems have to be
   explicitly bridged (see `assets/bundle-selector.js`'s `#notifyUnavailable()`).

4. **A block can be invisible on the storefront with zero errors, zero
   warnings, zero logs — because it was toggled `"disabled": true` in the
   template JSON**, most likely from an accidental click in the theme editor
   during a test session. Nothing in `shopify theme check` or server logs flags
   this. What actually worked: `shopify theme pull` into an isolated temp
   folder to inspect the *real* remote state of the template, instead of
   trusting the local file.

5. **The theme editor's "Add block" picker can show a curated shortlist, not
   every available block.** A newly-added block type didn't appear under its
   category by default, but did exist (confirmed by typing its name into the
   picker's search box, and separately by adding it directly via the template
   JSON rather than relying on the picker). Root cause not identified.

6. **`display: none !important` (a theme's `.hidden` utility class) always
   beats a plain `display: flex` rule targeting the same element** — even via
   the native HTML `hidden` attribute/property. Setting `element.hidden = true`
   in JS silently does nothing if a more specific author rule already declares
   a `display` value for that class without `!important`. Fix: toggle the
   theme's own `.hidden` utility class (`classList.add('hidden')`) instead of
   the DOM `hidden` property on any element that has its own custom `display`.

7. **Clicking an already-checked `<input type="radio">` does not fire
   `change`** — standard native radio behavior, not a bug. This bites hardest
   during automated testing: if a size/option is already selected by default on
   page load, scripting a click on that exact same value again is a silent
   no-op. Click a different value first, then the target one, to guarantee a
   real state change.

## Related project

This feature is designed to also enhance
[shopify-bundle-selector](https://github.com/pteyo032/shopify-bundle-selector):
if that block is present and one or more units in a selected tier resolve to
an out-of-stock variant, `addToCart()` now collects every unavailable unit and
hands them to this popup instead of showing the generic "select all options"
error. The included `assets/bundle-selector.js` is the enhanced version — if
you already have the original bundle selector installed, diff before
overwriting.
