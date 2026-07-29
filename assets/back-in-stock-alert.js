import { DialogComponent, DialogCloseEvent } from '@theme/dialog';
import { StandardEvents } from '@shopify/events';

/**
 * Opens automatically when the customer selects a product variant that is out of
 * stock, letting them leave an email to be notified when it's back. Availability
 * is computed server-side in Liquid (same source of truth as blocks/buy-buttons.liquid)
 * and simply read here — this component never re-derives it in JS.
 *
 * Also exposes `showForUnavailableItems()`, called directly by
 * assets/bundle-selector.js when "Add to cart" fails because one or more units
 * of a bundle tier resolved to an unavailable variant — shown as a single popup
 * listing every unavailable item, one email covers all of them.
 *
 * Storing signups and sending the actual notification email is delegated to the
 * Notify Me! app's API (see #submitToNotifyMe — a stub until the app is installed
 * and its API docs are available, see feature.md "Needs Client Clarification").
 *
 * @typedef {object} Refs
 * @property {HTMLDialogElement} dialog
 * @property {HTMLFormElement} form
 * @property {HTMLElement} productSingle
 * @property {HTMLImageElement} productImage
 * @property {HTMLElement} productTitle
 * @property {HTMLElement} [variantTitle]
 * @property {HTMLElement} [productList]
 * @property {HTMLTemplateElement} [itemTemplate]
 * @property {HTMLInputElement} emailInput
 * @property {HTMLInputElement} consentCheckbox
 * @property {HTMLButtonElement} submitButton
 * @property {HTMLElement} [errorMessage]
 * @property {HTMLElement} [confirmationMessage]
 * @property {HTMLButtonElement} [continueShoppingButton]
 * @property {HTMLElement} [liveRegion]
 *
 * @extends {DialogComponent<Refs>}
 */
export class BackInStockAlertComponent extends DialogComponent {
  requiredRefs = ['dialog', 'form', 'productSingle', 'emailInput', 'consentCheckbox', 'submitButton'];

  /** @type {Element | null} */
  #section = null;

  /** Variant IDs the pending submission covers — one for a normal selection, several for a bundle. */
  /** @type {string[]} */
  #pendingVariantIds = [];

  connectedCallback() {
    super.connectedCallback();

    this.#section = this.closest('.shopify-section, dialog');
    this.#section?.addEventListener(StandardEvents.productSelect, this.#handleProductSelect);
    this.addEventListener(DialogCloseEvent.eventName, this.#resetForm);
  }

  disconnectedCallback() {
    super.disconnectedCallback();

    this.#section?.removeEventListener(StandardEvents.productSelect, this.#handleProductSelect);
    this.removeEventListener(DialogCloseEvent.eventName, this.#resetForm);
  }

  /**
   * Handles the theme-wide variant selection event. The updated HTML is fetched
   * and rendered by Liquid (same as any other component reacting to this event),
   * so availability/title/image here are already correct — no guessing at a
   * variant JSON shape in JS.
   *
   * @param {import('@shopify/events').ProductSelectEvent} event
   */
  #handleProductSelect = (event) => {
    if (!(event.target instanceof Element) || event.target.closest('product-card')) return;

    event.promise
      .then(({ detail }) => {
        if (!detail?.html) return;
        if (detail.productId && detail.productId !== this.dataset.productId) return;

        const updated = detail.html.getElementById(this.id);
        if (!updated) return;

        this.#syncFromFetchedContent(updated);
      })
      .catch((error) => {
        if (error?.name !== 'AbortError') console.warn('[back-in-stock-alert] Event promise rejected:', error);
      });
  };

  /**
   * Copies the relevant bits from the freshly-fetched (never connected to the
   * document) version of this component into the live one, then opens or closes
   * the dialog based on the new variant's availability.
   *
   * @param {Element} source
   */
  #syncFromFetchedContent(source) {
    const isAvailable = source.getAttribute('data-available') === 'true';

    if (isAvailable) {
      if (this.refs.dialog.open) this.closeDialog();
      return;
    }

    const sourceImage = source.querySelector('[ref="productImage"]');
    const sourceProductTitle = source.querySelector('[ref="productTitle"]');
    const sourceVariantTitle = source.querySelector('[ref="variantTitle"]');
    const sourceVariantId = source.getAttribute('data-variant-id');

    if (sourceImage instanceof HTMLImageElement && this.refs.productImage) {
      this.refs.productImage.src = sourceImage.src;
      this.refs.productImage.alt = sourceImage.alt;
      this.refs.productImage.hidden = sourceImage.hidden;
    }

    if (sourceProductTitle) this.refs.productTitle.textContent = sourceProductTitle.textContent;

    if (this.refs.variantTitle) {
      this.refs.variantTitle.textContent = sourceVariantTitle?.textContent ?? '';
    }

    this.#pendingVariantIds = sourceVariantId ? [sourceVariantId] : [];

    this.#showSingleItemView();
    this.#resetForm();
    this.showDialog();
  }

