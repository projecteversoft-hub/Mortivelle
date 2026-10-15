# 05 — Homebuyer Experience and Calculators

## 1. UX principles
- The calculator is usable without account creation or contact details.
- Display assumptions and estimates before asking for an optional next step.
- Make labels accessible, responsive and understandable to non-experts.
- Do not present estimates as approved loan terms, financial advice or a lender offer.
- Do not use deceptive urgency, preselected marketing consent, or misleading rate claims.

## 2. MVP calculators
### Affordability
Inputs may include gross monthly household income, recurring monthly debt, down payment, estimated interest rate, term, property tax, insurance, HOA and optional mortgage insurance assumptions.
Outputs include estimated purchase budget and monthly housing cost with assumptions displayed.
Avoid representing a result as a credit decision or approval.

### Monthly payment / property true cost
Inputs include purchase price, down payment, rate assumption, term, taxes, insurance, HOA and other disclosed costs.
Outputs separate principal and interest from estimated recurring ownership costs and estimated cash due at closing where assumptions are available.
Show which values are user-provided versus defaulted or externally sourced.

### Rent-versus-buy
Compare user-defined rent growth, home-price appreciation, maintenance, transaction costs, time horizon, mortgage terms and opportunity cost assumptions.
Expose assumptions and include a warning that outcomes depend heavily on assumptions. Do not claim one choice is universally better.

## 3. Calculation requirements
- Implement pure calculation functions in a testable module.
- Define currency as USD for the initial US market.
- Validate numeric ranges and handle zero/invalid denominators safely.
- Use decimal-safe handling or document rounding strategy; avoid floating-point artifacts in user-facing money values.
- Include unit tests for boundaries and known examples.
- Keep formulas and default assumptions documented and versioned.
- Never silently invent taxes, insurance or rates. If values are illustrative defaults, label them as such.
- External rate/property data is disabled until provider rights and source attribution are approved.

## 4. Lead capture placements
After results, offer distinct optional actions:
- Save this scenario.
- Receive rate or market alerts.
- Request contact from a mortgage professional.

Each action has a purpose-specific disclosure and permission choice. Do not combine unrelated permissions into one ambiguous checkbox. Do not block the calculator result behind a lead form.

## 5. Accessibility and responsiveness
- Keyboard accessible controls and focus indicators.
- Programmatic labels and helpful validation.
- Sufficient contrast and responsive layouts for mobile.
- Do not communicate status by color alone.
- Support reduced motion.
- Show validation errors adjacent to the relevant field and summarize errors where helpful.

## 6. Analytics
Record only necessary events such as calculator opened/completed and optional action selected. Do not send raw financial inputs to generic analytics tools. Aggregate or minimize financial inputs and prohibit third-party session replay on pages that collect personal or sensitive financial data unless a reviewed configuration establishes appropriate protections.

## 7. Acceptance criteria
- Users can complete each calculator without signing in.
- Invalid inputs show accessible validation.
- Output includes assumptions and estimate disclaimers.
- Results are reproducible from the same inputs and calculation version.
- Contact details are not required to view results.
- No sensitive input is leaked into URL query strings, analytics payloads or logs.
