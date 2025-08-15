# Simple Deposit System - Implementation Guide

## 🎯 **Core Focus Areas (As Requested)**

### 1. **Variant Selection & Dropdown** ✅
- **File**: `assets/deposit-simple.js`
- **Function**: Listens for `variant:change` events
- **Behavior**: Automatically calculates deposit when customer selects different product variants

### 2. **Calculator & Price Override** ✅ 
- **Frontend**: `sections/deposit-calculator.liquid` (Theme Editor friendly)
- **Backend**: `extensions/cart-transform/src/run-simple.js` 
- **Behavior**: Shows deposit amount, overrides pricing in cart via Shopify Functions

### 3. **Cart Rules & Behavior** ✅
- **File**: `assets/cart-deposit-simple.js`
- **Behavior**: Automatically adds deposit products to cart when main products added

---

## 🛠 **Theme Editor Friendly Setup**

The deposit calculator section has **full theme editor support**:

### **Available Settings:**
- ✅ Show/hide deposit information  
- ✅ Custom titles and descriptions
- ✅ Payment option labels (customizable)
- ✅ Colors (background, text, amounts, borders)
- ✅ Spacing (padding, margins)
- ✅ Border styling (radius, colors)

### **How to Use:**
1. Go to **Theme Editor** → **Products** → **Default Product**
2. Add section **"Deposit Calculator"** 
3. Customize all text and styling via settings
4. Save and preview

---

## 📁 **Simplified File Structure**

```
/assets/
  ├── deposit-simple.js           # Variant selection & calculation
  └── cart-deposit-simple.js      # Cart behavior

/sections/  
  └── deposit-calculator.liquid   # Theme editor friendly section

/extensions/cart-transform/
  └── src/run-simple.js           # Price override function

/layout/
  └── theme.liquid                # Updated with cart script

/templates/
  └── product.json                # Updated with deposit calculator
```

**Only 5 files modified** - much simpler than the original complex implementation!

---

## ⚙️ **Configuration**

### **Deposit Rates** (in `deposit-simple.js`):
```javascript
const DEPOSIT_CONFIG = {
  rates: {
    injectors: 100,     // $100 per injector
    fuel_lines: 100,    // $100 per fuel line
    fuel_pumps: 200     // $200 per fuel pump  
  }
};
```

### **Required Product Metafields:**
- `custom.number_of_injectors`
- `custom.number_of_fuel_lines` 
- `custom.number_of_high_pressure_fuel_pumps_for_deposit`

### **Deposit Product Setup:**
- Handle: `refundable-core-deposit`
- ID: `10712536842262`
- Variants: "Credit card on file", "Pay core deposit upfront", "Return cores in advance"

---

## 🔄 **How It Works**

### **1. Product Page Flow:**
1. Customer selects product variant
2. JavaScript reads variant metafields  
3. Calculates deposit (injectors × $100 + fuel_lines × $100 + pumps × $200)
4. Shows deposit calculator with payment options
5. Updates hidden form fields

### **2. Add to Cart Flow:**
1. Form submission intercepted by `cart-deposit-simple.js`
2. Main product added to cart first
3. Deposit product automatically added (if needed)
4. Cart redirects/refreshes

### **3. Cart Pricing Flow:**
1. Cart Transform Function runs on cart updates
2. Finds deposit products by `_is_deposit` property
3. Overrides price with calculated amount
4. Customer sees correct pricing

---

## 🧪 **Testing Steps**

### **With Theme Editor:**
1. **Customize**: Go to Theme Editor → add deposit calculator section
2. **Configure**: Set colors, text, spacing to your preference  
3. **Preview**: Check how it looks on products

### **On Storefront:**
1. Visit product with metafields (e.g., `durable-injector-nozzle-kit`)
2. Select variants → deposit calculator should appear
3. Choose payment option → add to cart
4. Check cart has both main + deposit products
5. Verify pricing is calculated correctly

---

## 🎨 **Theme Editor Benefits**

- **No code editing needed** for text changes
- **Live preview** of styling changes  
- **Easy customization** of colors and spacing
- **Merchant-friendly** - you can adjust everything in admin
- **Responsive design** built-in

---

## 📝 **Next Steps**

1. **Deploy files** to your theme
2. **Add deposit calculator section** in Theme Editor  
3. **Customize appearance** to match your brand
4. **Test with real products** that have metafields
5. **Deploy Cart Transform Function** via Shopify CLI

The system is now **much simpler** and **theme-editor friendly** as requested! 🎉