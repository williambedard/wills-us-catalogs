import { Component } from '@theme/component';
import { onAnimationEnd } from '@theme/utilities';
import { ThemeEvents, CartUpdateEvent } from '@theme/events';

/**
 * A custom element that displays a cart icon.
 *
 * @extends {Component}
 */
class CartIcon extends Component {
  requiredRefs = [];

  /** @type {number} */
  get currentCartCount() {
    return parseInt(sessionStorage.getItem('cart-count-value') ?? '0', 10);
  }

  set currentCartCount(value) {
    sessionStorage.setItem('cart-count-value', String(value));
  }

  connectedCallback() {
    super.connectedCallback();

    document.addEventListener(ThemeEvents.cartUpdate, this.onCartUpdate);
  }

  disconnectedCallback() {
    super.disconnectedCallback();

    document.removeEventListener(ThemeEvents.cartUpdate, this.onCartUpdate);
  }

  /**
   * Handles the cart update event.
   * @param {CartUpdateEvent} event - The cart update event.
   */
  onCartUpdate = async (event) => {
    const itemCount = event.detail.data?.itemCount ?? 0;
    const comingFromProductForm = event.detail.data?.source === 'product-form-component';

    this.updateCartCount(itemCount, comingFromProductForm);
  };

  /**
   * Updates the cart count.
   * @param {number} itemCount - The number of items in the cart.
   * @param {boolean} comingFromProductForm - Whether the cart update is coming from the product form.
   */
  updateCartCount = async (itemCount, comingFromProductForm) => {
    // If the cart update is coming from the product form, we add to the current cart count, otherwise we set the new cart count
    this.currentCartCount = comingFromProductForm ? this.currentCartCount + itemCount : itemCount;

    this.classList.toggle('header-actions__cart-icon--has-cart', itemCount > 0);

    sessionStorage.setItem(
      'cart-count',
      JSON.stringify({
        value: String(this.currentCartCount),
        timestamp: Date.now(),
      })
    );
  };

}

if (!customElements.get('cart-icon')) {
  customElements.define('cart-icon', CartIcon);
}
