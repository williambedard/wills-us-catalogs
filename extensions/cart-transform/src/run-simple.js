/**
 * Simple Cart Transform Function
 * Updates deposit product prices based on calculated amounts
 */

export function run(input) {
  const operations = [];
  
  // Find deposit products in cart
  for (const line of input.cart.lines) {
    // Check if this line is a deposit product
    const isDeposit = line.attributes.some(attr => 
      attr.key === '_is_deposit' && attr.value === 'true'
    );
    
    if (isDeposit) {
      // Get the deposit amount from properties
      const depositAmountAttr = line.attributes.find(attr => 
        attr.key === 'deposit_amount'
      );
      
      if (depositAmountAttr && depositAmountAttr.value) {
        const amount = parseFloat(depositAmountAttr.value);
        
        // Only update price if we have a valid amount  
        if (amount > 0 && amount < 10000) {
          operations.push({
            update: {
              cartLineId: line.id,
              price: {
                adjustment: {
                  fixedAmountPerUnit: {
                    amount: Math.round(amount * 100) // Convert to cents
                  }
                }
              }
            }
          });
        }
      }
    }
  }
  
  return { operations };
}