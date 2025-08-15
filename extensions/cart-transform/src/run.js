/**
 * Core Deposit Cart Transform Function
 * 
 * This function dynamically overrides the price of deposit products in the cart
 * based on the calculated deposit amount stored in line item attributes.
 * 
 * Business Logic:
 * - Identifies deposit products by handle 'refundable-core-deposit'
 * - Reads calculated deposit amount from line attributes
 * - Applies price override using fixedAmountPerUnit
 * - Maintains 1:1 relationship between main products and deposit products
 * 
 * @param {object} input - The cart data from Shopify
 * @returns {object} Operations to perform on cart items
 */
export function run(input) {
  const operations = [];
  
  // Process each cart line
  input.cart.lines.forEach(line => {
    // Check if this is a deposit product
    const isDepositProduct = line.merchandise.product.handle === 'refundable-core-deposit';
    
    if (isDepositProduct) {
      // Find the calculated deposit amount from line attributes
      const calculatedAmountAttr = line.attributes.find(
        attr => attr.key === 'calculated_deposit_amount'
      );
      
      if (calculatedAmountAttr && calculatedAmountAttr.value) {
        const depositAmount = parseFloat(calculatedAmountAttr.value);
        
        // Only apply price override if we have a valid positive amount
        if (depositAmount > 0) {
          // Find payment option to determine if we should apply the override
          const paymentOptionAttr = line.attributes.find(
            attr => attr.key === 'payment_option'
          );
          
          // Don't apply pricing for 'return_first' option since no deposit is needed
          if (paymentOptionAttr && paymentOptionAttr.value !== 'return_first') {
            operations.push({
              update: {
                cartLineId: line.id,
                price: {
                  adjustment: {
                    fixedAmountPerUnit: {
                      // Convert to cents (Shopify expects money amounts in cents)
                      amount: Math.round(depositAmount * 100)
                    }
                  }
                }
              }
            });
          }
        }
      }
    }
  });
  
  return { operations };
}

// Export for testing environments
export default { run };