  /**
   * Called externally by bundle-selector.js when "Add to cart" fails because
   * one or more bundle units resolved to an unavailable variant. Shows every
   * unavailable item in one popup, covered by a single email submission.
   *
   * @param {Array<{ variantId: string|number, variantTitle?: string, productTitle: string, imageSrc?: string }>} items
   */
  showForUnavailableItems(items) {
    if (!items?.length) return;

    this.#pendingVariantIds = items.map((item) => String(item.variantId));
    this.#renderItemList(items);
    this.#showListView();
    this.#resetForm();
    this.showDialog();
  }

  /** @param {Array<{ variantTitle?: string, productTitle: string, imageSrc?: string }>} items */
  #renderItemList(items) {
    const { productList, itemTemplate } = this.refs;
    if (!productList || !(itemTemplate instanceof HTMLTemplateElement)) return;

    productList.replaceChildren();

    for (const item of items) {
      const row = /** @type {DocumentFragment} */ (itemTemplate.content.cloneNode(true));
      const image = row.querySelector('.back-in-stock-alert__image');
      const productTitleEl = row.querySelector('.back-in-stock-alert__product-title');
      const variantTitleEl = row.querySelector('.back-in-stock-alert__variant-title');

      if (image instanceof HTMLImageElement) {
        if (item.imageSrc) {
          image.src = item.imageSrc;
          image.hidden = false;
        }
      }

      if (productTitleEl) productTitleEl.textContent = item.productTitle;

      if (variantTitleEl) {
        // Simple products default to a variant titled "Default Title" — not meaningful to show.
        const variantTitle = item.variantTitle && item.variantTitle !== 'Default Title' ? item.variantTitle : '';
        variantTitleEl.textContent = variantTitle;
        variantTitleEl.hidden = !variantTitle;
      }

      productList.append(row);
    }
  }

  #showSingleItemView() {
    this.refs.productSingle.classList.remove('hidden');
    this.refs.productList?.classList.add('hidden');
  }

  #showListView() {
    this.refs.productSingle.classList.add('hidden');
    this.refs.productList?.classList.remove('hidden');
  }

  /** @param {Event} event */
  handleSubmit = async (event) => {
    event.preventDefault();

    const { form, emailInput } = this.refs;
    if (!form.reportValidity()) return;

    this.#setSubmitting(true);

    try {
      await this.#submitToNotifyMe({ email: emailInput.value, variantIds: this.#pendingVariantIds });
      this.#showConfirmation();
    } catch (error) {
      console.error('[back-in-stock-alert] Submission failed:', error);
      this.#showError();
    } finally {
      this.#setSubmitting(false);
    }
  };

  /**
   * TEMPORARY: simulates a successful signup for demo purposes — no request is
   * actually sent anywhere yet. Replace with the real Notify Me! API call once
   * the app is installed and its developer docs are available. Never put a
   * secret/Admin API key here — only a public storefront-facing key, if the
   * app provides one.
   *
   * @param {{ email: string, variantIds: string[] }} payload
   * @returns {Promise<void>}
   */
  async #submitToNotifyMe(payload) {
    console.warn('[back-in-stock-alert] Notify Me! is not connected yet — simulating success for demo purposes.', payload);
  }

  /** @param {boolean} isSubmitting */
  #setSubmitting(isSubmitting) {
    this.refs.submitButton.disabled = isSubmitting;
    this.refs.submitButton.toggleAttribute('aria-busy', isSubmitting);
  }

  #showConfirmation() {
    const { form, confirmationMessage, continueShoppingButton, errorMessage, liveRegion } = this.refs;

    form.classList.add('hidden');
    errorMessage?.classList.add('hidden');
    confirmationMessage?.classList.remove('hidden');
    continueShoppingButton?.classList.remove('hidden');

    if (liveRegion) liveRegion.textContent = confirmationMessage?.textContent?.trim() ?? '';
  }

  #showError() {
    const { errorMessage, liveRegion } = this.refs;

    errorMessage?.classList.remove('hidden');

    if (liveRegion) liveRegion.textContent = errorMessage?.textContent?.trim() ?? '';
  }

  #resetForm = () => {
    const { form, confirmationMessage, continueShoppingButton, errorMessage } = this.refs;

    form.classList.remove('hidden');
    form.reset();
    confirmationMessage?.classList.add('hidden');
    continueShoppingButton?.classList.add('hidden');
    errorMessage?.classList.add('hidden');
  };
}

if (!customElements.get('back-in-stock-alert-component')) {
  customElements.define('back-in-stock-alert-component', BackInStockAlertComponent);
}
