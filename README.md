# Mono & DIV Economy Game

A server-authoritative crypto-domination economic simulation built around Mono and DIV.

Mono is designed as the system's stability, payment, and reserve asset. DIV is designed as the system's growth, dividend-expectation, and speculative network asset.

The goal of the simulation is not simply to maximise fiat. The goal is to grow Mono and DIV into a dominant monetary system while maintaining treasury control, preserving trust, avoiding inventory collapse, surviving external shocks, and gradually reducing dependence on fiat.

This is a fictional economic simulation and game model, not financial advice or a real-world investment system.

---

## 1. Core Concept

The player controls treasury policy.

The server controls the outside economy.

The player can influence the market through buy points, sell points, treasury listings, dividends, and reserve strategy. However, the player cannot directly command market prices, demand, adoption, trust, liquidity, volatility, or fiat displacement.

The core simulation principle is:

```text
Policy
→ market response
→ treasury execution
→ balance-sheet change
→ price movement
→ trust update
→ adoption change
→ fiat displacement pressure
```

The server should always be able to explain why major economic changes happened.

---

## 2. UI Reference

The visual and gameplay reference is:

```text
mono_div_coin_gamev3.html
```

The UI should remain a treasury-control dashboard with:

- Mono market price
- DIV market price
- Treasury fiat value
- Treasury Mono
- Treasury DIV
- Circulating Mono
- Circulating DIV
- Mono buy/sell controls
- DIV floor, mid-zone, and top-point controls
- Dividend controls
- Scenario news
- Warnings
- Charts
- Economy audit pages

The browser is the display and control layer.

The server is the economy.

---

## 3. Recommended Architecture

### Frontend

The frontend should use:

- HTML
- CSS
- JavaScript
- Chart rendering
- WebSocket connection to the server

The frontend is responsible for:

- Displaying the game state
- Rendering charts
- Sending player policy changes
- Showing warnings
- Showing explanations
- Providing access to `/`, `/economy`, `/treasury`, and `/defaults`

### Backend

The backend should use:

- Node.js
- Express
- WebSocket server
- Modular simulation engines
- Server-side real-time game loop

The backend is responsible for:

- Owning the game state
- Running the economy
- Calculating market prices
- Calculating demand and adoption
- Executing treasury policy
- Allocating fiat reserves
- Updating trust and confidence
- Running scenarios and shocks
- Calculating fiat displacement
- Saving state
- Broadcasting updates to the frontend

### Database

The database should use:

- Postgres for saved games, users, scenarios, event history, snapshots, and long-term simulation records
- Optional Redis later for fast live state, caching, and multiplayer/session scaling

### Deployment

Deployment should use:

- GitHub repository
- Fly.io app
- Dockerfile
- `fly.toml`
- GitHub Actions auto-deploy workflow

---

## 4. Economic Engine Architecture

The server economy should be divided into separate engines:

```text
Price Market Engine
Demand & Adoption Engine
Treasury Execution Engine
Treasury Fiat Allocation Engine
Confidence / Trust Engine
Scenario & Shock Engine
Fiat Displacement Engine
Invariant Engine
Explanation Engine
```

Each engine should have a clear responsibility. The system should not become one giant economy file.

---

## 5. Engine Responsibilities

### Price Market Engine

Responsible for:

- Mono market price
- DIV market price
- Fundamental price estimates
- Order-flow pressure
- Liquidity impact
- Volatility
- Momentum
- Market depth
- DIV overheating
- Top-point pressure
- Price explanations

The market price must be separate from the player's midpoint. The midpoint is a policy reference. The market price is the server-discovered price.

### Demand & Adoption Engine

Responsible for:

- Public demand for Mono
- Public demand for DIV
- Desired buy pressure
- Desired sell pressure
- Agent-group demand
- Attention
- Trial use
- Active use
- Sticky adoption
- Merchant adoption
- Business adoption
- Institutional adoption
- Churn
- Adoption quality

Demand is a flow. Adoption is a stock. Price is an outcome.

The engine must distinguish between temporary hype and durable monetary adoption.

### Treasury Execution Engine

Responsible for:

- Executing treasury buy/sell policy
- Applying buy points
- Applying sell points
- Handling listed supply
- Determining how much the public actually buys
- Determining how much the public actually sells back
- Updating treasury Mono
- Updating treasury DIV
- Updating circulating Mono
- Updating circulating DIV
- Updating treasury fiat
- Handling dividends as execution events
- Measuring execution quality

The player sets policy. The server determines actual execution.

### Treasury Fiat Allocation Engine

Responsible for:

