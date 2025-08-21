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
  #scheduleValidation(delay = 500) {
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
        console.log('Cart is empty, skipping deposit validation');
        return; // Empty cart, nothing to validate
      }
      
      console.log('=== DEPOSIT MANAGER VALIDATION ===');
      console.log('Total cart items:', cartData.items.length);
      
      const depositItems = this.#findDepositItems(cartData.items);
      const mainProductItems = this.#findMainProductItems(cartData.items);
      
      console.log('Deposit items found:', depositItems.length);
      console.log('Main product items found:', mainProductItems.length);
      
      depositItems.forEach(item => {
        console.log('Deposit item:', {
          id: item.id,
          key: item.key,
          bundle_id: item.properties?.bundle_id,
          quantity: item.quantity
        });
      });
      
      mainProductItems.forEach(item => {
        console.log('Main product:', {
          id: item.id,
          key: item.key,
          bundle_id: item.properties?.bundle_id,
          quantity: item.quantity,
          title: item.product?.title
        });
      });
      
      // Handle quantity mismatches
      await this.#handleQuantityMismatches(depositItems, mainProductItems);
      
      // Remove orphaned deposits
      await this.#removeOrphanedDeposits(depositItems, mainProductItems);
      
      // Add missing deposits for new main products
      await this.#addMissingDeposits(depositItems, mainProductItems);
      
      console.log('=== END DEPOSIT VALIDATION ===');
      
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
        // Calculate required deposit quantity based on deposit amount and main product quantity
        const requiredDepositQuantity = this.#calculateRequiredDepositQuantity(depositItem, linkedMain);
        
        if (depositItem.quantity !== requiredDepositQuantity) {
          console.log(`Updating deposit item ${depositItem.id}, key: ${depositItem.key}, from qty ${depositItem.quantity} to ${requiredDepositQuantity}`);
          updates[depositItem.key] = requiredDepositQuantity;
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
        console.warn(`Removing deposit ${depositItem.id} - no linked main product found with bundle_id: ${depositItem.properties?.bundle_id}`);
        updates[depositItem.key] = 0;
        needsUpdate = true;
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
    // Disabled: Missing deposits are now handled by the PDP logic
    // This prevents duplicate deposits and ensures proper metafield calculation
  }

  /**
   * Check if a main product should have a deposit
   * @param {object} mainItem 
   * @returns {boolean}
   */
  #shouldMainProductHaveDeposit(mainItem) {
    if (!mainItem.properties) return false;
    
    const depositOption = mainItem.properties._deposit_option;
    
    return depositOption && 
           depositOption !== 'return_cores_in_advance';
  }

  /**
   * Add missing deposit for a main product
   * @param {object} mainItem 
   */
  async #addMissingDepositForMainProduct(mainItem) {
    // Disabled: Missing deposits are now handled by the PDP logic
    // This method was causing POST errors and is no longer needed
  }

  /**
   * Calculate required deposit quantity based on deposit amount and main product quantity
   * @param {object} depositItem 
   * @param {object} mainItem 
   * @returns {number}
   */
  #calculateRequiredDepositQuantity(depositItem, mainItem) {
    // Get the deposit unit amount (per main product)
    const depositUnitAmount = parseFloat(depositItem.properties?._deposit_unit_amount || '0');
    const mainProductQuantity = mainItem.quantity;
    
    // Calculate total deposit amount needed
    const totalDepositAmount = depositUnitAmount * mainProductQuantity;
    
    // Calculate deposit quantity: total amount divided by $100 unit price
    const requiredDepositQuantity = Math.ceil(totalDepositAmount / 100);
    
    return Math.max(1, requiredDepositQuantity); // Ensure at least 1
  }

  /**
   * Find deposit items in cart
   * @param {Array} cartItems 
   * @returns {Array}
   */
  #findDepositItems(cartItems) {
    return cartItems.filter(item =>
      item.properties && item.properties._is_deposit === 'true'
    );
  }

  /**
   * Find main product items in cart (non-deposit items)
   * @param {Array} cartItems 
   * @returns {Array}
   */
  #findMainProductItems(cartItems) {
    return cartItems.filter(item =>
      !item.properties || item.properties._is_deposit !== 'true'
    );
  }

  /**
   * Find the main product linked to a deposit item
   * @param {Array} mainProductItems 
   * @param {object} depositItem 
   * @returns {object|null}
   */
  #findLinkedMainProduct(mainProductItems, depositItem) {
    const bundleId = depositItem.properties?.bundle_id;
    if (!bundleId) {
      console.warn('Deposit item has no bundle_id:', depositItem.id);
      return null;
    }
    
    const linkedMain = mainProductItems.find(item => 
      item.properties?.bundle_id === bundleId
    );
    
    if (!linkedMain) {
      console.warn(`No main product found for bundle_id ${bundleId}. Available main products:`, 
        mainProductItems.map(item => ({ id: item.id, bundle_id: item.properties?.bundle_id, _deposit_option: item.properties?._deposit_option }))
      );
    }
    
    return linkedMain;
  }

  /**
   * Find deposit item for a main product
   * @param {Array} depositItems 
   * @param {object} mainItem 
   * @returns {object|null}
   */
  #findDepositForMainProduct(depositItems, mainItem) {
    const bundleId = mainItem.properties?.bundle_id;
    if (!bundleId) return null;
    
    return depositItems.find(deposit =>
      deposit.properties?.bundle_id === bundleId
    );
  }

  /**
   * Update cart items with quantity changes
   * @param {object} updates - Object with item keys as keys and quantities as values
   */
  async #updateCartItems(updates) {
    try {
      console.log('Sending cart update with:', { updates });
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