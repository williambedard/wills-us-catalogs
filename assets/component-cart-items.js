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
  updateQuantity(config) {
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

    const body = JSON.stringify({
      line: line,
      quantity: quantity,
      sections: Array.from(sectionsToUpdate).join(','),
      sections_url: window.location.pathname,
    });

    cartTotal?.shimmer();

    fetch(`${Theme.routes.cart_change_url}`, fetchConfig('json', { body }))
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

        // Sync bundle quantities after successful cart update (with small delay to ensure cart state is consistent)
        setTimeout(() => {
          this.#syncBundleQuantities();
        }, 100);
      })
      .catch((error) => {
        console.error('Cart update failed:', error);
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
   * Syncs bundle quantities for deposit products.
   * Finds products with matching bundle_id and syncs deposit quantities to match main products.
   */
  async #syncBundleQuantities() {
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
        const bundleId = item.properties?._bundle_id;
        if (bundleId) {
          if (!bundles[bundleId]) {
            bundles[bundleId] = { main: null, deposit: null };
          }
          
          // Determine if this is main or deposit product based on _deposit_option or _is_deposit_product property
          if (item.properties?._deposit_option && item.properties?._is_deposit_product !== 'true') {
            bundles[bundleId].main = { item, lineNumber: index + 1 }; // Shopify cart lines are 1-indexed
          } else if (item.properties?._is_deposit_product === 'true') {
            bundles[bundleId].deposit = { item, lineNumber: index + 1 };
          }
        }
      });
      
      // Check each bundle for quantity mismatches and handle removals
      for (const [bundleId, bundle] of Object.entries(bundles)) {
        const { main, deposit } = bundle;
        
        if (main && deposit) {
          // Calculate what the deposit quantity should be based on main product quantity
          // We need to determine the original ratio between deposit and main product
          
          // Get the initial deposit amount per main product unit
          const depositAmountPerUnit = this.#calculateDepositPerUnit(deposit.item);
          const expectedDepositQuantity = main.item.quantity * depositAmountPerUnit;
          
          if (deposit.item.quantity !== expectedDepositQuantity) {
            // Update deposit quantity based on multiplier (including removal if main qty = 0)
            const body = JSON.stringify({
              line: deposit.lineNumber,
              quantity: expectedDepositQuantity,
              sections: this.sectionId,
              sections_url: window.location.pathname,
            });
            
            const changeResponse = await fetch('/cart/change.js', {
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
          
          // Update main product properties to reflect quantity multiplier
          await this.#updateMainProductProperties(main.item, main.lineNumber);
          
        } else if (!main && deposit) {
          // Remove orphaned deposit product
          console.log(`Removing orphaned deposit: line ${deposit.lineNumber}, bundle ${bundleId}`);
          const body = JSON.stringify({
            line: deposit.lineNumber,
            quantity: 0,
            sections: this.sectionId,
            sections_url: window.location.pathname,
          });
          
          const changeResponse = await fetch('/cart/change.js', {
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
          } else {
            console.error('Failed to remove orphaned deposit:', await changeResponse.text());
          }
        }
      }
    } catch (error) {
      console.error('Error syncing bundle quantities:', error);
    }
  }

  /**
   * Calculate the deposit quantity per main product unit based on the _calculated_amount property
   * @param {Object} depositItem - The deposit cart item
   * @returns {number} - The deposit quantity that should exist per main product unit
   */
  #calculateDepositPerUnit(depositItem) {
    // Get the calculated amount from deposit item properties (e.g., "$900.00")
    const calculatedAmount = depositItem.properties?._calculated_amount;
    if (!calculatedAmount) {
      // Fallback: assume 1:1 ratio if no calculated amount found
      return 1;
    }
    
    // Extract numeric amount (remove $ and convert to number)
    const depositAmountDollars = parseFloat(calculatedAmount.replace('$', '').replace(',', ''));
    
    // Calculate deposit quantity: amount / 100 (since deposit variants are $100 each)
    const depositQuantityPerUnit = depositAmountDollars / 100;
    
    return depositQuantityPerUnit;
  }

  /**
   * Updates main product properties to show multiplied quantities based on cart quantity
   * @param {Object} mainItem - The main cart item
   * @param {number} lineNumber - The line number in cart
   */
  async #updateMainProductProperties(mainItem, lineNumber) {
    // Get stored base values from hidden properties
    const baseInjectors = parseInt(mainItem.properties?._base_injectors || 0);
    const baseFuelPumps = parseInt(mainItem.properties?._base_fuel_pumps || 0);
    const baseFuelLines = parseInt(mainItem.properties?._base_fuel_lines || 0);
    
    if (baseInjectors === 0 && baseFuelPumps === 0 && baseFuelLines === 0) {
      return; // No metafield quantities to update
    }
    
    // Build updated properties
    const updatedProperties = { ...mainItem.properties };
    
    if (baseInjectors > 0) {
      updatedProperties['Injectors'] = `${baseInjectors * mainItem.quantity}`;
    }
    if (baseFuelPumps > 0) {
      updatedProperties['High Pressure Fuel Pumps'] = `${baseFuelPumps * mainItem.quantity} units`;
    }
    if (baseFuelLines > 0) {
      updatedProperties['Fuel Lines'] = `${baseFuelLines * mainItem.quantity}`;
    }
    
    // Check if properties actually need updating
    const needsUpdate = 
      (baseInjectors > 0 && updatedProperties['Injectors'] !== mainItem.properties?.Injectors) ||
      (baseFuelPumps > 0 && updatedProperties['High Pressure Fuel Pumps'] !== mainItem.properties?.['High Pressure Fuel Pumps']) ||
      (baseFuelLines > 0 && updatedProperties['Fuel Lines'] !== mainItem.properties?.['Fuel Lines']);
    
    if (needsUpdate) {
      const body = JSON.stringify({
        line: lineNumber,
        quantity: mainItem.quantity, // Keep same quantity
        properties: updatedProperties,
        sections: this.sectionId,
        sections_url: window.location.pathname,
      });
      
      const changeResponse = await fetch('/cart/change.js', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest'
        },
        body: body
      });
      
      if (changeResponse.ok) {
        const responseText = await changeResponse.text();
        const parsedResponse = JSON.parse(responseText);
        if (parsedResponse.sections && parsedResponse.sections[this.sectionId]) {
          morphSection(this.sectionId, parsedResponse.sections[this.sectionId]);
        }
      }
    }
  }

}

if (!customElements.get('cart-items-component')) {
  customElements.define('cart-items-component', CartItemsComponent);
}