- Multi-currency fiat balances
- Automatic balanced allocation
- Currency-level interest
- Inflation
- FX decay
- Effective USD return
- Real return
- Currency trust
- GDP and banking depth
- Local M2 saturation
- Liquidity quality
- Capital-control risk
- Global fiat usefulness
- Liquid support capacity

The treasury should not hold one generic USD balance internally. It should hold a global basket of fiat currencies, while the main UI shows the simplified USD-equivalent total.

### Confidence / Trust Engine

Responsible for:

- Mono stability trust
- DIV dividend trust
- Treasury inventory trust
- Treasury fiat trust
- Liquidity trust
- Adoption trust
- Policy consistency trust
- Regulatory survival trust
- Systemic trust
- Run risk
- Panic risk
- Trust regime
- Trust explanations

Trust should rise slowly through repeated good performance and fall quickly after visible failures.

### Scenario & Shock Engine

Responsible for:

- Scenario selection
- Scenario intensity
- Scenario duration
- Scenario clustering
- Difficulty effects
- Exogenous shocks
- Endogenous shocks
- Second-round effects
- Recovery profiles
- Active scenario history
- Scenario explanations

Scenarios should not be random flavour text. Each scenario should affect the economy through structured variables.

### Fiat Displacement Engine

Responsible for:

- Fiat Displacement Index
- Fiat Usefulness Score
- Savings adoption
- Payment adoption
- Merchant adoption
- Business settlement adoption
- Unit-of-account adoption
- Reserve adoption
- Government resistance
- Banking friction
- Treasury fiat dependence
- Fiat meaning-collapse stages

Fiat should become less meaningful only when Mono and DIV take over the real functions of money.

### Invariant Engine

Responsible for enforcing hard simulation rules every tick.

The invariant engine should ensure:

- Treasury Mono cannot go below zero.
- Treasury DIV cannot go below zero.
- Circulating Mono cannot go below zero.
- Circulating DIV cannot go below zero.
- Treasury fiat cannot be spent twice.
- Dividends cannot distribute more DIV than treasury owns.
- Buy point cannot exceed sell point.
- Public purchases from treasury must increase circulating supply.
- Public sales to treasury must decrease circulating supply.
- Every balance-sheet change must have a matching cause.
- Strategic reserve warnings trigger when treasury Mono or DIV approaches 30T.
- The system cannot create money, coins, demand, or adoption without a defined rule.

### Explanation Engine

Responsible for generating human-readable explanations.

Every major movement should be explainable.

Examples:

```text
Mono weakened because sell pressure exceeded treasury support capacity while liquidity trust fell.
```

```text
DIV rose because dividend expectations increased, but volatility also rose because demand was mostly speculative.
```

```text
Treasury fiat increased, but treasury control fell because DIV inventory moved below the strategic reserve target.
```

---

## 6. Recommended Project Structure

```text
mono-div-economy-game/

  frontend/
    index.html
    styles.css
    client.js
    charts.js
    pages/
      economy.html
      treasury.html
      defaults.html

  server/
    index.js
    gameLoop.js
    state.js
    websocket.js

    engines/
      priceMarketEngine.js
      demandAdoptionEngine.js
      treasuryExecutionEngine.js
      treasuryFiatAllocationEngine.js
      confidenceTrustEngine.js
      scenarioShockEngine.js
      fiatDisplacementEngine.js
      invariantEngine.js
      explanationEngine.js

    data/
      scenarios.json
      scenarioFamilies.json
      agentProfiles.json
      economicRegimes.json
      difficultyParams.json
      adoptionModes.json
      currencyModel.json
      balanceConfig.json

  db/
    schema.sql
    migrations/

  tests/
    priceMarketEngine.test.js
    demandAdoptionEngine.test.js
    treasuryExecutionEngine.test.js
    treasuryFiatAllocationEngine.test.js
    confidenceTrustEngine.test.js
    scenarioShockEngine.test.js
    fiatDisplacementEngine.test.js
    invariantTests.test.js

  Dockerfile
  fly.toml
  package.json
  .github/
    workflows/
      fly.yml
```

---

## 7. Server Tick Loop

The server should run the economy in real time.

The browser does not simulate the economy. The server owns the tick loop.

Every tick should follow this structure:

```text
1. Load current state and elapsed real time
2. Process catch-up ticks if the player was away
3. Validate player policy settings
4. Apply scheduled or manual player policy actions
5. Update macro regime and scenario state
6. Apply treasury fiat allocation, yield, FX decay, and inflation
7. Calculate pre-tick confidence and treasury control
8. Calculate agent demand and adoption flows
9. Calculate desired buy and sell pressure
10. Execute treasury buy/sell rules against actual market capacity
11. Apply dividend execution and dividend effects
12. Update circulating Mono and DIV
13. Update Mono and DIV market prices
14. Update volatility, liquidity, momentum, and market depth
15. Update confidence/trust after execution results
16. Update fiat displacement and fiat usefulness
17. Check invariants and failure conditions
18. Generate explanations and warnings
19. Save state and snapshot
20. Broadcast state to browser
```

