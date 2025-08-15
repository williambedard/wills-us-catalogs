import { Component } from '@theme/component';
import { fetchConfig } from '@theme/utilities';
import { ThemeEvents, CartAddEvent, CartErrorEvent } from '@theme/events';

/**
 * Enhanced Product Form Component that handles deposit products
 * Extends the standard product form to automatically add deposit products to cart
 * 
 * @typedef {object} ProductDepositFormRefs
 * @property {HTMLFormElement} form - The product form element
 * @property {HTMLElement} addToCartButtonContainer - The add to cart button container
 * @property {HTMLElement} liveRegion - Live region for screen readers
 * @property {HTMLElement | undefined} addToCartTextError - Error message display
 * @extends Component<ProductDepositFormRefs>
 */
class ProductDepositForm extends Component {
  requiredRefs = ['form', 'addToCartButtonContainer', 'liveRegion'];
  
  /** @type {AbortController} */
  #abortController = new AbortController();
  
  /** @type {boolean} */
  isSubmitting = false;
  
  /** @type {object | null} */
  depositData = null;
  
  /** @type {number | undefined} */
  #timeout;

  connectedCallback() {
    super.connectedCallback();
    
    const { signal } = this.#abortController;
    
    // Listen for deposit calculator updates
    this.addEventListener('deposit:update', this.#onDepositUpdate, { signal });
    
    // Listen for form submission
    this.refs.form.addEventListener('submit', this.#onSubmitHandler.bind(this), { signal });
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.#abortController.abort();
    
    if (this.#timeout) clearTimeout(this.#timeout);
  }

  /**
   * Handle deposit data updates from calculator
   * @param {CustomEvent} event 
   */
  #onDepositUpdate = (event) => {
    this.depositData = event.detail;
  };

  /**
   * Handle form submission with deposit logic
   * @param {Event} event 
   */
  async #onSubmitHandler(event) {
    event.preventDefault();
    
    const submitButton = this.refs.addToCartButtonContainer?.refs?.addToCartButton;
    if (this.isSubmitting || submitButton?.getAttribute('disabled') === 'true') {
      return;
    }

    // Get main product form data
    const mainFormData = new FormData(this.refs.form);
    const mainVariantId = mainFormData.get('id');

    if (!mainVariantId) {
      this.#handleError(new Error('No variant selected'));
      return;
    }

    try {
      this.#setLoadingState(true);
      
      // Add main product first
      const mainProductResult = await this.#addMainProduct(mainFormData);
      
      // Add deposit product if needed
      if (this.#shouldAddDeposit()) {
        await this.#addDepositProduct(mainVariantId);
      }

      // Handle successful add
      this.#handleSuccessfulAdd(mainProductResult);

    } catch (error) {
      console.error('Error adding products:', error);
      this.#handleError(error);
    } finally {
      this.#setLoadingState(false);
    }
  }

  /**
   * Check if deposit should be added
   * @returns {boolean}
   */
  #shouldAddDeposit() {
    return this.depositData && 
           this.depositData.depositAmount > 0 && 
           this.depositData.paymentOption && 
           this.depositData.paymentOption !== 'return_first';
  }

  /**
   * Add main product to cart with deposit properties
   * @param {FormData} formData 
   * @returns {Promise<object>}
   */
  async #addMainProduct(formData) {
    // Add deposit-related properties to main product
    if (this.depositData) {
      formData.append('properties[payment_option]', this.depositData.paymentOption || '');
      formData.append('properties[deposit_amount]', this.depositData.depositAmount.toString());
      
      if (this.depositData.componentData) {
        formData.append('properties[component_injectors]', this.depositData.componentData.injectors || '0');
        formData.append('properties[component_fuel_lines]', this.depositData.componentData.fuel_lines || '0');
        formData.append('properties[component_fuel_pumps]', this.depositData.componentData.fuel_pumps || '0');
      }
    }

    // Add cart items sections for auto-update
    const cartItemsComponents = document.querySelectorAll('cart-items-component');
    let cartItemComponentsSectionIds = [];
    cartItemsComponents.forEach((item) => {
      if (item instanceof HTMLElement && item.dataset.sectionId) {
        cartItemComponentsSectionIds.push(item.dataset.sectionId);
      }
      formData.append('sections', cartItemComponentsSectionIds.join(','));
    });

    const fetchCfg = fetchConfig('javascript', { body: formData });

