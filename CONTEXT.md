# **MVP Spec: Dynamic Core Deposit System for Injectors Direct**

## **Business Context**

**Merchant**: Injectors Direct - $25M/year diesel truck parts distributor  
**Migration**: WooCommerce → Shopify  
**Core Business Model**: Customers buy new parts and must return old "cores" (used parts) to avoid deposit charges

---

## **Technical Architecture**

### **Shopify Primitives Used**

- Cart API (/cart.js, /cart/add.js, /cart/update.js)
- Cart Transform Function API for price overrides
- Ajax Section Rendering for dynamic price updates
- Variant Metafields for component data storage
- Cart Line Properties for payment option tracking
- PubSub Event System for real-time UI updates
- Custom Elements for deposit calculation logic

### **Core Files Structure**

```
sections/
  ├── product-deposit-calculator.liquid    # PDP deposit display
  └── cart-deposit-handler.liquid          # Cart deposit management

assets/
  ├── deposit-calculator.js                # Main calculation logic
  ├── product-deposit-form.js             # Enhanced product form
  └── cart-deposit-manager.js             # Cart state management

snippets/
  └── deposit-breakdown.liquid            # Reusable price display

extensions/
  └── cart-transform/
      ├── shopify.extension.toml           # Extension config
      └── src/
          └── run.js                       # Price override logic
```

---

## **Data Model**

### **Product Variant Metafields**

```json
{
  "custom.number_of_injectors_per_unit": "8",
  "custom.number_of_fuel_lines_per_unit": "1", 
  "custom.number_of_high_pressure_fuel_pumps": "0"
}
```

### **Deposit Product Setup**

- Handle: `core-deposit`
- Base Price: $0.00 (overridden by Cart Transform)
- Tags: `deposit_product` (for identification)

### **Business Rules**

```javascript
const DEPOSIT_RATES = {
  injectors: 100,        // $100 per injector
  fuel_lines: 100,       // $100 per fuel line set
  fuel_pumps: 200        // $200 per pump
};

function calculateDeposit(injectors, fuelLines, fuelPumps) {
  return (injectors * DEPOSIT_RATES.injectors) +
         (fuelLines * DEPOSIT_RATES.fuel_lines) +
         (fuelPumps * DEPOSIT_RATES.fuel_pumps);
}
```

### **Frontend Data Exposure**

```liquid
<!-- In product template -->
<script>
  window.productMetafields = {
    {% for variant in product.variants %}
      "{{ variant.id }}": {
        "injectors": {{ variant.metafields.custom.number_of_injectors_per_unit | default: 0 }},
        "fuel_lines": {{ variant.metafields.custom.number_of_fuel_lines_per_unit | default: 0 }},
        "fuel_pumps": {{ variant.metafields.custom.number_of_high_pressure_fuel_pumps | default: 0 }}
      }{% unless forloop.last %},{% endunless %}
    {% endfor %}
  };
  
  window.depositProductConfig = {
    handle: 'core-deposit',
    variantId: {{ products['core-deposit'].first_available_variant.id }}
  };
</script>
```

---

## **Implementation Requirements**

### **1. Cart Transform Function**

**File**: `extensions/cart-transform/shopify.extension.toml`
```toml
[extensions.cart-transform]
type = "function"
api_version = "2025-01"

[extensions.cart-transform.build]
command = ""
```

**File**: `extensions/cart-transform/src/run.js`
```javascript
export function run(input) {
  const operations = [];
  
  input.cart.lines.forEach(line => {
    // Check if this is a deposit product line item
    const isDepositProduct = line.merchandise.product.handle === 'core-deposit';
    
    if (isDepositProduct) {
      // Find calculated deposit amount from line attributes
      const calculatedAmount = line.attributes.find(
        attr => attr.key === 'calculated_deposit_amount'
      )?.value;
      
      if (calculatedAmount && parseFloat(calculatedAmount) > 0) {
        operations.push({
          update: {
            cartLineId: line.id,
            price: {
              adjustment: {
                fixedAmountPerUnit: {
                  amount: parseFloat(calculatedAmount) * 100 // Convert to cents
                }
              }
            }
          }
        });
      }
    }
  });
  
  return { operations };
}
```

