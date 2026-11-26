---
"@ingram-tech/nk-billing": minor
---

The customer address carries `line2`. `findOrCreateCustomer` sends `details.address.line2` (it dropped it), and `updateCustomerBillingAddress` takes an optional `line2`. An empty one is not sent.