    const response = await fetch(window.Theme.routes.cart_add_url, {
      ...fetchCfg,
      headers: {
        ...fetchCfg.headers,
        Accept: 'text/html',
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const result = await response.json();
    
    if (result.status) {
      throw new Error(result.message || 'Failed to add main product');
    }
    
    return result;
  }

  /**
   * Add deposit product to cart
   * @param {string} mainVariantId 
   * @returns {Promise<object>}
   */
  async #addDepositProduct(mainVariantId) {
    const depositConfig = this.depositData.depositProductConfig;
    if (!depositConfig?.variants) {
      throw new Error('Deposit product configuration not found');
    }

    // Get the correct deposit variant based on payment option
    let variantId;
    switch (this.depositData.paymentOption) {
      case 'credit_card_on_file':
        variantId = depositConfig.variants.creditCard.id;
        break;
      case 'pay_deposit':
        variantId = depositConfig.variants.payDeposit.id;
        break;
      default:
        throw new Error('Invalid payment option');
    }

    const formData = new FormData();
    formData.append('id', variantId);
    formData.append('quantity', '1');
    formData.append('properties[_deposit_product]', 'true');
    formData.append('properties[payment_option]', this.depositData.paymentOption);
    formData.append('properties[calculated_deposit_amount]', this.depositData.depositAmount.toString());
    formData.append('properties[main_product_variant]', mainVariantId);
    
    // Add component data to deposit product
    if (this.depositData.componentData) {
      formData.append('properties[component_injectors]', this.depositData.componentData.injectors || '0');
      formData.append('properties[component_fuel_lines]', this.depositData.componentData.fuel_lines || '0');
      formData.append('properties[component_fuel_pumps]', this.depositData.componentData.fuel_pumps || '0');
    }

    const response = await fetch(window.Theme.routes.cart_add_url, {
      method: 'POST',
      headers: { 'X-Requested-With': 'XMLHttpRequest' },
      body: formData
    });

    if (!response.ok) {
      // Try to remove main product if deposit fails
      await this.#rollbackMainProduct();
      throw new Error(`Failed to add deposit product: ${response.status}`);
    }
    
    const result = await response.json();
    
    if (result.status) {
      // Try to remove main product if deposit fails
      await this.#rollbackMainProduct();
      throw new Error(result.message || 'Failed to add deposit product');
    }
    
    return result;
  }

  /**
   * Rollback main product addition if deposit fails
   */
  async #rollbackMainProduct() {
    try {
      // Get current cart to find the just-added item
      const cartData = await this.#getCartData();
      const lastItem = cartData.items[cartData.items.length - 1];
      
      if (lastItem) {
        const updates = {};
        updates[lastItem.key] = 0;
        
        await fetch(window.Theme.routes.cart_update_url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ updates })
        });
      }
    } catch (rollbackError) {
      console.error('Failed to rollback main product:', rollbackError);
    }
  }

  /**
   * Get current cart data
   * @returns {Promise<object>}
   */
  async #getCartData() {
    const response = await fetch('/cart.js');
    if (!response.ok) throw new Error('Failed to get cart data');
    return response.json();
  }

  /**
   * Set loading state of the form
   * @param {boolean} loading 
   */
  #setLoadingState(loading) {
    this.isSubmitting = loading;
    const submitButton = this.refs.addToCartButtonContainer?.refs?.addToCartButton;
    
    if (!submitButton) return;
    
    if (loading) {
      submitButton.setAttribute('disabled', 'true');
      submitButton.classList.add('loading');
      
      // Update button text if it has loading text
      const textContent = submitButton.querySelector('.add-to-cart-text__content');
      if (textContent) {
        const loadingText = submitButton.dataset.loadingText || 'Adding...';
        submitButton.dataset.originalText = textContent.textContent;
        textContent.textContent = loadingText;
      }
    } else {
      submitButton.setAttribute('disabled', 'false');
      submitButton.classList.remove('loading');
      
      // Restore button text
      const textContent = submitButton.querySelector('.add-to-cart-text__content');
      if (textContent && submitButton.dataset.originalText) {
        textContent.textContent = submitButton.dataset.originalText;
        delete submitButton.dataset.originalText;
      }
    }
  }

  /**
   * Handle successful product addition
   * @param {object} result 
   */
  #handleSuccessfulAdd(result) {
    // Clear any existing errors
    this.#clearError();
    
    // Set live region for screen readers
    const successMessage = 'Products added to cart';
    this.#setLiveRegionText(successMessage);
    
    // Dispatch cart add event
    this.dispatchEvent(
      new CartAddEvent({}, this.id, {
        source: 'product-deposit-form',
        itemCount: 1,
        productId: this.dataset.productId,
        sections: result.sections,
        didAddDeposit: this.#shouldAddDeposit()
      })
    );
    
    // Clear live region after delay
    setTimeout(() => {
      this.#clearLiveRegionText();
    }, 5000);
  }

  /**
   * Handle errors during form submission
   * @param {Error} error 
   */
  #handleError(error) {
    console.error('Product form error:', error);
    
    const { addToCartTextError } = this.refs;
    const errorMessage = error.message || 'Failed to add products to cart';
    
    // Display error in UI
    if (addToCartTextError) {
      addToCartTextError.classList.remove('hidden');
      
      // Reuse the text node if it exists
      const textNode = addToCartTextError.childNodes[2];
      if (textNode) {
        textNode.textContent = errorMessage;
      } else {
        const newTextNode = document.createTextNode(errorMessage);
        addToCartTextError.appendChild(newTextNode);
      }
    }

    // Set live region for screen readers
    this.#setLiveRegionText(errorMessage);

    // Dispatch error event
    this.dispatchEvent(
      new CartErrorEvent(this.refs.form.getAttribute('id') || '', errorMessage, error.message, [])
    );

    // Auto-hide error after delay
    this.#timeout = setTimeout(() => {
      this.#clearError();
    }, 10000);
  }

  /**
   * Clear error display
   */
  #clearError() {
    const { addToCartTextError } = this.refs;
    if (addToCartTextError) {
      addToCartTextError.classList.add('hidden');
    }
    this.#clearLiveRegionText();
  }

  /**
   * Set live region text for screen readers
   * @param {string} text 
   */
  #setLiveRegionText(text) {
    this.refs.liveRegion.textContent = text;
  }

  /**
   * Clear live region text
   */
  #clearLiveRegionText() {
    this.refs.liveRegion.textContent = '';
  }
}

if (!customElements.get('product-deposit-form')) {
  customElements.define('product-deposit-form', ProductDepositForm);
}

export { ProductDepositForm };