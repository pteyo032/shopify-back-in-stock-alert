import { Component } from '@theme/component';
import { fetchConfig } from '@theme/utilities';
import { BundleTierChangeEvent } from '@theme/events';
import { CartLinesUpdateEvent, CartErrorEvent, StandardEvents } from '@shopify/events';

/**
 * Renders a "buy more, save more" tier picker with per-unit variant selectors.
 * Adds every unit in the selected tier to the cart as its own line item in a
 * single request, tagged with a shared `_bundle_id` property.
 *
 * @typedef {object} BundleSelectorRefs
 * @property {HTMLElement} tierList
 * @property {HTMLLabelElement[]} [tierLabels]
 * @property {HTMLInputElement[]} [tierRadios]
 * @property {HTMLElement[]} [unitLists]
 * @property {HTMLSelectElement[]} [unitSelects]
 * @property {HTMLButtonElement} addToCartButton
 * @property {HTMLElement} [addToCartButtonText]
 * @property {HTMLElement} [errorMessage]
 * @property {HTMLElement} liveRegion
 * @property {HTMLScriptElement} [variantsData]
 *
 * @extends {Component<BundleSelectorRefs>}
 */
class BundleSelectorComponent extends Component {
  requiredRefs = ['tierList', 'addToCartButton', 'liveRegion'];

  /** @type {Array<{id: number, available: boolean, options: string[], price: number}>} */
  #variants = [];

  #abortController = new AbortController();

