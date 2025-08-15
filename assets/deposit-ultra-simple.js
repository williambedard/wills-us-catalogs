/**
 * Ultra Simple Deposit Calculator
 * Uses MONEY metafields directly - no calculation needed
 */

class UltraSimpleDeposit {
  constructor() {
    this.currentDeposit = 0;
    this.selectedPaymentOption = null;
    this.depositProductHandle = 'refundable-core-deposit';
    this.init();
  }

  init() {
    // Update deposit on page load with first available variant
    this.updateDepositOnLoad();
    
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
  }

  updateDepositOnLoad() {
    // Get initial variant from page
    const variantInput = document.querySelector('input[name="id"]');
    if (variantInput && variantInput.value && window.productMetafields) {
      const variantId = variantInput.value;
      const variant = { id: variantId };
      this.handleVariantChange(variant);
    }
  }

  handleVariantChange(variant) {
    if (!variant || !variant.id) {
      this.hideDepositOptions();
      return;
    }

    // Get deposit amount from MONEY metafields
    const depositAmount = this.getDepositFromMetafields(variant.id);
    this.currentDeposit = depositAmount;
    
    if (depositAmount > 0) {
      this.showDepositOptions(depositAmount);
      // Update deposit product prices immediately
      this.updateDepositProductPrices(depositAmount);
    } else {
      this.hideDepositOptions();
    }
  }

  getDepositFromMetafields(variantId) {
    const metafields = window.productMetafields && window.productMetafields[variantId];
    if (!metafields) return 0;

    // Sum all deposit amounts (already in dollar amounts from MONEY fields)
    const fuelPumpDeposit = parseFloat(metafields.fuel_pump_deposit) || 0;
    const injectorDeposit = parseFloat(metafields.injector_deposit) || 0;
    const fuelLineDeposit = parseFloat(metafields.fuel_line_deposit) || 0;

    return fuelPumpDeposit + injectorDeposit + fuelLineDeposit;
  }

  showDepositOptions(amount) {
    // Update all deposit amount displays
    document.querySelectorAll('.deposit-amount').forEach(el => {
      el.textContent = `$${amount.toFixed(2)}`;
    });

    document.querySelectorAll('.deposit-total').forEach(el => {
      el.textContent = amount.toFixed(2);
    });

    // Show deposit calculator section
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
    // Add deposit data to main product form
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

  async updateDepositProductPrices(amount) {
    // For demo: Cart Transform Function handles pricing
    console.log(`Deposit amount updated to: $${amount}`);
  }
}

// Initialize when page loads
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    new UltraSimpleDeposit();
  });
} else {
  new UltraSimpleDeposit();
}