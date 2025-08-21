import { Component } from '@theme/component';
import { ThemeEvents, CartAddEvent, CartUpdateEvent } from '@theme/events';

/**
 * Cart Deposit Manager Component
 * Manages deposit product consistency in the cart drawer
 * Handles quantity synchronization, orphaned deposits, and cart state validation
 *
 * @typedef {object} CartDepositManagerRefs
 * @extends Component<CartDepositManagerRefs>
 */
class CartDepositManager extends Component {
  /** @type {AbortController} */
  #abortController = new AbortController();
  
  /** @type {boolean} */
  #isValidating = false;
  
  /** @type {number | undefined} */
  #validationTimeout;

  connectedCallback() {
    super.connectedCallback();
    
    const { signal } = this.#abortController;
    
    // Listen for cart updates from any source
    document.addEventListener(ThemeEvents.cartAdd, this.#handleCartUpdate, { signal });
    document.addEventListener(ThemeEvents.cartUpdate, this.#handleCartUpdate, { signal });
    document.addEventListener('cart:change', this.#handleCartChange, { signal });
    
    // Listen for quantity changes in cart items
    this.addEventListener('change', this.#handleQuantityChange.bind(this), { signal });
    
    // Initial validation
    this.#scheduleValidation();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.#abortController.abort();
    
    if (this.#validationTimeout) {
      clearTimeout(this.#validationTimeout);
    }
  }

  /**
   * Handle cart update events
   * @param {CartAddEvent | CartUpdateEvent} event 
   */
  #handleCartUpdate = (event) => {
    // Ignore events from our own validation to prevent loops
    if (event.detail?.source === 'deposit-manager') return;
    
    this.#scheduleValidation();
  };

  /**
   * Handle generic cart change events
   * @param {Event} event 
   */
  #handleCartChange = (event) => {
    this.#scheduleValidation();
  };

  /**
   * Handle quantity input changes
   * @param {Event} event 
   */
  #handleQuantityChange(event) {
    const target = event.target;
    
    // Check if this is a quantity input for a cart item
    if (target.type === 'number' && target.name && target.name.includes('updates')) {
      this.#scheduleValidation(500); // Slight delay for quantity updates
    }
  }

  /**
   * Schedule validation to avoid excessive API calls
   * @param {number} delay - Delay in milliseconds
   */
  #scheduleValidation(delay = 100) {
    if (this.#validationTimeout) {
      clearTimeout(this.#validationTimeout);
    }
    
    this.#validationTimeout = setTimeout(() => {
      this.#validateDepositConsistency();
    }, delay);
  }

  /**
   * Validate deposit consistency in the cart
   */
  async #validateDepositConsistency() {
    if (this.#isValidating) return;
    
    try {
      this.#isValidating = true;
      
      const cartData = await this.#getCartData();
      
      if (!cartData || !cartData.items || cartData.items.length === 0) {
        return; // Empty cart, nothing to validate
      }
      
      const depositItems = this.#findDepositItems(cartData.items);
      const mainProductItems = this.#findMainProductItems(cartData.items);
      
      // Handle quantity mismatches
      await this.#handleQuantityMismatches(depositItems, mainProductItems);
      
      // Remove orphaned deposits
      await this.#removeOrphanedDeposits(depositItems, mainProductItems);
      
      // Add missing deposits for new main products
      await this.#addMissingDeposits(depositItems, mainProductItems);
      
    } catch (error) {
      console.error('Cart deposit validation error:', error);
    } finally {
      this.#isValidating = false;
    }
  }

  /**
   * Handle quantity mismatches between main products and deposits
   * @param {Array} depositItems 
   * @param {Array} mainProductItems 
   */
  async #handleQuantityMismatches(depositItems, mainProductItems) {
    const updates = {};
    let needsUpdate = false;
    
    for (const depositItem of depositItems) {
      const linkedMain = this.#findLinkedMainProduct(mainProductItems, depositItem);
      
      if (linkedMain) {
        // Deposit quantity should always be 1 regardless of main product quantity
        if (depositItem.quantity !== 1) {
          updates[depositItem.key] = 1;
          needsUpdate = true;
        }
      }
    }
    