---

## 8. Browser State Payload

The browser should receive a structured state object from the server.

```json
{
  "time": {},
  "prices": {},
  "treasury": {},
  "circulation": {},
  "market": {},
  "adoption": {},
  "confidence": {},
  "fiat": {},
  "scenarios": {},
  "warnings": [],
  "explanations": [],
  "charts": {}
}
```

The main page should show simplified gameplay information. The `/economy` and `/treasury` pages should show the full audit information.

---

## 9. Pages

### `/`

Main gameplay dashboard.

Shows the player-facing treasury controls, prices, charts, warnings, and core balances.

### `/economy`

Full economy audit page.

Shows the server brain:

- Mono economy
- DIV economy
- Treasury execution
- Confidence and trust
- Macro economy
- Scenario state
- Explanations

### `/treasury`

Full fiat reserve model page.

Shows:

- Currency accounts
- Local balances
- USD-equivalent balances
- Nominal yields
- Inflation
- FX decay
- Effective USD returns
- Real returns
- Trust scores
- Banking depth
- GDP depth
- M2 saturation
- Liquidity scores
- Capital-control penalties
- Risk warnings

### `/defaults`

Simulation universe settings page.

Controls:

- Difficulty
- Adoption mode
- Model preset
- Treasury cap mode
- Treasury fiat cap
- Offline simulation
- Tick speed
- Scenario frequency
- Scenario intensity
- Starting values

---

## 10. Default Settings

Recommended defaults:

```text
Difficulty: Normal
Adoption mode: Normal
Model preset: Balanced realism
Treasury allocation mode: Balanced automatic allocation
Offline simulation: Unlimited server-side real time
Treasury fiat cap reference: $100T global-scale
Strategic reserve target: 30T Mono and 30T DIV
```

Difficulty should not change the economic laws. It should change stress conditions.

Difficulty affects:

- Scenario frequency
- Scenario severity
- Scenario clustering
- Forgiveness
- Arbitrage aggressiveness
- Panic multiplier
- Regulatory sensitivity
- Liquidity fragility
- Trust recovery speed

Adoption mode affects market adoption rate, not difficulty.

High adoption can still be dangerous because it can create bubbles, liquidity stress, inventory depletion, and regulatory pressure.

---

## 11. Strategic Reserve Rule

The treasury should aim to keep at least:

```text
30T Mono
30T DIV
```

Inventory zones:

```text
70T–100T: Excellent control
50T–70T: Strong control
30T–50T: Weakening control
10T–30T: Danger zone
0T–10T: Critical zone
0T: Lost sell-side control
```

The player should be allowed to sell below 30T, but the server should treat it as dangerous.

If treasury Mono or DIV falls below strategic reserve levels, the economy should react through:

- Lower confidence
- Higher volatility
- Weaker liquidity
- Higher arbitrage pressure
- Lower dividend credibility
- Weaker top-point control
- Higher panic risk

A treasury with huge fiat but no Mono and no DIV should not be considered strong.

---

## 12. Scenario System

The 100-scenario system should be designed as structured shocks, not flat event cards.

Each scenario should include:

- ID
- Name
- Category
- Intensity
- Duration
- Rarity
- Difficulty multiplier
- Economic regime dependency
- Mono demand impact
- DIV demand impact
- Mono sell-pressure impact
- DIV sell-pressure impact
- Liquidity impact
- Volatility impact
- Confidence impact
- Treasury stress impact
- Fiat usefulness impact
- Regulatory pressure impact
- Adoption quality impact
- Temporary effects
- Persistent effects
- Second-round effects
- Recovery profile
- Affected engines
- Explanation text

The scenario system should include:

```text
Exogenous scenarios:
Events from the outside world, such as recession, regulation, banking stress, promotion, exchange outages, inflation shocks, and competitor events.

Endogenous scenarios:
Events triggered by the player's own system state, such as treasury inventory falling below 30T, DIV overheating, Mono support failure, fiat saturation, dividend unsustainability, adoption overload, and arbitrage vulnerability.
```

The scenario system should be the main difficulty engine.

---

## 13. Difficulty Settings

### Sandbox

Purpose: testing and learning.

```text
Minor scenarios: 4–8 per simulated year
Moderate scenarios: 1–3 per simulated year
Serious scenarios: rare
Severe scenarios: normally disabled
Crisis scenarios: manual only
```

### Normal

Purpose: default realistic mode.