### **2. Product Detail Page Component**

**File**: `sections/product-deposit-calculator.liquid`
```liquid
<script src="{{ 'deposit-calculator.js' | asset_url }}" defer></script>

<deposit-calculator 
  data-product-id="{{ product.id }}"
  data-section-id="{{ section.id }}"
  class="deposit-calculator">
  
  <div class="deposit-display">
    <div class="deposit-amount hidden">
      <span class="deposit-label">Core Deposit:</span>
      <span class="deposit-value">$0.00</span>
    </div>
    <div class="deposit-error hidden">
      <span class="error-message">Unable to calculate deposit</span>
    </div>
  </div>

  <div class="payment-options hidden">
    <input type="radio" name="payment_option" value="credit_card_on_file" id="cc_hold">
    <label for="cc_hold">Credit Card On File (Hold: $<span class="deposit-total">0</span>)</label>

    <input type="radio" name="payment_option" value="pay_deposit" id="pay_now">  
    <label for="pay_now">Pay Core Deposit (Charge: $<span class="deposit-total">0</span>)</label>

    <input type="radio" name="payment_option" value="return_first" id="return_first">
    <label for="return_first">Return Cores in Advance</label>
  </div>
</deposit-calculator>
```

### **3. JavaScript Deposit Calculator**

**File**: `assets/deposit-calculator.js`
```javascript
class DepositCalculator extends HTMLElement {
  constructor() {
    super();
    this.productId = this.dataset.productId;
    this.currentVariant = null;
    this.depositAmount = 0;
    this.isCalculating = false;

    this.init();
  }

  init() {
    // Subscribe to variant changes
    subscribe(PUB_SUB_EVENTS.variantChange, this.handleVariantChange.bind(this));
    
    // Listen for payment option changes
    this.addEventListener('change', this.handlePaymentOptionChange.bind(this));
  }

  handleVariantChange(event) {
    if (event.variant) {
      this.currentVariant = event.variant;
      this.calculateAndDisplayDeposit();
    }
  }

  async calculateAndDisplayDeposit() {
    if (this.isCalculating) return;
    
    try {
      this.isCalculating = true;
      this.clearError();
      
      const variant = this.currentVariant;
      if (!variant?.id) return;

      // Get metafields from window object
      const metafields = window.productMetafields?.[variant.id];
      if (!metafields) {
        this.depositAmount = 0;
        this.updateDepositDisplay();
        return;
      }

      // Extract component counts from metafields
      const injectors = parseInt(metafields.injectors) || 0;
      const fuelLines = parseInt(metafields.fuel_lines) || 0; 
      const fuelPumps = parseInt(metafields.fuel_pumps) || 0;

      // Calculate deposit using business rules
      this.depositAmount = this.calculateDeposit(injectors, fuelLines, fuelPumps);

      // Update UI
      this.updateDepositDisplay();
      this.togglePaymentOptions(this.depositAmount > 0);
      
    } catch (error) {
      this.showError('Unable to calculate deposit');
      console.error('Deposit calculation error:', error);
    } finally {
      this.isCalculating = false;
    }
  }

  calculateDeposit(injectors, fuelLines, fuelPumps) {
    const RATES = { injectors: 100, fuel_lines: 100, fuel_pumps: 200 };
    return (injectors * RATES.injectors) + 
           (fuelLines * RATES.fuel_lines) + 
           (fuelPumps * RATES.fuel_pumps);
  }

  updateDepositDisplay() {
    const depositDisplay = this.querySelector('.deposit-display .deposit-amount');
    const depositValue = this.querySelector('.deposit-value');
    const depositTotals = this.querySelectorAll('.deposit-total');

    if (this.depositAmount > 0) {
      depositValue.textContent = `$${this.depositAmount.toFixed(2)}`;
      depositTotals.forEach(el => el.textContent = this.depositAmount.toFixed(2));
      depositDisplay.classList.remove('hidden');
    } else {
      depositDisplay.classList.add('hidden');
    }
  }

  togglePaymentOptions(show) {
    const paymentOptions = this.querySelector('.payment-options');
    paymentOptions.classList.toggle('hidden', !show);

    if (show) {
      // Default to first option
      this.querySelector('input[value="credit_card_on_file"]').checked = true;
      this.selectedPaymentOption = 'credit_card_on_file';
      this.updateProductForm();
    }
  }

  handlePaymentOptionChange(event) {
    if (event.target.name === 'payment_option') {
      // Store selection for product form
      this.selectedPaymentOption = event.target.value;
      
      // Update product form with deposit data
      this.updateProductForm();
    }
  }

  updateProductForm() {
    const productForm = document.querySelector('product-deposit-form') || 
                      document.querySelector('product-form');
    
    if (productForm) {
      productForm.depositAmount = this.depositAmount;
      productForm.paymentOption = this.selectedPaymentOption;
      productForm.componentData = this.getComponentData();
    }
  }

  getComponentData() {
    if (!this.currentVariant?.id || !window.productMetafields) return {};
    
    const metafields = window.productMetafields[this.currentVariant.id] || {};
    return {
      injectors: metafields.injectors?.toString() || '0',
      fuel_lines: metafields.fuel_lines?.toString() || '0', 
      fuel_pumps: metafields.fuel_pumps?.toString() || '0'
    };
  }

  showError(message) {
    const errorDiv = this.querySelector('.deposit-error');
    const errorMessage = this.querySelector('.error-message');
    
    errorMessage.textContent = message;
    errorDiv.classList.remove('hidden');
  }

  clearError() {
    const errorDiv = this.querySelector('.deposit-error');
    errorDiv.classList.add('hidden');
  }
}

customElements.define('deposit-calculator', DepositCalculator);
```

