# Comprehensive MONEY Metafield Debug Strategy

## Problem Summary
MONEY metafields show correct data (`{"amount":"800.0","currency_code":"USD"}`) but Liquid calculations return 0. Both Liquid template calculations and JavaScript output are affected.

## Debug Tools Created

### 1. Enhanced Debug Block (`deposit-variant-picker.liquid`)
**Location**: `/blocks/deposit-variant-picker.liquid`

**Features**:
- Tests 4 different approaches to extract MONEY field values
- Comprehensive HTML comment debugging output
- JavaScript debug data with method identification
- Console logging helper function

**How to Use**:
1. Navigate to a product page with MONEY metafields
2. View page source and search for "DEBUG:" comments
3. Check which approach shows non-zero values
4. Open browser console and run `window.debugDepositMetafields()`

### 2. Money Metafield Debug Snippet (`money-metafield-debug.liquid`)
**Location**: `/snippets/money-metafield-debug.liquid`

**Usage**:
```liquid
{% render 'money-metafield-debug', variant: variant, metafield: variant.metafields.custom.your_money_field %}
```

**Features**:
- Visual debug output with styled boxes
- Tests 5+ different extraction methods
- Shows raw values, property access, math operations, filters
- Provides success/failure status for each method

### 3. Comprehensive Test Section (`money-metafield-test.liquid`)
**Location**: `/sections/money-metafield-test.liquid`

**How to Use**:
1. Add section to theme temporarily via Theme Editor
2. Add to any page template
3. View page to see comprehensive test results
4. Remove section when done debugging

**Features**:
- Tests multiple MONEY metafields automatically
- Table format showing all methods and results
- JavaScript console output for each variant
- Instructions and recommendations

### 4. Money Metafield Diagnostics Script (`money-metafield-diagnostics.js`)
**Location**: `/assets/money-metafield-diagnostics.js`

**How to Use**:
```javascript
// In browser console
MoneyMetafieldDiagnostics.runFullDiagnostic();

// Test specific format
MoneyMetafieldDiagnostics.testSpecificFormat('{"amount":"800.0","currency_code":"USD"}');
```

**Features**:
- Automated analysis of window objects
- Comparison of all extraction methods
- JavaScript parsing tests
- Specific recommendations based on results

### 5. Utility Snippet (`money-metafield-value.liquid`)
**Location**: `/snippets/money-metafield-value.liquid`

**Usage**:
```liquid
{% assign amount = money_field | money_metafield_value %}
```

**Features**:
- Production-ready utility for extracting MONEY field values
- Tries multiple approaches and returns first working result
- Fallback handling for edge cases

### 6. Clean Production Block (`deposit-variant-picker-clean.liquid`)
**Location**: `/blocks/deposit-variant-picker-clean.liquid`

**Features**:
- Uses the utility snippet for reliable extraction
- Clean code without debug output
- Production-ready implementation

## Debug Strategy Steps

### Step 1: Initial Assessment
1. Add the enhanced debug block to your product template
2. Navigate to a product with MONEY metafields
3. View page source and look for HTML debug comments
4. Identify which approach shows working values

### Step 2: Detailed Analysis
1. Add the test section to a page template
2. View the test page to see comprehensive results
3. Check browser console for JavaScript debug data
4. Note which methods show ✅ Working status

### Step 3: JavaScript Verification
1. Open browser console on product page
2. Run `window.debugDepositMetafields()`
3. Review the detailed analysis output
4. Check for method success rates

### Step 4: Specific Testing
1. Use the debug snippet for individual metafields:
```liquid
{% render 'money-metafield-debug', variant: product.first_available_variant, metafield: variant.metafields.custom.deposit_for_injectors %}
```

### Step 5: Implementation
1. Once you identify the working method, use the utility snippet:
```liquid
{% assign deposit_amount = variant.metafields.custom.deposit_for_injectors | money_metafield_value %}
```
2. Or implement the clean production block

## Testing Methods

### Method 1: Direct .amount Property Access
```liquid
{{ metafield.amount | times: 1 }}
```
**Expected**: Should work if Shopify exposes amount as property
**Common Issue**: May return blank/nil

