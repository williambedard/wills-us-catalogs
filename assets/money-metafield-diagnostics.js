/**
 * MONEY Metafield Diagnostics Tool
 * 
 * This script provides comprehensive debugging for MONEY metafield access issues.
 * Run `MoneyMetafieldDiagnostics.runFullDiagnostic()` in browser console.
 */

class MoneyMetafieldDiagnostics {
  
  static runFullDiagnostic() {
    console.group('🔍 COMPREHENSIVE MONEY METAFIELD DIAGNOSTIC');
    
    // Check window objects
    this.checkWindowObjects();
    
    // Analyze productMetafields structure
    if (window.productMetafields) {
      this.analyzeProductMetafields();
    }
    
    // Analyze debug data
    if (window.debugMetafields) {
      this.analyzeDebugMetafields();
    }
    
    // Test JavaScript parsing
    this.testJavaScriptParsing();
    
    // Provide recommendations
    this.provideRecommendations();
    
    console.groupEnd();
  }
  
  static checkWindowObjects() {
    console.group('📊 Window Object Availability');
    console.log('✓ window.productMetafields:', !!window.productMetafields);
    console.log('✓ window.debugMetafields:', !!window.debugMetafields);
    console.log('✓ UltraSimpleDeposit class:', !!window.UltraSimpleDeposit);
    
    if (window.productMetafields) {
      console.log('📈 productMetafields count:', Object.keys(window.productMetafields).length);
    }
    
    console.groupEnd();
  }
  
  static analyzeProductMetafields() {
    console.group('🎯 Product Metafields Analysis');
    
    Object.entries(window.productMetafields).forEach(([variantId, data]) => {
      console.group(`Variant ${variantId}`);
      
      const total = (parseFloat(data.fuel_pump_deposit) || 0) + 
                   (parseFloat(data.injector_deposit) || 0) + 
                   (parseFloat(data.fuel_line_deposit) || 0);
      
      console.log('💰 Individual deposits:', {
        fuel_pump: data.fuel_pump_deposit,
        injector: data.injector_deposit,
        fuel_line: data.fuel_line_deposit
      });
      
      console.log('💵 Total calculated:', total);
      console.log('🔧 Method used:', data.method || 'unknown');
      
      if (total === 0) {
        console.warn('⚠️ Zero total - potential issue');
      } else {
        console.log('✅ Non-zero total detected');
      }
      
      console.groupEnd();
    });
    
    console.groupEnd();
  }
  
  static analyzeDebugMetafields() {
    console.group('🔍 Debug Metafields Analysis');
    
    Object.entries(window.debugMetafields).forEach(([variantId, data]) => {
      console.group(`Debug for Variant ${variantId}`);
      
      // Check raw data
      console.log('📋 Raw metafield JSON:', data.raw_data);
      
      // Check string extraction
      console.log('✂️ String extraction results:', data.extracted_strings);
      
      // Compare approaches
      const v1Total = Object.values(data.v1_amounts || {}).reduce((sum, val) => sum + (parseFloat(val) || 0), 0);
      const v2Total = Object.values(data.v2_amounts || {}).reduce((sum, val) => sum + (parseFloat(val) || 0), 0);
      
      console.log('🔢 Method comparison:', {
        'Direct .amount (v1)': v1Total,
        'String manipulation (v2)': v2Total
      });
      
      if (v1Total > 0 && v2Total > 0) {
        console.log('✅ Both methods working');
      } else if (v1Total > 0) {
        console.log('⚡ Only direct .amount method working');
      } else if (v2Total > 0) {
        console.log('⚡ Only string manipulation method working');
      } else {
        console.warn('❌ Neither method extracting values');
      }
      
      console.groupEnd();
    });
    
    console.groupEnd();
  }
  