    if (needsUpdate) {
      await this.#updateCartItems(updates);
    }
  }

  /**
   * Remove orphaned deposit items (deposits without linked main products)
   * @param {Array} depositItems 
   * @param {Array} mainProductItems 
   */
  async #removeOrphanedDeposits(depositItems, mainProductItems) {
    const updates = {};
    let needsUpdate = false;
    
    for (const depositItem of depositItems) {
      const linkedMain = this.#findLinkedMainProduct(mainProductItems, depositItem);
      
      if (!linkedMain) {
        // Remove orphaned deposit
        updates[depositItem.key] = 0;
        needsUpdate = true;
        console.log(`Removing orphaned deposit: ${depositItem.id}`);
      }
    }
    
    if (needsUpdate) {
      await this.#updateCartItems(updates);
    }
  }

  /**
   * Add missing deposits for main products that should have deposits
   * @param {Array} depositItems 
   * @param {Array} mainProductItems 
   */
  async #addMissingDeposits(depositItems, mainProductItems) {
    for (const mainItem of mainProductItems) {
      // Check if this main product should have a deposit
      const shouldHaveDeposit = this.#shouldMainProductHaveDeposit(mainItem);
      
      if (shouldHaveDeposit) {
        // Check if deposit already exists
        const existingDeposit = this.#findDepositForMainProduct(depositItems, mainItem);
        
        if (!existingDeposit) {
          // Add missing deposit
          await this.#addMissingDepositForMainProduct(mainItem);
        }
      }
    }
  }

  /**
   * Check if a main product should have a deposit
   * @param {object} mainItem 
   * @returns {boolean}
   */
  #shouldMainProductHaveDeposit(mainItem) {
    if (!mainItem.properties) return false;
    
    const paymentOption = mainItem.properties.payment_option;
    const depositAmount = parseFloat(mainItem.properties.deposit_amount || '0');
    
    return paymentOption && 
           paymentOption !== 'return_first' && 
           depositAmount > 0;
  }

  /**
   * Add missing deposit for a main product
   * @param {object} mainItem 
   */
  async #addMissingDepositForMainProduct(mainItem) {
    try {
      const depositConfig = window.depositProductConfig;
      if (!depositConfig?.variants) {
        console.error('Deposit product configuration not found');
        return;
      }
      
      const paymentOption = mainItem.properties.payment_option;
      const depositAmount = mainItem.properties.deposit_amount;
      
      // Get the correct deposit variant
      let variantId;
      switch (paymentOption) {
        case 'credit_card_on_file':
          variantId = depositConfig.variants.creditCard.id;
          break;
        case 'pay_deposit':
          variantId = depositConfig.variants.payDeposit.id;
          break;
        default:
          return; // Invalid payment option
      }
      
      const formData = new FormData();
      formData.append('id', variantId);
      formData.append('quantity', '1');
      formData.append('properties[_deposit_product]', 'true');
      formData.append('properties[payment_option]', paymentOption);
      formData.append('properties[calculated_deposit_amount]', depositAmount);
      formData.append('properties[main_product_variant]', mainItem.variant_id.toString());
      
      // Add component data if available
      if (mainItem.properties.component_injectors) {
        formData.append('properties[component_injectors]', mainItem.properties.component_injectors);
      }
      if (mainItem.properties.component_fuel_lines) {
        formData.append('properties[component_fuel_lines]', mainItem.properties.component_fuel_lines);
      }
      if (mainItem.properties.component_fuel_pumps) {
        formData.append('properties[component_fuel_pumps]', mainItem.properties.component_fuel_pumps);
      }
      
      const response = await fetch(window.Theme.routes.cart_add_url, {
        method: 'POST',
        headers: { 'X-Requested-With': 'XMLHttpRequest' },
        body: formData
      });
      
      if (response.ok) {
        console.log(`Added missing deposit for main product: ${mainItem.id}`);
        // Dispatch event to update cart UI
        document.dispatchEvent(new CustomEvent('cart:change', {
          detail: { source: 'deposit-manager' }
        }));
      }
      
    } catch (error) {
      console.error('Failed to add missing deposit:', error);
    }
  }

  /**
   * Find deposit items in cart
   * @param {Array} cartItems 
   * @returns {Array}
   */
  #findDepositItems(cartItems) {
    return cartItems.filter(item =>
      item.properties && item.properties._deposit_product === 'true'
    );
  }

  /**
   * Find main product items in cart (non-deposit items)
   * @param {Array} cartItems 
   * @returns {Array}
   */
  #findMainProductItems(cartItems) {
    return cartItems.filter(item =>
      !item.properties || item.properties._deposit_product !== 'true'
    );
  }

  /**
   * Find the main product linked to a deposit item
   * @param {Array} mainProductItems 
   * @param {object} depositItem 
   * @returns {object|null}
   */
  #findLinkedMainProduct(mainProductItems, depositItem) {
    const mainVariantId = depositItem.properties?.main_product_variant;
    if (!mainVariantId) return null;
    
    return mainProductItems.find(item => 
      item.variant_id.toString() === mainVariantId
    );
  }

  /**
   * Find deposit item for a main product
   * @param {Array} depositItems 
   * @param {object} mainItem 
   * @returns {object|null}
   */
  #findDepositForMainProduct(depositItems, mainItem) {
    return depositItems.find(deposit =>
      deposit.properties?.main_product_variant === mainItem.variant_id.toString()
    );
  }

  /**
   * Update cart items with quantity changes
   * @param {object} updates - Object with item keys as keys and quantities as values
   */
  async #updateCartItems(updates) {
    try {
      const response = await fetch(window.Theme.routes.cart_update_url, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest'
        },
        body: JSON.stringify({ updates })
      });
      
      if (response.ok) {
        // Dispatch cart update event
        document.dispatchEvent(new CustomEvent('cart:change', {
          detail: { source: 'deposit-manager', updates }
        }));
      }
      
    } catch (error) {
      console.error('Failed to update cart items:', error);
    }
  }

  /**
   * Get current cart data
   * @returns {Promise<object>}
   */
  async #getCartData() {
    try {
      const response = await fetch('/cart.js', {
        headers: { 'X-Requested-With': 'XMLHttpRequest' }
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error('Failed to get cart data:', error);
      return null;
    }
  }
}

if (!customElements.get('cart-deposit-manager')) {
  customElements.define('cart-deposit-manager', CartDepositManager);
}

export { CartDepositManager };