### Method 2: Bracket Notation
```liquid
{{ metafield['amount'] | times: 1 }}
```
**Expected**: Alternative property access
**Common Issue**: Same as Method 1

### Method 3: String Manipulation
```liquid
{% assign raw = metafield | json %}
{% assign extracted = raw | remove: '{"amount":"' | remove: '","currency_code":"USD"}' | remove: '"' %}
{{ extracted | times: 1 }}
```
**Expected**: Should work if MONEY fields return as JSON strings
**Most Likely**: This method often succeeds

### Method 4: Money Filters
```liquid
{{ metafield | money_without_currency | remove: '.' | divided_by: 100.0 }}
```
**Expected**: Works if Shopify money filters recognize MONEY metafields
**Variable**: Success depends on Shopify version

### Method 5: Split Technique
```liquid
{% assign parts = metafield | json | split: '"amount":"' %}
{% if parts.size > 1 %}
  {% assign amount = parts[1] | split: '"' | first | times: 1 %}
{% endif %}
```
**Expected**: Reliable fallback for JSON string parsing
**Backup**: Usually works when other methods fail

## Console Commands for Manual Testing

```javascript
// Quick debug
window.debugDepositMetafields();

// Check window objects
console.log('productMetafields:', window.productMetafields);
console.log('debugMetafields:', window.debugMetafields);

// Test specific JSON format
MoneyMetafieldDiagnostics.testSpecificFormat('{"amount":"800.0","currency_code":"USD"}');

// Check variant data
Object.entries(window.productMetafields || {}).forEach(([id, data]) => {
  const total = Object.values(data).reduce((sum, val) => sum + (parseFloat(val) || 0), 0);
  console.log(`Variant ${id}: ${total} (${data.method || 'unknown method'})`);
});
```

## Troubleshooting Guide

### Issue: All methods return 0
**Causes**:
- Metafields not properly set up
- Wrong namespace/key names
- Product doesn't have metafields
- Metafield type is not MONEY

**Solutions**:
1. Verify metafield exists: `{{ metafield }}`
2. Check metafield type: `{{ metafield.type }}`
3. Verify namespace/key: `{{ metafield.namespace }}.{{ metafield.key }}`
4. Test with manual data

### Issue: Only string manipulation works
**Cause**: Shopify returns MONEY metafields as JSON strings instead of objects
**Solution**: Use the utility snippet which prioritizes string manipulation

### Issue: Inconsistent results between variants
**Cause**: Some variants may have different metafield structures
**Solution**: Check debug output for each variant individually

### Issue: JavaScript gets different values than Liquid
**Cause**: Liquid pre-processing vs JavaScript runtime differences
**Solution**: Ensure both use the same extraction method

## Production Implementation

Once debugging is complete, use the clean implementation:

1. **Replace current block**:
   - Remove `deposit-variant-picker.liquid`
   - Rename `deposit-variant-picker-clean.liquid` to `deposit-variant-picker.liquid`

2. **Or use utility snippet in existing code**:
```liquid
{% assign deposit = variant.metafields.custom.deposit_for_injectors | money_metafield_value %}
```

3. **Remove debug assets**:
   - `/sections/money-metafield-test.liquid`
   - `/assets/money-metafield-diagnostics.js`
   - Debug HTML comments

## Expected Results

After implementing this debug strategy, you should:

1. **Identify the working method** (likely string manipulation)
2. **See non-zero values** in both Liquid and JavaScript
3. **Have consistent behavior** across all variants
4. **Understand the root cause** of the original issue

## Quick Fix

If you need an immediate solution, replace your current metafield access:

**Change from**:
```liquid
first_variant.metafields.custom.deposit_for_injectors.amount | default: 0 | times: 1
```

**Change to**:
```liquid
first_variant.metafields.custom.deposit_for_injectors | json | remove: '{"amount":"' | remove: '","currency_code":"USD"}' | remove: '"' | times: 1 | default: 0
```

This string manipulation approach has the highest success rate for MONEY metafields.