```text
Minor scenarios: 12–24 per simulated year
Moderate scenarios: 4–8 per simulated year
Serious scenarios: 1–2 per simulated year
Severe scenarios: once every 3–5 simulated years
Crisis scenarios: once every 10–20 simulated years
```

### Hard

Purpose: realistic but more punishing market conditions.

```text
Minor scenarios: 24–36 per simulated year
Moderate scenarios: 8–12 per simulated year
Serious scenarios: 3–5 per simulated year
Severe scenarios: 1 per simulated year
Crisis scenarios: once every 5–10 simulated years
```

### Brutal

Purpose: adversarial stress testing.

```text
Minor scenarios: 36–60 per simulated year
Moderate scenarios: 12–24 per simulated year
Serious scenarios: 6–10 per simulated year
Severe scenarios: 2–4 per simulated year
Crisis scenarios: once every 2–4 simulated years
```

### Historical Chaos

Purpose: crisis-laboratory mode.

```text
Minor scenarios: 60+ per simulated year
Moderate scenarios: 24+ per simulated year
Serious scenarios: 10+ per simulated year
Severe scenarios: 4+ per simulated year
Crisis scenarios: 1–2 per simulated year
```

Historical Chaos should represent a stress-test world where multiple historical-style crisis patterns can overlap.

---

## 14. Definition of Accuracy

For this simulation, “accurate” means structurally coherent, not perfectly predictive.

The game is accurate when:

```text
1. Balance sheets remain consistent.
2. Prices move for explainable economic reasons.
3. Demand is separated from adoption.
4. Treasury execution changes circulating supply.
5. Fiat reserves are valued nominally and realistically.
6. Trust rises slowly and falls quickly.
7. Scenarios expose existing fragility.
8. Difficulty changes stress conditions, not economic laws.
9. Fiat displacement depends on monetary function, not price hype.
10. The server can explain every major move.
```

The economy can surprise the player, but it should not behave in a nonsense way.

---

## 15. Success Condition

The goal is not simply to maximise fiat.

The goal is:

```text
Grow Mono and DIV into a dominant monetary system while maintaining treasury control, preserving trust, avoiding inventory collapse, surviving shocks, and gradually reducing dependence on fiat.
```

A successful player should grow:

- Circulating Mono
- Circulating DIV
- Treasury fiat strength
- Real treasury purchasing power
- Adoption quality
- Merchant acceptance
- Business settlement
- Systemic trust
- Fiat displacement

while preserving:

- Mono stability
- DIV credibility
- Treasury Mono inventory
- Treasury DIV inventory
- Liquid support capacity
- Reasonable fiat allocation
- Strong treasury control score

The game should reward controlled monetary expansion, not reckless growth.

---

## 16. Build Order

Recommended build order:

```text
1. Server-authoritative state
2. Basic UI connection using mono_div_coin_gamev3.html as reference
3. WebSocket live updates
4. Invariant engine
5. Treasury execution engine
6. Price market engine
7. Demand & adoption engine
8. Confidence / trust engine
9. Treasury fiat allocation engine
10. Scenario & shock engine
11. Fiat displacement engine
12. /economy audit page
13. /treasury audit page
14. /defaults page
15. Persistence with Postgres
16. Balancing tools
17. Fly.io deployment
18. Public online version
```

The invariant engine should come early because every later engine depends on accounting consistency.

The treasury execution engine should come before the advanced price and demand systems because it defines how player policy affects actual balances.

The scenario engine should be added after the core economy works, because scenarios should stress the model rather than hide weak model design.

---

## 17. Balancing and Testing Tools

The simulation should eventually include tools to run fast offline tests.

The balancing system should test:

- 10-year simulations
- 100-year simulations
- 1,000-year simulations
- All difficulty modes
- All adoption modes
- High-demand conditions
- Low-demand conditions
- Low treasury inventory
- High treasury inventory
- High fiat reserves
- Low fiat reserves
- DIV bubble conditions
- Mono de-peg conditions
- Banking panic conditions
- Recession conditions
- Regulatory attack conditions
- Fiat displacement endgame conditions

The tests should detect:

- Impossible negative balances
- Treasury inventory bugs
- Unrealistic infinite price growth
- Unrealistic total collapse
- Excessive fiat accumulation
- Broken adoption curves
- Broken scenario frequency
- DIV overheating loops
- Mono stability failures
- Unexplainable price movements

The simulation should be tuned until it produces plausible behaviour across long time periods.

---

## 18. Final Implementation Principle

The game should feel like the player is managing a treasury-controlled monetary system inside an outside economy.

The player controls policy.

The server controls reality.

The player can influence the market, but cannot command it.

Every major outcome should have an economically coherent cause.