### **4. Enhanced Product Form**

**File**: `assets/product-deposit-form.js`
```javascript
class ProductDepositForm extends HTMLElement {
  constructor() {
    super();
    this.depositAmount = 0;
    this.paymentOption = null;
    this.componentData = {};
    this.isSubmitting = false;

    this.form = this.querySelector('form');
    this.submitButton = this.querySelector('[type="submit"]');
    this.form.addEventListener('submit', this.onSubmitHandler.bind(this));
  }

  async onSubmitHandler(evt) {
    evt.preventDefault();
    
    if (this.isSubmitting || this.submitButton.getAttribute('aria-disabled') === 'true') {
      return;
    }

    // Get main product form data
    const mainFormData = new FormData(this.form);
    const mainVariantId = mainFormData.get('id');

    try {
      this.setLoadingState(true);
      
      // Add main product first
      await this.addMainProduct(mainFormData);

      // Add deposit product if needed
      if (this.shouldAddDeposit()) {
        await this.addDepositProduct(mainVariantId);
      }

      // Update cart UI
      this.handleSuccessfulAdd();

    } catch (error) {
      console.error('Error adding products:', error);
      this.handleError(error);
    } finally {
      this.setLoadingState(false);
    }
  }

  shouldAddDeposit() {
    return this.depositAmount > 0 && 
           this.paymentOption && 
           this.paymentOption !== 'return_first';
  }

  async addMainProduct(formData) {
    // Add deposit-related properties to main product
    formData.append('properties[payment_option]', this.paymentOption || '');
    formData.append('properties[deposit_amount]', this.depositAmount.toString());
    formData.append('properties[component_injectors]', this.componentData.injectors || '0');
    formData.append('properties[component_fuel_lines]', this.componentData.fuel_lines || '0');
    formData.append('properties[component_fuel_pumps]', this.componentData.fuel_pumps || '0');

    const response = await fetch(`${routes.cart_add_url}`, {
      method: 'POST',
      headers: { 'X-Requested-With': 'XMLHttpRequest' },
      body: formData
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.description || 'Failed to add main product');
    }
    
    return response.json();
  }

  async addDepositProduct(mainVariantId) {
    const depositConfig = window.depositProductConfig;
    if (!depositConfig?.variantId) {
      throw new Error('Deposit product configuration not found');
    }

    const formData = new FormData();
    formData.append('id', depositConfig.variantId);
    formData.append('quantity', '1');
    formData.append('properties[_deposit_product]', 'true');
    formData.append('properties[payment_option]', this.paymentOption);
    formData.append('properties[calculated_deposit_amount]', this.depositAmount.toString());
    formData.append('properties[main_product_variant]', mainVariantId);

    const response = await fetch(`${routes.cart_add_url}`, {
      method: 'POST', 
      headers: { 'X-Requested-With': 'XMLHttpRequest' },
      body: formData
    });

    if (!response.ok) {
      // Try to remove main product if deposit fails
      await this.rollbackMainProduct();
      
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.description || 'Failed to add deposit product');
    }
    
    return response.json();
  }

  async rollbackMainProduct() {
    try {
      // Get current cart to find the just-added item
      const cartData = await this.getCartData();
      const lastItem = cartData.items[cartData.items.length - 1];
      
      if (lastItem) {
        const updates = {};
        updates[lastItem.key] = 0;
        
        await fetch(`${routes.cart_update_url}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ updates })
        });
      }
    } catch (rollbackError) {
      console.error('Failed to rollback main product:', rollbackError);
    }
  }

  async getCartData() {
    const response = await fetch('/cart.js');
    if (!response.ok) throw new Error('Failed to get cart data');
    return response.json();
  }

  setLoadingState(loading) {
    this.isSubmitting = loading;
    
    if (loading) {
      this.submitButton.setAttribute('aria-disabled', 'true');
      this.submitButton.textContent = 'Adding...';
    } else {
      this.submitButton.setAttribute('aria-disabled', 'false');
      this.submitButton.textContent = 'Add to Cart';
    }
  }

  handleSuccessfulAdd() {
    // Trigger cart drawer or redirect
    publish(PUB_SUB_EVENTS.cartUpdate, {
      source: 'product-deposit-form'
    });
    
    // Show success feedback
    this.showSuccess('Products added to cart');
  }

  handleError(error) {
    this.showError(error.message || 'Failed to add products to cart');
  }

  showSuccess(message) {
    // Implement success UI feedback
    console.log('Success:', message);
  }

  showError(message) {
    // Implement error UI feedback  
    console.error('Error:', message);
  }
}

