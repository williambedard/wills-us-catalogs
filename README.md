# Injectors Direct - Core Deposit System

Production Shopify theme for Injectors Direct, a $25M diesel truck parts distributor. Implements a complete core deposit management system for remanufactured parts.

## 🚀 Quick Start

### Prerequisites
- Shopify store with product metafields enabled
- Deposit product created with payment option variants
- Basic understanding of Liquid templating

### Setup Steps

1. **Configure Metafields**
   ```
   custom.deposit_for_injectors (Money)
   custom.deposit_for_fuel_lines (Money)  
   custom.deposit_for_high_pressure_fuel_pumps (Money)
   ```

2. **Tag Products**
   - Add `has_deposit_options` tag to products requiring deposits

3. **Add Block**
   - Insert "Deposit Variant Picker" block in product templates
   - Configure deposit product in block settings

4. **Test Workflow**
   - Select deposit option → Add to cart → Verify bundle creation

## 💡 System Overview

### Payment Options
- **Credit Card Hold**: Hold placed, charged after 28 days
- **Pay Deposit**: Immediate charge, refund on return
- **Return Cores First**: Ship cores before ordering

### Key Features
- ✅ Automatic cart synchronization
- ✅ Deposit quantity management  
- ✅ Bundle-based product linking
- ✅ Custom pricing calculations
- ✅ Admin-friendly configuration

## 📁 Project Structure

```
blocks/
├── deposit-variant-picker.liquid    # Main deposit selection UI
assets/
├── component-cart-items.js          # Cart synchronization logic
snippets/
├── cart-products.liquid             # Cart display templates
├── cart-summary.liquid              # Total calculation overrides
```

## ⚠️ Important Notes

- **Theme-Only Solution**: Current implementation uses template workarounds
- **Shopify Functions**: Recommended for production (see CONTEXT.md)
- **Admin Limitations**: Deposit variants show $0.00 in draft orders

## 📖 Documentation

- **[CONTEXT.md](CONTEXT.md)**: Complete technical documentation
  - Business logic details
  - Implementation architecture  
  - Pricing calculation workarounds
  - Migration path to Shopify Functions

- **Support**: Internal development team only

---
**Status**: Production Ready (with documented limitations)  
**Last Updated**: Current implementation complete