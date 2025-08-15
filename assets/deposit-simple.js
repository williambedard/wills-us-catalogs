/**
 * Simple Deposit Calculator
 * Handles variant selection and deposit calculation for Injectors Direct
 */

// Configuration - can be moved to theme settings later
const DEPOSIT_CONFIG = {
  rates: {
    injectors: 100,
    fuel_lines: 100, 
    fuel_pumps: 200
  },
  depositProductHandle: 'refundable-core-deposit'
};

class SimpleDepositCalculator {
  constructor() {
    this.currentDeposit = 0;
    this.selectedPaymentOption = null;
    this.init();
  }

  init() {
    // Listen for variant changes
    document.addEventListener('variant:change', (e) => {
      this.handleVariantChange(e.detail);
    });

    // Listen for payment option changes  
    document.addEventListener('change', (e) => {
      if (e.target.name === 'payment_option') {
        this.selectedPaymentOption = e.target.value;
        this.updateFormData();
      }
    });

    // Handle initial variant if present
    this.checkInitialVariant();
  }

  handleVariantChange(variant) {
    if (!variant) {
      this.hideDepositOptions();
      return;
    }

    // Calculate deposit based on variant metafields
    const deposit = this.calculateDeposit(variant);
    this.currentDeposit = deposit;
    
    if (deposit > 0) {
      this.showDepositOptions(deposit);
    } else {
      this.hideDepositOptions();
    }
  }

  calculateDeposit(variant) {
    // Get metafields from variant or window data
    const metafields = this.getVariantMetafields(variant);
    if (!metafields) return 0;

    const injectors = parseInt(metafields.injectors) || 0;
    const fuelLines = parseInt(metafields.fuel_lines) || 0; 
    const fuelPumps = parseInt(metafields.fuel_pumps) || 0;

    return (injectors * DEPOSIT_CONFIG.rates.injectors) +
           (fuelLines * DEPOSIT_CONFIG.rates.fuel_lines) +
           (fuelPumps * DEPOSIT_CONFIG.rates.fuel_pumps);
  }

  getVariantMetafields(variant) {
    // Try window.productMetafields first (set by theme)
    if (window.productMetafields && window.productMetafields[variant.id]) {
      return window.productMetafields[variant.id];
    }

    // Try variant.metafields if available
    if (variant.metafields) {
      return {
        injectors: variant.metafields['custom.number_of_injectors'] || 0,
        fuel_lines: variant.metafields['custom.number_of_fuel_lines'] || 0,
        fuel_pumps: variant.metafields['custom.number_of_high_pressure_fuel_pumps_for_deposit'] || 0
      };
    }

    return null;
  }

  showDepositOptions(amount) {
    // Update deposit amount displays
    document.querySelectorAll('.deposit-amount').forEach(el => {
      el.textContent = `$${amount.toFixed(2)}`;
    });

    document.querySelectorAll('.deposit-total').forEach(el => {
      el.textContent = amount.toFixed(2);
    });

    // Show deposit section
    const depositSection = document.querySelector('.deposit-calculator');
    if (depositSection) {
      depositSection.style.display = 'block';
      
      // Auto-select first option if none selected
      if (!this.selectedPaymentOption) {
        const firstOption = depositSection.querySelector('input[name="payment_option"]');
        if (firstOption) {
          firstOption.checked = true;
          this.selectedPaymentOption = firstOption.value;
          this.updateFormData();
        }
      }
    }
  }

  hideDepositOptions() {
    const depositSection = document.querySelector('.deposit-calculator');
    if (depositSection) {
      depositSection.style.display = 'none';
    }
    this.currentDeposit = 0;
    this.selectedPaymentOption = null;
  }

  updateFormData() {
    // Add deposit data to product form for cart submission
    const form = document.querySelector('form[action*="/cart/add"]');
    if (!form) return;

    // Remove existing deposit inputs
    form.querySelectorAll('input[name*="deposit"]').forEach(input => input.remove());

    if (this.currentDeposit > 0 && this.selectedPaymentOption) {
      // Add deposit amount
      const amountInput = document.createElement('input');
      amountInput.type = 'hidden';
      amountInput.name = 'properties[deposit_amount]';
      amountInput.value = this.currentDeposit;
      form.appendChild(amountInput);

      // Add payment option
      const optionInput = document.createElement('input');
      optionInput.type = 'hidden';
      optionInput.name = 'properties[payment_option]';
      optionInput.value = this.selectedPaymentOption;
      form.appendChild(optionInput);

      // Add flag for cart processing
      const flagInput = document.createElement('input');
      flagInput.type = 'hidden';
      flagInput.name = 'properties[needs_deposit]';
      flagInput.value = 'true';
      form.appendChild(flagInput);
    }
  }

  checkInitialVariant() {
    // Check if there's already a selected variant
    const variantInput = document.querySelector('input[name="id"]');
    if (variantInput && variantInput.value && window.productMetafields) {
      const variantId = variantInput.value;
      const metafields = window.productMetafields[variantId];
      if (metafields) {
        this.handleVariantChange({ id: variantId, metafields });
      }
    }
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    new SimpleDepositCalculator();
  });
} else {
  new SimpleDepositCalculator();
}