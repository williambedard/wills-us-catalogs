import { Component } from '@theme/component';
import { fetchConfig, debounce, onAnimationEnd, prefersReducedMotion, resetShimmer } from '@theme/utilities';
import { morphSection, sectionRenderer } from '@theme/section-renderer';
import {
  ThemeEvents,
  CartUpdateEvent,
  QuantitySelectorUpdateEvent,
  CartAddEvent,
  DiscountUpdateEvent,
} from '@theme/events';
import { cartPerformance } from '@theme/performance';

/** @typedef {import('./utilities').TextComponent} TextComponent */

/**
 * A custom element that displays a cart items component.
 *
 * @typedef {object} Refs
 * @property {HTMLElement[]} quantitySelectors - The quantity selector elements.
 * @property {HTMLTableRowElement[]} cartItemRows - The cart item rows.
 * @property {TextComponent} cartTotal - The cart total.
 *
 * @extends {Component<Refs>}
 */
class CartItemsComponent extends Component {
  #debouncedOnChange = debounce(this.#onQuantityChange, 300).bind(this);

  connectedCallback() {
    super.connectedCallback();

    document.addEventListener(ThemeEvents.cartUpdate, this.#handleCartUpdate);
    document.addEventListener(ThemeEvents.discountUpdate, this.handleDiscountUpdate);
    document.addEventListener(ThemeEvents.quantitySelectorUpdate, this.#debouncedOnChange);
  }

  disconnectedCallback() {
    super.disconnectedCallback();

    document.removeEventListener(ThemeEvents.cartUpdate, this.#handleCartUpdate);
    document.removeEventListener(ThemeEvents.quantitySelectorUpdate, this.#debouncedOnChange);
  }

  /**
   * Handles QuantitySelectorUpdateEvent change event.
   * @param {QuantitySelectorUpdateEvent} event - The event.
   */
  #onQuantityChange(event) {
    const { quantity, cartLine: line } = event.detail;

    if (!line) return;

    if (quantity === 0) {
      return this.onLineItemRemove(line);
    }

    this.updateQuantity({
      line,
      quantity,
      action: 'change',
    });
    const lineItemRow = this.refs.cartItemRows[line - 1];

    if (!lineItemRow) return;

    const textComponent = /** @type {TextComponent | undefined} */ (lineItemRow.querySelector('text-component'));
    textComponent?.shimmer();
  }

  /**
   * Handles the line item removal.
   * @param {number} line - The line item index.
   */
  onLineItemRemove(line) {
    this.updateQuantity({
      line,
      quantity: 0,
      action: 'clear',
    });

    const cartItemRowToRemove = this.refs.cartItemRows[line - 1];

    if (!cartItemRowToRemove) return;

    const rowsToRemove = [
      cartItemRowToRemove,
      // Get all nested lines of the row to remove
      ...this.refs.cartItemRows.filter((row) => row.dataset.parentKey === cartItemRowToRemove.dataset.key),
    ];

    // Add class to the row to trigger the animation
    rowsToRemove.forEach((row) => {
      const remove = () => row.remove();

      if (prefersReducedMotion()) return remove();

      row.style.setProperty('--row-height', `${row.clientHeight}px`);
      row.classList.add('removing');

      // Remove the row after the animation ends
      onAnimationEnd(row, remove);
    });
  }

  /**
   * Updates the quantity.
   * @param {Object} config - The config.
   * @param {number} config.line - The line.
   * @param {number} config.quantity - The quantity.
   * @param {string} config.action - The action.
   */
  async updateQuantity(config) {
    const cartPerformaceUpdateMarker = cartPerformance.createStartingMarker(`${config.action}:user-action`);

    this.#disableCartItems();

    const { line, quantity } = config;
    const { cartTotal } = this.refs;

    const cartItemsComponents = document.querySelectorAll('cart-items-component');
    const sectionsToUpdate = new Set([this.sectionId]);
    cartItemsComponents.forEach((item) => {
      if (item instanceof HTMLElement && item.dataset.sectionId) {
        sectionsToUpdate.add(item.dataset.sectionId);
      }
    });

    try {
      // Get the cart item key for the line
      const cartResponse = await fetch('/cart.js');
      const cart = await cartResponse.json();
      const cartItem = cart.items[line - 1]; // line is 1-indexed, array is 0-indexed
      
      if (!cartItem) {
        console.error('Cart item not found for line:', line);
        this.#enableCartItems();
        return;
      }

      const updates = {};
      updates[cartItem.key] = quantity;

      const body = JSON.stringify({
        updates: updates,
        sections: Array.from(sectionsToUpdate).join(','),
        sections_url: window.location.pathname,
      });

      cartTotal?.shimmer();

      const response = await fetch(`${Theme.routes.cart_update_url}`, fetchConfig('json', { body }));
      const responseText = await response.text();
      .then((response) => {
        return response.text();
      })
      .then((responseText) => {
        const parsedResponseText = JSON.parse(responseText);

        resetShimmer(this);

        if (parsedResponseText.errors) {
          this.#handleCartError(line, parsedResponseText);
          return;
        }

        const newSectionHTML = new DOMParser().parseFromString(
          parsedResponseText.sections[this.sectionId],
          'text/html'
        );

        // Grab the new cart item count from a hidden element
        const newCartHiddenItemCount = newSectionHTML.querySelector('[ref="cartItemCount"]')?.textContent;
        const newCartItemCount = newCartHiddenItemCount ? parseInt(newCartHiddenItemCount, 10) : 0;

        this.dispatchEvent(
          new CartUpdateEvent({}, this.sectionId, {
            itemCount: newCartItemCount,
            source: 'cart-items-component',
            sections: parsedResponseText.sections,
          })
        );

        morphSection(this.sectionId, parsedResponseText.sections[this.sectionId]);

        // Bundle quantity sync is now handled by cart-deposit-manager.js
        // this.#syncBundleQuantities();
      })
      .catch((error) => {
        console.error(error);
      })
      .finally(() => {
        this.#enableCartItems();
        cartPerformance.measureFromMarker(cartPerformaceUpdateMarker);
      });
  }

  /**
   * Handles the discount update.
   * @param {DiscountUpdateEvent} event - The event.
   */
  handleDiscountUpdate = (event) => {
    this.#handleCartUpdate(event);
  };

  /**
   * Handles the cart error.
   * @param {number} line - The line.
   * @param {Object} parsedResponseText - The parsed response text.
   * @param {string} parsedResponseText.errors - The errors.
   */
  #handleCartError = (line, parsedResponseText) => {
    const quantitySelector = this.refs.quantitySelectors[line - 1];
    const quantityInput = quantitySelector?.querySelector('input');

    if (!quantityInput) throw new Error('Quantity input not found');

    quantityInput.value = quantityInput.defaultValue;

    const cartItemError = this.refs[`cartItemError-${line}`];
    const cartItemErrorContainer = this.refs[`cartItemErrorContainer-${line}`];

    if (!(cartItemError instanceof HTMLElement)) throw new Error('Cart item error not found');
    if (!(cartItemErrorContainer instanceof HTMLElement)) throw new Error('Cart item error container not found');

    cartItemError.textContent = parsedResponseText.errors;
    cartItemErrorContainer.classList.remove('hidden');
  };

  /**
   * Handles the cart update.
   *
   * @param {DiscountUpdateEvent | CartUpdateEvent | CartAddEvent} event
   */
  #handleCartUpdate = (event) => {
    if (event instanceof DiscountUpdateEvent) {
      sectionRenderer.renderSection(this.sectionId, { cache: false });
      return;
    }
    if (event.target === this) return;

    const cartItemsHtml = event.detail.data.sections?.[this.sectionId];
    if (cartItemsHtml) {
      morphSection(this.sectionId, cartItemsHtml);
    } else {
      sectionRenderer.renderSection(this.sectionId, { cache: false });
    }
  };

  /**
   * Disables the cart items.
   */
  #disableCartItems() {
    this.classList.add('cart-items-disabled');
  }

  /**
   * Enables the cart items.
   */
  #enableCartItems() {
    this.classList.remove('cart-items-disabled');
  }