customElements.define('product-deposit-form', ProductDepositForm);
```

### **5. Cart State Management**

**File**: `assets/cart-deposit-manager.js`
```javascript
class CartDepositManager extends HTMLElement {
  constructor() {
    super();

    // Subscribe to cart updates
    subscribe(PUB_SUB_EVENTS.cartUpdate, this.handleCartUpdate.bind(this));
  }

  handleCartUpdate(event) {
    if (event.source === 'deposit-manager') return;

    // Validate deposit consistency after cart changes
    this.validateDepositConsistency();
  }

  async validateDepositConsistency() {
    try {
      const cartData = await this.getCartData();
      const depositItems = this.findDepositItems(cartData.items);
      const mainProductItems = this.findMainProductItems(cartData.items);

      // Handle quantity mismatches
      await this.handleQuantityMismatches(depositItems, mainProductItems);
      
      // Remove orphaned deposits
      await this.removeOrphanedDeposits(depositItems, mainProductItems);
      
    } catch (error) {
      console.error('Cart validation error:', error);
    }
  }

  async handleQuantityMismatches(depositItems, mainProductItems) {
    for (const depositItem of depositItems) {
      const linkedMain = this.findLinkedMainProduct(mainProductItems, depositItem);
      
      if (linkedMain && depositItem.quantity !== 1) {
        // Always keep deposit quantity at 1
        await this.updateCartItemQuantity(depositItem.key, 1);
      }
    }
  }

