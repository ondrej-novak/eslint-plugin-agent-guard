# Interface Design for Testability

Good interfaces make testing natural:

1. **Accept dependencies, don't create them**

   ```javascript
   // Testable
   function processOrder({ order, paymentGateway }) {}

   // Hard to test
   function processOrder(order) {
     const gateway = new StripeGateway();
   }
   ```

2. **Return results, don't produce side effects**

   ```javascript
   // Testable
   function calculateDiscount(cart) {
     return { amount };
   }

   // Hard to test
   function applyDiscount(cart) {
     cart.total -= discount;
   }
   ```

   The hooks follow this: `protectHook(tool)` and `lintFeedbackHook(tool)` take the JSON Claude Code sends and return the decision. Reading stdin and writing stdout stay in `bin/`.

3. **Small surface area**
   - Fewer methods = fewer tests needed
   - Fewer params = simpler test setup (the presets allow two; pass one object and destructure it)