  /**
   * Gets the section id.
   * @returns {string} The section id.
   */
  get sectionId() {
    const { sectionId } = this.dataset;

    if (!sectionId) throw new Error('Section id missing');

    return sectionId;
  }

  /**
   * DISABLED: Bundle sync now handled by cart-deposit-manager.js
   * This method was causing conflicts with the main deposit manager
   */
  async #syncBundleQuantities() {
    // Disabled - cart-deposit-manager.js handles all bundle sync logic
    return;
    try {
      // Get current cart using Shopify AJAX Cart API
      const cartResponse = await fetch('/cart.js');
      if (!cartResponse.ok) {
        throw new Error('Failed to fetch cart');
      }
      const cart = await cartResponse.json();
      
      // Group items by bundle_id
      const bundles = {};
      cart.items.forEach((item, index) => {
        const bundleId = item.properties?.bundle_id;
        if (bundleId) {
          if (!bundles[bundleId]) {
            bundles[bundleId] = { main: null, deposit: null };
          }
          
          // Determine if this is main or deposit product based on _deposit_option or _is_deposit property
          if (item.properties?._deposit_option) {
            bundles[bundleId].main = { item, key: item.key };
          } else if (item.properties?._is_deposit === 'true') {
            bundles[bundleId].deposit = { item, key: item.key };
          }
        }
      });
      
      // Check each bundle for quantity mismatches and handle removals
      for (const [bundleId, bundle] of Object.entries(bundles)) {
        const { main, deposit } = bundle;
        
        if (main && deposit) {
          // Calculate required deposit quantity based on deposit amount and main product quantity
          const depositUnitAmount = parseFloat(deposit.item.properties?._deposit_unit_amount || '0');
          const totalDepositAmount = depositUnitAmount * main.item.quantity;
          const requiredDepositQuantity = Math.ceil(totalDepositAmount / 100);
          
          if (deposit.item.quantity !== requiredDepositQuantity) {
            // Update deposit quantity only - properties stay the same
            const updates = {};
            updates[deposit.key] = requiredDepositQuantity;
            
            const updateResponse = await fetch('/cart/update.js', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'X-Requested-With': 'XMLHttpRequest'
              },
              body: JSON.stringify({
                updates: updates,
                sections: this.sectionId,
                sections_url: window.location.pathname,
              })
            });

            if (updateResponse.ok) {
              // Re-render this section to reflect changes
              const responseText = await updateResponse.text();
              const parsedResponse = JSON.parse(responseText);
              if (parsedResponse.sections && parsedResponse.sections[this.sectionId]) {
                morphSection(this.sectionId, parsedResponse.sections[this.sectionId]);
              }
            }
          }
        } else if (!main && deposit) {
          // Remove orphaned deposit product
          const updates = {};
          updates[deposit.key] = 0;
          
          const body = JSON.stringify({
            updates: updates,
            sections: this.sectionId,
            sections_url: window.location.pathname,
          });
          
          const changeResponse = await fetch('/cart/update.js', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Requested-With': 'XMLHttpRequest'
            },
            body: body
          });
          
          if (changeResponse.ok) {
            // Re-render this section to reflect the change
            const responseText = await changeResponse.text();
            const parsedResponse = JSON.parse(responseText);
            if (parsedResponse.sections && parsedResponse.sections[this.sectionId]) {
              morphSection(this.sectionId, parsedResponse.sections[this.sectionId]);
            }
          }
        }
      }
    } catch (error) {
      console.error('Error syncing bundle quantities:', error);
    }
  }

}

if (!customElements.get('cart-items-component')) {
  customElements.define('cart-items-component', CartItemsComponent);
}