  connectedCallback() {
    super.connectedCallback();
    this.#parseVariants();
    this.#resolveAllUnits();

    const target = this.closest('.shopify-section, dialog, product-card');
    target?.addEventListener(StandardEvents.productSelect, this.#onProductSelect, {
      signal: this.#abortController.signal,
    });
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.#abortController.abort();
  }

  /**
   * Parses the embedded product variants JSON once on connect.
   */
  #parseVariants() {
    try {
      this.#variants = JSON.parse(this.refs.variantsData?.textContent || '[]');
    } catch (error) {
      console.error('[bundle-selector] Failed to parse variant data:', error);
      this.#variants = [];
    }
  }

  /**
   * Resolves the initial variant for every unit currently in the DOM
   * (both tiers ship server-rendered default option selections).
   */
  #resolveAllUnits() {
    for (const container of this.querySelectorAll('.bundle-tier__unit-options')) {
      this.#resolveUnitVariant(container);
    }
  }

  /**
   * When the page's native variant picker selects a new variant, apply the
   * same option combination to every unit across every tier, so the bundle
   * stays in sync with whatever the customer was just browsing.
   * @param {import('@shopify/events').ProductSelectEvent} event
   */
  #onProductSelect = async (event) => {
    try {
      const { detail } = await event.promise;
      const options = detail?.resource?.options;
      if (!Array.isArray(options) || options.length === 0) return;

      for (const container of this.querySelectorAll('.bundle-tier__unit-options')) {
        const selects = /** @type {HTMLSelectElement[]} */ (
          Array.from(container.querySelectorAll('select[data-option-position]')).sort(
            (a, b) => Number(a.dataset.optionPosition) - Number(b.dataset.optionPosition)
          )
        );

        selects.forEach((select, index) => {
          const value = options[index];
          if (value && Array.from(select.options).some((option) => option.value === value)) {
            select.value = value;
          }
        });

        this.#resolveUnitVariant(/** @type {HTMLElement} */ (container));
      }
    } catch (error) {
      if (error?.name !== 'AbortError') console.warn('[bundle-selector] productSelect sync failed:', error);
    }
  };

  /**
   * Handles a tier radio selection change: toggles the selected state and
   * shows only the newly selected tier's per-unit selector rows.
   * @param {Event} event
   */
  onTierChange(event) {
    const radio = /** @type {HTMLInputElement} */ (event.target);
    const selectedTierId = radio.value;

    for (const label of this.refs.tierLabels || []) {
      label.classList.toggle('bundle-tier--selected', label.dataset.tierId === selectedTierId);
    }

    for (const unitList of this.refs.unitLists || []) {
      unitList.classList.toggle('hidden', unitList.dataset.tierId !== selectedTierId);
    }

    this.#clearError();
    this.#notifyTierChange(radio);
  }

  /**
   * Notifies listeners (e.g. the sticky add-to-cart bar, which has no native
   * concept of a bundle tier) of the newly selected tier's label and price,
   * read directly from the already-rendered tier markup so the display logic
   * (discount math, formatting) stays in one place.
   * @param {HTMLInputElement} radio
   */
  #notifyTierChange(radio) {
    const tierContainer = radio.closest('.bundle-tier');
    const tierPrice = tierContainer?.querySelector('.bundle-tier__price-current')?.textContent?.trim() ?? '';
    const tierSubtitle = tierContainer?.querySelector('.bundle-tier__subtitle')?.textContent?.trim() ?? '';

    this.dispatchEvent(new BundleTierChangeEvent(radio.dataset.tierLabel ?? '', tierPrice, tierSubtitle));
  }

  /**
   * Handles a per-unit option dropdown change: re-resolves that unit's variant.
   * @param {Event} event
   */
  onUnitOptionChange(event) {
    const select = /** @type {HTMLSelectElement} */ (event.target);
    const container = select.closest('.bundle-tier__unit-options');
    if (!(container instanceof HTMLElement)) return;

    this.#resolveUnitVariant(container);
    this.#clearError();
  }

  /**
   * Matches a unit's currently selected option values against the embedded
   * variants array and stores the result as data attributes on the container.
   * @param {HTMLElement} container
   * @returns {{id: number, available: boolean, options: string[], price: number} | undefined}
   */
  #resolveUnitVariant(container) {
    const selects = Array.from(container.querySelectorAll('select[data-option-position]')).sort(
      (a, b) => Number(a.dataset.optionPosition) - Number(b.dataset.optionPosition)
    );
    const selectedValues = selects.map((select) => /** @type {HTMLSelectElement} */ (select).value);

    const match = this.#variants.find((variant) => {
      const options = variant.options || [];
      return options.length === selectedValues.length && options.every((value, index) => value === selectedValues[index]);
    });

    for (const select of selects) {
      select.toggleAttribute('data-unavailable', !!match && !match.available);
    }

    if (match) {
      container.dataset.variantId = String(match.id);
      container.dataset.variantAvailable = String(match.available);
    } else {
      delete container.dataset.variantId;
      container.dataset.variantAvailable = 'false';
    }

    this.#updateUnitImage(container, match);

    return match;
  }

  /**
   * Swaps a unit's thumbnail to the resolved variant's own image, if it has one.
   * @param {HTMLElement} container
   * @param {{featured_image?: {src: string}} | undefined} match
   */
  #updateUnitImage(container, match) {
    const image = container.closest('.bundle-tier__unit')?.querySelector('.bundle-tier__unit-image');
    if (!(image instanceof HTMLImageElement)) return;

    const src = match?.featured_image?.src;
    if (src) image.src = `${src}&width=100`;
  }

  /** @returns {HTMLInputElement | undefined} */
  #getSelectedTierRadio() {
    return (this.refs.tierRadios || []).find((radio) => radio.checked);
  }

  /**
   * Gathers the resolved variant id for every unit in the currently selected
   * tier and submits them as one multi-item add-to-cart request.
   */
  addToCart() {
    this.#clearError();

    const radio = this.#getSelectedTierRadio();
    if (!radio) return;

    const unitCount = Number(radio.dataset.unitCount) || 1;
    const hasOnlyDefaultVariant = this.dataset.hasOnlyDefaultVariant === 'true';
    const tierId = radio.value;
    const tierLabel = radio.dataset.tierLabel || '';
    const bundleId = crypto.randomUUID();

    /** @type {Array<{id: number, quantity: number, properties: Record<string, string>}>} */
    const items = [];

    if (hasOnlyDefaultVariant) {
      const defaultVariant = this.#variants[0];
      if (!defaultVariant) {
        this.#showError(this.dataset.unavailableText || '');
        return;
      }
      if (!defaultVariant.available) {
        this.#notifyUnavailable([defaultVariant]);
        return;
      }
      for (let i = 0; i < unitCount; i += 1) {
        items.push({
          id: defaultVariant.id,
          quantity: 1,
          properties: { _bundle_id: bundleId, _bundle_tier: tierLabel },
        });
      }
    } else {
      const unitList = (this.refs.unitLists || []).find((el) => el.dataset.tierId === tierId);
      const unitContainers = unitList ? Array.from(unitList.querySelectorAll('.bundle-tier__unit-options')) : [];

      /** @type {Array<{id: number, available: boolean, title?: string, featured_image?: {src: string}}>} */
      const unavailable = [];

      for (const container of unitContainers) {
        const match = this.#resolveUnitVariant(/** @type {HTMLElement} */ (container));
        if (!match) {
          // Incomplete selection (no variant resolves for the chosen options at all) —
          // distinct from "out of stock", keep the existing generic message for this case.
          this.#showError(this.dataset.selectOptionsText || '');
          return;
        }
        if (!match.available) {
          unavailable.push(match);
          continue;
        }
        items.push({
          id: match.id,
          quantity: 1,
          properties: { _bundle_id: bundleId, _bundle_tier: tierLabel },
        });
      }

      if (unavailable.length > 0) {
        this.#notifyUnavailable(unavailable);
        return;
      }
    }

    if (items.length === 0) return;

    this.#submitItems(items);
  }

  /**
   * Routes to the page's back-in-stock-alert popup (if present) instead of the
   * generic "unavailable" error, so the customer can leave their email for every
   * out-of-stock unit in one go. Falls back to the original error message when
   * no such block has been added to this product page.
   *
   * @param {Array<{id: number, title?: string, featured_image?: {src: string}}>} unavailableVariants
   */
  #notifyUnavailable(unavailableVariants) {
    const alert = document.querySelector('back-in-stock-alert-component');
    const productTitle = this.dataset.productTitle || '';

    if (alert && typeof (/** @type {any} */ (alert).showForUnavailableItems) === 'function') {
      /** @type {any} */ (alert).showForUnavailableItems(
        unavailableVariants.map((variant) => ({
          variantId: variant.id,
          variantTitle: variant.title,
          productTitle,
          imageSrc: variant.featured_image?.src,
        }))
      );
      return;
    }

    this.#showError(this.dataset.unavailableText || '');
  }

  /**
   * @param {Array<{id: number, quantity: number, properties: Record<string, string>}>} items
   */
  #submitItems(items) {
    const { addToCartButton } = this.refs;
    addToCartButton.setAttribute('aria-disabled', 'true');
    addToCartButton.disabled = true;

    const cartItemsComponents = document.querySelectorAll('cart-items-component');
    const sectionIds = /** @type {string[]} */ ([]);
    cartItemsComponents.forEach((item) => {
      if (item instanceof HTMLElement && item.dataset.sectionId) sectionIds.push(item.dataset.sectionId);
    });

    const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);
    const deferredEventPromise = CartLinesUpdateEvent.createPromise();

    this.dispatchEvent(
      new CartLinesUpdateEvent({
        action: 'add',
        context: 'bundle',
        lines: items.map((item) => ({ merchandiseId: String(item.id), quantity: item.quantity })),
        promise: deferredEventPromise.promise,
      })
    );

    const payload = { items, sections: sectionIds.join(',') };
    const fetchCfg = fetchConfig('json', { body: JSON.stringify(payload) });

    fetch(Theme.routes.cart_add_url, fetchCfg)
      .then((response) => response.json())
      .then(async (response) => {
        if (response.status) {
          this.#showError(response.message || this.dataset.unavailableText || '');

          this.dispatchEvent(
            new CartErrorEvent({
              error: response.message || 'Add to cart failed',
              code: 'INVALID',
              detail: { description: response.description, errors: response.errors },
            })
          );

          deferredEventPromise.reject(new Error(response.message || 'Add to cart failed'));
          return;
        }

        this.#setLiveRegionText(this.dataset.addedText || '');

        const cart = await this.#refreshCart();
        deferredEventPromise.resolve({
          cart: CartLinesUpdateEvent.createCartFromAjaxResponse(cart),
          detail: {
            items: cart.items,
            source: 'bundle-selector-component',
            sourceId: this.id || '',
            itemCount: totalQuantity,
            sections: response.sections,
            didError: false,
          },
        });
      })
      .catch((error) => {
        console.error('[bundle-selector] Add to cart failed:', error);
        this.#showError(this.dataset.unavailableText || '');
        deferredEventPromise.reject(error);

        this.dispatchEvent(
          new CartErrorEvent({
            error: error?.message || 'Network error during add to cart',
            code: 'SERVICE_UNAVAILABLE',
          })
        );
      })
      .finally(() => {
        addToCartButton.removeAttribute('aria-disabled');
        addToCartButton.disabled = false;
      });
  }

  #refreshCart() {
    const cartItemsComponent = document.querySelector('cart-items-component');

    if (cartItemsComponent) {
      return customElements
        .whenDefined('cart-items-component')
        .then(() => /** @type {any} */ (cartItemsComponent).fetchCartData());
    }

    return fetch(`${Theme.routes.cart_url}.json`, {
      headers: { Accept: 'application/json' },
      credentials: 'same-origin',
    }).then((response) => {
      if (!response.ok) throw new Error(`Failed to fetch cart: ${response.status}`);
      return response.json();
    });
  }

  /** @param {string} message */
  #showError(message) {
    const { errorMessage } = this.refs;
    if (!errorMessage || !message) return;

    errorMessage.textContent = message;
    errorMessage.classList.remove('hidden');
    this.#setLiveRegionText(message);
  }

  #clearError() {
    const { errorMessage } = this.refs;
    if (!errorMessage) return;

    errorMessage.classList.add('hidden');
    errorMessage.textContent = '';
  }

  /** @param {string} text */
  #setLiveRegionText(text) {
    this.refs.liveRegion.textContent = text;
  }
}

if (!customElements.get('bundle-selector-component')) {
  customElements.define('bundle-selector-component', BundleSelectorComponent);
}
