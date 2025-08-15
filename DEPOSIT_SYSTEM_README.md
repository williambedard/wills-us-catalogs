# Core Deposit System Implementation

## Overview

This implementation provides a complete dynamic core deposit system for Injectors Direct, allowing customers to purchase diesel truck parts with automated deposit calculations and multiple payment options.

## Architecture Summary

### 1. Deposit Calculator Component (`assets/deposit-calculator.js`)
- **Purpose**: Calculates deposit amounts based on product variant metafields
- **Location**: Product Detail Pages (PDP)
- **Features**:
  - Real-time deposit calculation on variant selection
  - Payment option selection (Credit Card Hold, Pay Deposit, Return First)
  - Component data extraction from metafields
  - Event-driven communication with product form

### 2. Enhanced Product Form (`assets/product-deposit-form.js`)  
- **Purpose**: Extends standard product form to handle deposit products
- **Location**: Replaces existing product-form-component
- **Features**:
  - Automatic deposit product addition to cart
  - Rollback mechanism on deposit failure
  - Properties injection for main and deposit products
  - Error handling and user feedback

### 3. Cart Transform Function (`extensions/cart-transform/`)
- **Purpose**: Dynamically overrides deposit product pricing
- **Location**: Shopify Functions backend
- **Features**:
  - Price override based on calculated amounts
  - Payment option validation
  - Real-time price updates in cart

### 4. Cart Deposit Manager (`assets/cart-deposit-manager.js`)
- **Purpose**: Maintains cart consistency and deposit relationships
- **Location**: Cart drawer and cart page
- **Features**:
  - Quantity synchronization (deposits always qty 1)
  - Orphaned deposit removal
  - Missing deposit detection and addition
  - Real-time cart validation

## File Structure

```
/assets/
  ├── deposit-calculator.js           # PDP deposit calculation
  ├── product-deposit-form.js         # Enhanced product form
  └── cart-deposit-manager.js         # Cart state management

/sections/
  ├── product-deposit-calculator.liquid  # PDP deposit display
  └── cart-deposit-handler.liquid       # Cart manager integration

/extensions/cart-transform/
  ├── shopify.extension.toml          # Function configuration
  ├── package.json                    # Function dependencies
  └── src/run.js                      # Cart transform logic

/templates/
  ├── product.json                    # Updated with deposit calculator
  └── cart.json                       # Updated with deposit handler

/blocks/
  └── buy-buttons.liquid              # Updated to use deposit form

/snippets/
  └── cart-drawer.liquid              # Updated with deposit manager
```

## Configuration Requirements

### 1. Deposit Product Setup
- **Handle**: `refundable-core-deposit`
- **Product ID**: `10712536842262`
- **Variants**:
  - "Credit card on file" - Default $100
  - "Pay core deposit upfront" - Default $100
  - "Return cores in advance" - Default $0

### 2. Product Metafields
Products must have these metafields configured:
```liquid
custom.number_of_injectors
custom.number_of_fuel_lines  
custom.number_of_high_pressure_fuel_pumps_for_deposit
```

### 3. Deposit Rates
Configured in JavaScript:
```javascript
DEPOSIT_RATES = {
  injectors: 100,    // $100 per injector
  fuel_lines: 100,   // $100 per fuel line set
  fuel_pumps: 200    // $200 per pump
}
```

## Data Flow

1. **PDP Load**: Deposit calculator reads variant metafields
2. **Variant Change**: Calculator updates deposit amount and payment options
3. **Add to Cart**: Enhanced form adds main product + deposit product
4. **Cart Transform**: Function overrides deposit pricing based on attributes
5. **Cart Management**: Manager validates and maintains consistency

## Testing Instructions

### Test Product: `durable-injector-nozzle-kit`
1. Navigate to product page
2. Observe deposit calculator (should show if metafields exist)
3. Select payment option
4. Add to cart
5. Verify both main and deposit products added
6. Check cart pricing reflects calculated amounts

### Validation Points
- [ ] Deposit calculator displays on PDP
- [ ] Payment options appear for products with deposits
- [ ] Cart contains main + deposit products after add
- [ ] Deposit pricing overridden correctly
- [ ] Cart drawer shows correct totals
- [ ] Quantity changes maintain deposit consistency

## Deployment Steps

1. **Deploy Theme Files**: Upload all modified theme files
2. **Install Cart Transform Function**: Deploy function via Shopify CLI
3. **Configure Product Metafields**: Ensure test products have required metafields
4. **Verify Deposit Product**: Confirm "Refundable Core Deposit" exists with correct variants
5. **Test Complete Flow**: Add products with deposits to cart and verify pricing

## Error Handling

### Frontend Errors
- Missing metafields → Default to $0 deposit
- Network failures → Show error message, prevent submission
- Invalid variants → Fallback to first available option

### Backend Errors  
- Cart Transform failures → Function logs errors, continues without override
- Missing deposit product → Form shows error, prevents submission
- Rollback failures → User notified, manual cart cleanup required

## Browser Compatibility

- Modern browsers supporting ES6 modules
- Custom elements (Web Components)
- Fetch API for cart operations

## Performance Considerations

- Components lazy-loaded on PDP/Cart
- Debounced cart validation (100ms delay)
- Minimal DOM manipulation for real-time updates
- Cart Transform Function optimized for speed

## Maintenance

### Regular Checks
- Monitor Cart Transform Function logs
- Verify deposit product variant pricing
- Update deposit rates in JavaScript if needed
- Test with new product variants

### Scaling Considerations
- Add more component types to metafields/rates
- Extend payment options (external integrations)
- Add deposit history tracking
- Implement core return workflow

## Support

For issues or modifications:
1. Check browser console for JavaScript errors
2. Verify Shopify Function deployment status
3. Confirm product metafields are populated
4. Test with different product variants

---

**Implementation Status**: ✅ Complete - Ready for deployment and testing