  static testJavaScriptParsing() {
    console.group('🧪 JavaScript MONEY Field Parsing Tests');
    
    // Test common MONEY field formats
    const testCases = [
      '{"amount":"800.0","currency_code":"USD"}',
      '{"amount":"0","currency_code":"USD"}',
      '{"amount":"150.50","currency_code":"USD"}',
      '{"amount":800.0,"currency_code":"USD"}', // Without quotes on number
    ];
    
    testCases.forEach((testCase, index) => {
      console.group(`Test Case ${index + 1}: ${testCase}`);
      
      try {
        // Test JSON parsing
        const parsed = JSON.parse(testCase);
        console.log('✅ JSON.parse successful:', parsed);
        console.log('💰 Amount:', parsed.amount, typeof parsed.amount);
        console.log('🔢 Numeric amount:', parseFloat(parsed.amount));
        
        // Test string manipulation (Liquid-like)
        const stringExtracted = testCase
          .replace('{"amount":"', '')
          .replace('","currency_code":"USD"}', '')
          .replace('"', '');
        console.log('✂️ String extraction:', stringExtracted, parseFloat(stringExtracted));
        
      } catch (error) {
        console.error('❌ Parsing error:', error.message);
      }
      
      console.groupEnd();
    });
    
    console.groupEnd();
  }
  
  static provideRecommendations() {
    console.group('💡 Recommendations');
    
    let workingApproaches = [];
    let issues = [];
    
    // Analyze results and provide recommendations
    if (window.productMetafields) {
      const allVariants = Object.values(window.productMetafields);
      const workingVariants = allVariants.filter(v => {
        const total = (parseFloat(v.fuel_pump_deposit) || 0) + 
                     (parseFloat(v.injector_deposit) || 0) + 
                     (parseFloat(v.fuel_line_deposit) || 0);
        return total > 0;
      });
      
      if (workingVariants.length > 0) {
        const methods = [...new Set(workingVariants.map(v => v.method).filter(Boolean))];
        workingApproaches.push(`JavaScript extraction working (methods: ${methods.join(', ')})`);
      } else {
        issues.push('JavaScript extraction failing for all variants');
      }
    }
    
    if (window.debugMetafields) {
      const debugData = Object.values(window.debugMetafields);
      const v1Working = debugData.some(d => {
        const total = Object.values(d.v1_amounts || {}).reduce((sum, val) => sum + (parseFloat(val) || 0), 0);
        return total > 0;
      });
      const v2Working = debugData.some(d => {
        const total = Object.values(d.v2_amounts || {}).reduce((sum, val) => sum + (parseFloat(val) || 0), 0);
        return total > 0;
      });
      
      if (v1Working) {
        workingApproaches.push('Liquid: Direct .amount property access');
      } else {
        issues.push('Liquid: .amount property access failing');
      }
      
      if (v2Working) {
        workingApproaches.push('Liquid: String manipulation extraction');
      } else {
        issues.push('Liquid: String manipulation failing');
      }
    }
    
    console.log('✅ Working approaches:', workingApproaches.length ? workingApproaches : ['None detected']);
    console.log('❌ Issues found:', issues.length ? issues : ['None']);
    
    // Provide specific recommendations
    if (issues.includes('Liquid: .amount property access failing')) {
      console.warn('🔧 Recommendation: Use string manipulation approach in Liquid templates');
      console.log('   Example: metafield | remove: \'{"amount":"\' | remove: \'","currency_code":"USD"}\' | remove: \'"\' | times: 1');
    }
    
    if (workingApproaches.length === 0) {
      console.error('🚨 Critical: No working approaches detected');
      console.log('   1. Verify metafields exist and contain MONEY data');
      console.log('   2. Check metafield namespace/key names');
      console.log('   3. Test with manual data in Liquid');
    }
    
    console.groupEnd();
  }
  
  // Utility method to test specific metafield formats
  static testSpecificFormat(jsonString) {
    console.group(`🧪 Testing specific format: ${jsonString}`);
    
    try {
      // JSON parsing
      const parsed = JSON.parse(jsonString);
      console.log('JSON parsed amount:', parsed.amount, typeof parsed.amount);
      
      // String manipulation
      const extracted = jsonString
        .replace(/^\{"amount":"?/, '')
        .replace(/"?,"currency_code":"USD"\}$/, '');
      console.log('String extracted:', extracted, parseFloat(extracted));
      
    } catch (error) {
      console.error('Error:', error.message);
    }
    
    console.groupEnd();
  }
}

// Auto-expose to window for manual testing
window.MoneyMetafieldDiagnostics = MoneyMetafieldDiagnostics;

// Auto-run if debug mode detected
if (window.debugMetafields || window.location.search.includes('debug=metafields')) {
  setTimeout(() => {
    MoneyMetafieldDiagnostics.runFullDiagnostic();
  }, 2000);
}