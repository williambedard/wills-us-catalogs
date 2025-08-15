import { Component } from '@theme/component';
import { ThemeEvents, VariantUpdateEvent } from '@theme/events';

/**
 * Deposit Calculator Component
 * Calculates and displays core deposit pricing based on product variant metafields
 *
 * @typedef {object} DepositCalculatorRefs
 * @property {HTMLElement} depositDisplay - The deposit display container
 * @property {HTMLElement} depositAmount - The deposit amount display
 * @property {HTMLElement} paymentOptions - The payment options container
 * @property {HTMLElement} errorDisplay - The error display container
 * @extends Component<DepositCalculatorRefs>
 */
class DepositCalculator extends Component {
  requiredRefs = ['depositDisplay'];
  
  /** @type {AbortController} */
  #abortController = new AbortController();
  
  /** @type {object | null} */
  currentVariant = null;
  
  /** @type {number} */
  depositAmount = 0;
  
  /** @type {boolean} */
  isCalculating = false;

  /** @type {string | null} */
  selectedPaymentOption = null;

  /** Deposit rates per component */
  static DEPOSIT_RATES = {
    injectors: 100,        // $100 per injector
    fuel_lines: 100,       // $100 per fuel line set
    fuel_pumps: 200        // $200 per pump
  };

  /** Deposit product configuration */
  static DEPOSIT_PRODUCT_CONFIG = {
    handle: 'refundable-core-deposit',
    productId: '10712536842262'
  };

  connectedCallback() {
    super.connectedCallback();
    
    const { signal } = this.#abortController;
    const target = this.closest('.shopify-section, dialog, product-card');
    
    // Listen for variant changes
    target?.addEventListener(ThemeEvents.variantUpdate, this.#onVariantUpdate, { signal });
    target?.addEventListener(ThemeEvents.variantSelected, this.#onVariantSelected, { signal });
    
    // Listen for payment option changes
    this.addEventListener('change', this.#handlePaymentOptionChange.bind(this));
    
    // Initialize with current variant if available
    this.#initializeWithCurrentVariant();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.#abortController.abort();
  }

  /**
   * Initialize calculator with current variant from page
   */
  #initializeWithCurrentVariant() {
    const productData = window.productData;
    if (productData && productData.selected_or_first_available_variant) {
      this.currentVariant = productData.selected_or_first_available_variant;
      this.#calculateAndDisplayDeposit();
    }
  }

  /**
   * Handle variant update events
   * @param {VariantUpdateEvent} event 
   */
  #onVariantUpdate = (event) => {
    if (event.detail.resource) {
      this.currentVariant = event.detail.resource;
      this.#calculateAndDisplayDeposit();
    }
  };

  /**
   * Handle variant selection (disable while updating)
   */
  #onVariantSelected = () => {
    this.#showLoadingState(true);
  };

  /**
   * Calculate and display deposit based on current variant
   */
  async #calculateAndDisplayDeposit() {
    if (this.isCalculating) return;
    