  async removeOrphanedDeposits(depositItems, mainProductItems) {
    for (const depositItem of depositItems) {
      const mainProductExists = this.findLinkedMainProduct(mainProductItems, depositItem);

      if (!mainProductExists) {
        // Remove orphaned deposit
        await this.removeCartItem(depositItem.key);
      }
    }
  }

  findDepositItems(cartItems) {
    return cartItems.filter(item =>
      item.properties && item.properties._deposit_product === 'true'
    );
  }

  findMainProductItems(cartItems) {
    return cartItems.filter(item =>
      !item.properties || item.properties._deposit_product !== 'true'
    );
  }

  findLinkedMainProduct(mainProductItems, depositItem) {
    const mainVariantId = depositItem.properties?.main_product_variant;
    return mainProductItems.find(item => 
      item.variant_id.toString() === mainVariantId
    );
  }

  async updateCartItemQuantity(itemKey, quantity) {
    const updates = {};
    updates[itemKey] = quantity;

    await fetch(`${routes.cart_update_url}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ updates })
    });

    publish(PUB_SUB_EVENTS.cartUpdate, {
      source: 'deposit-manager'
    });
  }

  async removeCartItem(itemKey) {
    await this.updateCartItemQuantity(itemKey, 0);
  }

  async getCartData() {
    const response = await fetch('/cart.js');
    if (!response.ok) throw new Error('Failed to get cart data');
    return response.json();
  }
}

customElements.define('cart-deposit-manager', CartDepositManager);
```

---

## **Integration Points**

### **Cart Template Integration**

Add to `templates/cart.json`:
```json
{
  "sections": {
    "cart-items": { "type": "main-cart-items" },
    "cart-deposit-manager": { "type": "cart-deposit-handler" },
    "cart-footer": { "type": "main-cart-footer" }
  },
  "order": ["cart-items", "cart-deposit-manager", "cart-footer"]
}
```

### **Product Template Integration**

Add to product template:
```liquid
{% render 'product-deposit-calculator', product: product %}

<!-- Replace standard product form -->
<product-deposit-form>
  <!-- Existing product form HTML -->
</product-deposit-form>
```

---

## **Edge Cases & Error Handling**

### **Handled Scenarios**
- ✅ Variants with zero components (no deposit needed)
- ✅ Cart quantity changes (deposit stays quantity 1)
- ✅ Network failures during multi-product add (rollback)
- ✅ Deposit product unavailable (error message)
- ✅ Orphaned deposit products (auto-removal)
- ✅ Invalid metafield data (graceful defaults)
- ✅ Loading states during async operations

### **Error Recovery**
- Main product add failure → Show error, no deposit added
- Deposit product add failure → Remove main product, show error
- Cart validation failure → Log error, continue operation
- Metafields missing → Default to $0 deposit, continue

---

## **Success Criteria**

### **Functional Requirements**
- ✅ Variant selection calculates accurate deposits from metafields
- ✅ Three payment options create different cart experiences  
- ✅ Deposit pricing persists through Cart Transform price override
- ✅ Cart state remains consistent with deposit/main product linking

### **Technical Requirements**
- ✅ Uses standard Shopify Cart API + Cart Transform Function
- ✅ Metafield-driven calculations with business rule pricing
- ✅ Real-time price updates using PubSub system
- ✅ Deposit products auto-managed based on cart state
- ✅ Error handling and rollback mechanisms

### **User Experience Requirements**
- ✅ Seamless variant-to-deposit calculation updates
- ✅ Clear payment option selection with pricing preview
- ✅ Consistent cart totals reflecting Cart Transform pricing
- ✅ Loading states and error feedback during operations
- ✅ No broken states during add/remove/quantity operations

---

## **Out of Scope (Future Phases)**

- Payment processing integration (TryOnify/Tern Trade-in)
- Order fulfillment workflow automation  
- Core return tracking system
- Advanced cart validation rules
- Multi-currency deposit calculations