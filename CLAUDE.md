# Injectors Direct Demo - Development Context

## Working Deposit System Solution ✅

### Problem Solved
Successfully implemented automatic deposit product addition when customers add main products to cart. The system detects products with deposit requirements (based on variant metafields) and automatically adds the corresponding deposit variant alongside the main product.

### Final Working Solution

**Location**: `/blocks/deposit-variant-picker.liquid` (lines ~280-375)

**How It Works**:
1. **Form Interception**: Intercepts the theme's default product form submission
2. **Validation**: Ensures customer selected a deposit option
3. **Single AJAX Request**: Sends both main product + deposit product to Shopify's Cart AJAX API in one call
4. **Bundle Linking**: Links products using `_bundle_id` property for tracking
5. **Redirect**: Maintains theme's default behavior (redirect to cart after addition)

**Key Code Structure**:
```javascript
// Form submission handler
productFormElements.forEach(form => {
  form.addEventListener('submit', function(e) {
    // Validate deposit selection
    if (!selectedDepositOption) {
      e.preventDefault();
      alert('Please select a deposit option');
      return false;
    }
    
    // For deposit-required products
    if (selectedDepositOption !== 'return_cores_in_advance') {
      e.preventDefault(); // Stop normal form submission
      addBothToCart(mainVariantId, quantity, depositVariantId, depositAmount, selectedDepositOption);
    }
  });
});

// Single AJAX call with multiple items
async function addBothToCart(mainVariantId, quantity, depositVariantId, depositAmount, depositOption) {
  const items = [
    {
      id: parseInt(mainVariantId),
      quantity: parseInt(quantity),
      properties: {
        '_bundle_id': bundleId,
        'deposit_option': depositOption
      }
    },
    {
      id: parseInt(depositVariantId), 
      quantity: depositQuantity,
      properties: {
        '_deposit_for': 'main_product',
        '_bundle_id': bundleId,
        '_is_deposit_product': 'true',
        'deposit_option': depositOption,
        '_calculated_amount': '$' + depositAmount.toFixed(2)
      }
    }
  ];
  
  const response = await fetch('/cart/add.js', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items })
  });
  
  // Redirect to cart after success
  window.location.href = '/cart';
}
```

### Technical Details

**Metafield-Based Detection**:
- Products detected via variant metafields: `custom.number_of_injectors`, `custom.number_of_fuel_lines`, `custom.number_of_high_pressure_fuel_pumps`
- Unit prices: Injectors $100, Fuel Lines $100, Fuel Pumps $200
- Total deposit calculated from quantities × unit prices

**Cart AJAX API Usage**:
- Endpoint: `POST /cart/add.js`
- Format: `{ items: [...] }` - supports multiple items in single request
- Properties: Uses underscore-prefixed properties for internal tracking

**Bundle Linking System**:
- `_bundle_id`: Links main product with its deposit (timestamp-based)
- `_deposit_for`: Marks deposit items as linked to main products
- `_is_deposit_product`: Identifies deposit products in cart
- `deposit_option`: Records customer's selected payment method

### Files Modified
1. **`/blocks/deposit-variant-picker.liquid`**: Main deposit selection and cart logic
2. **`/sections/cart-deposit-handler.liquid`**: Deposit product configuration
3. **`/assets/cart-deposit-manager.js.disabled`**: Previous complex logic (disabled)

### Why This Solution Works
- **Single Request**: More reliable than multiple separate cart additions
- **Theme Compatibility**: Doesn't modify core theme files
- **Error Handling**: Graceful fallbacks and user feedback
- **Bundle Tracking**: Links products for future cart management
- **Standard API**: Uses documented Shopify Cart AJAX API

### Previous Failed Approaches
1. ❌ **Fetch Interception**: Too complex, timing issues
2. ❌ **Theme Form Modification**: Broke theme's default behavior  
3. ❌ **Cart Event Listening**: Unreliable event detection
4. ❌ **Sequential Cart Additions**: Race conditions and timing issues

### Testing
✅ Products with metafields automatically get deposit options
✅ Form validation prevents submission without deposit selection
✅ Both main + deposit products added to cart in single operation
✅ Cart shows both products with proper bundling properties
✅ Standard theme redirect behavior preserved