    try {
      this.isCalculating = true;
      this.#clearError();
      this.#showLoadingState(false);
      
      if (!this.currentVariant?.id) {
        this.depositAmount = 0;
        this.#updateDepositDisplay();
        return;
      }

      // Get metafields from current variant
      const metafields = this.#getVariantMetafields(this.currentVariant);
      
      if (!metafields || Object.keys(metafields).length === 0) {
        this.depositAmount = 0;
        this.#updateDepositDisplay();
        return;
      }

      // Extract component counts from metafields
      const injectors = parseInt(metafields.injectors) || 0;
      const fuelLines = parseInt(metafields.fuel_lines) || 0;
      const fuelPumps = parseInt(metafields.fuel_pumps) || 0;

      // Calculate deposit using business rules
      this.depositAmount = this.#calculateDeposit(injectors, fuelLines, fuelPumps);

      // Update UI
      this.#updateDepositDisplay();
      this.#togglePaymentOptions(this.depositAmount > 0);
      
      // Notify product form component
      this.#notifyProductForm();
      
    } catch (error) {
      this.#showError('Unable to calculate deposit');
      console.error('Deposit calculation error:', error);
    } finally {
      this.isCalculating = false;
    }
  }

  /**
   * Get variant metafields for deposit calculation
   * @param {object} variant 
   * @returns {object|null}
   */
  #getVariantMetafields(variant) {
    // Try to get from window.productMetafields first (for theme compatibility)
    if (window.productMetafields && window.productMetafields[variant.id]) {
      return window.productMetafields[variant.id];
    }
    
    // Try to get from variant metafields directly
    if (variant.metafields) {
      const metafields = {};
      
      // Map the actual metafield keys to our expected format
      const metafieldMappings = {
        'custom.number_of_injectors': 'injectors',
        'custom.number_of_fuel_lines': 'fuel_lines', 
        'custom.number_of_high_pressure_fuel_pumps_for_deposit': 'fuel_pumps'
      };
      
      for (const [key, value] of Object.entries(metafieldMappings)) {
        if (variant.metafields[key]) {
          metafields[value] = variant.metafields[key];
        }
      }
      
      return Object.keys(metafields).length > 0 ? metafields : null;
    }
    
    return null;
  }

  /**
   * Calculate deposit amount based on component counts
   * @param {number} injectors 
   * @param {number} fuelLines 
   * @param {number} fuelPumps 
   * @returns {number}
   */
  #calculateDeposit(injectors, fuelLines, fuelPumps) {
    const rates = DepositCalculator.DEPOSIT_RATES;
    return (injectors * rates.injectors) + 
           (fuelLines * rates.fuel_lines) + 
           (fuelPumps * rates.fuel_pumps);
  }

  /**
   * Update deposit display in UI
   */
  #updateDepositDisplay() {
    const depositDisplay = this.refs.depositDisplay;
    const depositAmount = this.refs.depositAmount;
    
    if (this.depositAmount > 0) {
      if (depositAmount) {
        depositAmount.textContent = `$${this.depositAmount.toFixed(2)}`;
      }
      depositDisplay.classList.remove('hidden');
      
      // Update all deposit total displays
      this.querySelectorAll('.deposit-total').forEach(el => {
        el.textContent = this.depositAmount.toFixed(2);
      });
    } else {
      depositDisplay.classList.add('hidden');
    }
  }

  /**
   * Toggle payment options visibility
   * @param {boolean} show 
   */
  #togglePaymentOptions(show) {
    const paymentOptions = this.refs.paymentOptions;
    
    if (!paymentOptions) return;
    
    paymentOptions.classList.toggle('hidden', !show);

    if (show) {
      // Default to first option
      const firstOption = paymentOptions.querySelector('input[type="radio"]');
      if (firstOption && !this.selectedPaymentOption) {
        firstOption.checked = true;
        this.selectedPaymentOption = firstOption.value;
        this.#notifyProductForm();
      }
    }
  }

  /**
   * Handle payment option changes
   * @param {Event} event 
   */
  #handlePaymentOptionChange(event) {
    if (event.target.type === 'radio' && event.target.name === 'payment_option') {
      this.selectedPaymentOption = event.target.value;
      this.#notifyProductForm();
    }
  }

  /**
   * Notify product form component of deposit data
   */
  #notifyProductForm() {
    const productForm = document.querySelector('product-form-component') || 
                      document.querySelector('[data-type="add-to-cart-form"]')?.closest('*');
    
    if (productForm) {
      // Create custom event with deposit data
      const depositDataEvent = new CustomEvent('deposit:update', {
        detail: {
          depositAmount: this.depositAmount,
          paymentOption: this.selectedPaymentOption,
          componentData: this.#getComponentData(),
          depositProductConfig: DepositCalculator.DEPOSIT_PRODUCT_CONFIG
        }
      });
      
      productForm.dispatchEvent(depositDataEvent);
    }
  }

  /**
   * Get component data for the current variant
   * @returns {object}
   */
  #getComponentData() {
    if (!this.currentVariant?.id) return {};
    
    const metafields = this.#getVariantMetafields(this.currentVariant);
    if (!metafields) return {};
    
    return {
      injectors: metafields.injectors?.toString() || '0',
      fuel_lines: metafields.fuel_lines?.toString() || '0',
      fuel_pumps: metafields.fuel_pumps?.toString() || '0'
    };
  }

  /**
   * Show loading state
   * @param {boolean} loading 
   */
  #showLoadingState(loading) {
    const depositDisplay = this.refs.depositDisplay;
    const paymentOptions = this.refs.paymentOptions;
    
    if (loading) {
      depositDisplay?.classList.add('calculating');
      paymentOptions?.classList.add('calculating');
    } else {
      depositDisplay?.classList.remove('calculating');
      paymentOptions?.classList.remove('calculating');
    }
  }

  /**
   * Show error message
   * @param {string} message 
   */
  #showError(message) {
    const errorDisplay = this.refs.errorDisplay;
    if (errorDisplay) {
      const errorMessage = errorDisplay.querySelector('.error-message');
      if (errorMessage) {
        errorMessage.textContent = message;
      }
      errorDisplay.classList.remove('hidden');
    }
  }

  /**
   * Clear error message
   */
  #clearError() {
    const errorDisplay = this.refs.errorDisplay;
    if (errorDisplay) {
      errorDisplay.classList.add('hidden');
    }
  }
}

if (!customElements.get('deposit-calculator')) {
  customElements.define('deposit-calculator', DepositCalculator);
}

export { DepositCalculator };