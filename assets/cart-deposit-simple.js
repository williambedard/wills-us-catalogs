/**
 * Simple Cart Deposit Handler
 * Automatically adds deposit products when main products are added to cart
 */

class SimpleCartDepositHandler {
  constructor() {
    this.depositProductId = '10712536842262'; // Refundable Core Deposit product ID
    this.processing = false;
    this.init();
  }

  init() {
    // Listen for original form submissions
    this.interceptFormSubmission();
  }

  interceptFormSubmission() {
    // Find all add to cart forms
    const forms = document.querySelectorAll('form[action*="/cart/add"]');
    
    forms.forEach(form => {
      form.addEventListener('submit', async (e) => {
        // Only intercept if this product needs a deposit
        const needsDeposit = form.querySelector('input[name="properties[needs_deposit]"]');
        if (!needsDeposit || this.processing) return;

        e.preventDefault();
        await this.handleDepositSubmission(form);
      });
    });
  }

  async handleDepositSubmission(form) {
    if (this.processing) return;
    this.processing = true;

    try {
      // Get form data
      const formData = new FormData(form);
      const depositAmount = formData.get('properties[deposit_amount]');
      const paymentOption = formData.get('properties[payment_option]');
      const mainVariantId = formData.get('id');

      // Add main product first
      const response1 = await fetch('/cart/add.js', {
        method: 'POST',
        body: formData
      });

      if (!response1.ok) {
        throw new Error('Failed to add main product');
      }

      // Add deposit product if payment option requires it
      if (paymentOption !== 'return_first' && parseFloat(depositAmount) > 0) {
        await this.addDepositProduct(depositAmount, paymentOption, mainVariantId);
      }

      // Redirect or trigger cart drawer
      if (window.theme && window.theme.cart) {
        window.theme.cart.refresh();
      } else {
        window.location.href = '/cart';
      }

    } catch (error) {
      console.error('Cart submission error:', error);
      alert('Error adding product to cart. Please try again.');
    } finally {
      this.processing = false;
    }
  }

  async addDepositProduct(amount, paymentOption, mainVariantId) {
    // Get deposit product variants
    const variants = await this.getDepositVariants();
    let selectedVariantId;

    // Select appropriate variant based on payment option
    switch (paymentOption) {
      case 'credit_card_on_file':
        selectedVariantId = variants.find(v => v.title.includes('Credit card'))?.id;
        break;
      case 'pay_deposit':
        selectedVariantId = variants.find(v => v.title.includes('Pay'))?.id;
        break;
      default:
        return; // No deposit needed
    }

    if (!selectedVariantId) {
      throw new Error('Deposit variant not found');
    }

    // Create deposit product form data
    const depositFormData = new FormData();
    depositFormData.append('id', selectedVariantId);
    depositFormData.append('quantity', '1');
    depositFormData.append('properties[_is_deposit]', 'true');
    depositFormData.append('properties[deposit_amount]', amount);
    depositFormData.append('properties[payment_option]', paymentOption);
    depositFormData.append('properties[linked_to_variant]', mainVariantId);

    // Add deposit to cart
    const response = await fetch('/cart/add.js', {
      method: 'POST',
      body: depositFormData
    });

    if (!response.ok) {
      throw new Error('Failed to add deposit product');
    }
  }

  async getDepositVariants() {
    // Cache variants to avoid repeated requests
    if (this.cachedVariants) {
      return this.cachedVariants;
    }

    try {
      const response = await fetch(`/products/refundable-core-deposit.js`);
      const product = await response.json();
      this.cachedVariants = product.variants;
      return this.cachedVariants;
    } catch (error) {
      console.error('Failed to get deposit variants:', error);
      return [];
    }
  }
}

// Initialize when page loads
document.addEventListener('DOMContentLoaded', () => {
  new SimpleCartDepositHandler();
});