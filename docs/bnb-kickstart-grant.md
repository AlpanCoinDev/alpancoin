# BNB Chain Kickstart — Grant Application

**Project:** AlpanCoin (ALP)
**Submitted:** March 2026
**Website:** alpancoin.com
**Contract:** `0x146a5De5b4F34A9e4203b5D03F5b9CCbd6707224` (BNB Chain Mainnet)

---

## 1. Project Overview

**AlpanCoin (ALP)** is a live, non-custodial index token on BNB Chain Mainnet that gives any user instant exposure to the top 50 cryptocurrencies through a single ERC-20 token. The token's reference price is the simple arithmetic mean of the USD prices of those 50 assets, calculated and stored entirely on-chain by a permissioned oracle contract.

Users send BNB to mint ALP at the current index price, and can redeem ALP for BNB at any time. There is no order book, no counterparty, and no off-chain settlement. The entire protocol — oracle, token, and reserve — lives in two verified smart contracts on BNB Chain.

**What makes AlpanCoin different:**

- **Deployed and live.** Not a concept or testnet demo — both contracts are deployed on BNB Chain Mainnet and the dApp is publicly accessible at alpancoin.com.
- **Radical simplicity.** Two smart contracts, no governance token, no complex tokenomics. Users understand immediately what they are buying.
- **BNB Chain native.** Designed from the ground up for BSC — low fees make micro-investments viable, enabling users who cannot afford $100+ Ethereum gas to access a diversified crypto portfolio.

---

## 2. Problem Statement

Over 400 million people globally hold cryptocurrency, yet the vast majority hold only one or two assets — almost always Bitcoin or Ethereum. The barriers to building a diversified crypto portfolio are significant:

- **Complexity:** Tracking, buying, and managing 50 different assets across multiple exchanges requires significant time and expertise.
- **Cost:** Each purchase is a separate transaction with its own fee. On Ethereum, diversifying across 50 assets costs hundreds of dollars in gas alone.
- **Access:** Institutional index products (ETFs, structured notes) are unavailable in most jurisdictions and require minimum investments of thousands of dollars.
- **Rebalancing burden:** As rankings change, manual rebalancing is tedious and costly.

The result is that most retail investors either pick a few assets and accept concentration risk, or pay high fees for centralised managed products that require KYC and custody.

---

## 3. Solution

AlpanCoin solves this with a single on-chain primitive:

**Holding 1 ALP = holding a proportional slice of the top-50 crypto market.**

The protocol flow is two transactions:

1. **Mint:** User sends BNB → contract reads the oracle → transfers ALP at the index price.
2. **Redeem:** User sends ALP → contract reads the oracle → returns BNB at the index price.

No wrapping, no pool routing, no slippage. The protocol fee is 0.30%, lower than most DeFi protocols and dramatically lower than traditional structured products (typically 1–2% annual management fees plus entry costs).

Because AlpanCoin is on BNB Chain, the full round-trip (mint + redeem) costs under $0.10 in gas, making it the most accessible diversified crypto exposure product available on-chain.

---

## 4. Traction and Current Status

| Milestone | Status |
|---|---|
| PriceOracle deployed on BNB Chain Mainnet | ✅ `0x30E23bf1831037E675c1422da358A27F5eF2e0C3` |
| 50 assets seeded with initial prices | ✅ March 2026 |
| AlpanCoin (ALP) deployed on BNB Chain Mainnet | ✅ `0x146a5De5b4F34A9e4203b5D03F5b9CCbd6707224` |
| Web dApp (alpancoin.com) live with MetaMask | ✅ |
| BscScan verification in progress | ✅ |
| Smart contract audit | 📅 Q2 2026 |
| PancakeSwap liquidity pool | 📅 Q2 2026 |

The protocol is fully functional today. Any user can visit alpancoin.com, connect MetaMask, and mint ALP with BNB in under 30 seconds.

---

## 5. Technical Architecture

### Smart Contracts (Solidity 0.8.24, OpenZeppelin v5)

**PriceOracle.sol**
- Stores prices for up to 50 assets (8-decimal precision, Chainlink convention)
- Calculates and caches the simple arithmetic mean index price on every update
- Role-based access: `DEFAULT_ADMIN_ROLE` for governance, `KEEPER_ROLE` for price updates
- Staleness protection: prices older than 1 hour cause mint/redeem to revert

**AlpanCoin.sol**
- ERC-20 with 21M token supply cap
- `mint()` — payable, converts BNB to ALP at current index price
- `redeem(uint256)` — burns ALP, returns BNB
- Reentrancy guard, pausable, role-based governance
- `previewMint` / `previewRedeem` view functions for frontend fee estimation

### Frontend
- Vanilla HTML/CSS/JavaScript (zero framework dependencies)
- ethers.js v6 for BNB Chain interaction
- Auto-detects wallet, auto-switches to BSC network
- Real-time index price, all 50 asset prices, user balance

### Infrastructure
- Hardhat 2.22 development environment
- Automated deployment scripts with gas estimation
- Keeper script for price updates (Node.js + ethers.js)

---

## 6. Team

**Nuria Vinyarta** — Founder & Lead Developer
*Alicante, Spain*

Full-stack developer and independent DeFi researcher. Designed and implemented AlpanCoin end-to-end: protocol architecture, Solidity smart contracts, Hardhat deployment pipeline, keeper infrastructure, and the web frontend. Focused on making DeFi products that are genuinely simple for non-expert users to understand and use.

*This is a solo founder project. Grant funding will be used to bring in additional expertise (security audit, frontend design) rather than to pay the founder's salary.*

---

## 7. Grant Request

**Amount requested: $25,000 USD (equivalent in BNB)**

### Use of Funds

| Category | Amount | Description |
|---|---|---|
| Smart contract security audit | $12,000 | Independent audit by a reputable firm (Certik, Hacken, or Peckshield). This is the single highest-priority use of the grant — a protocol handling user funds must be audited before growing its TVL. |
| Keeper infrastructure | $4,000 | Redundant price-feed servers with monitoring, alerting, and automatic failover. Removes the single-point-of-failure in the current keeper setup. |
| Liquidity bootstrap | $5,000 | Initial ALP/BNB liquidity on PancakeSwap to enable secondary market trading, reducing reliance on the mint/redeem mechanism alone. |
| Frontend & UX improvements | $2,500 | Mobile-responsive redesign, historical index price chart, and a portfolio calculator tool to improve conversion for first-time users. |
| Legal & compliance review | $1,500 | Basic legal review of the protocol structure and terms of service for the website. |

**Total: $25,000**

No portion of the grant is allocated to team compensation. All funds go directly to product, security, and ecosystem development.

---

## 8. Alignment with BNB Chain Ecosystem

AlpanCoin is a net positive for BNB Chain in several concrete ways:

1. **BNB demand.** Every ALP mint requires BNB. Growing ALP supply means growing BNB locked in the protocol.
2. **TVL contribution.** BNB held in the reserve contract contributes directly to BNB Chain TVL metrics.
3. **New users.** A simple, explainable DeFi product ("one token = top 50 crypto") is an effective entry point for users new to DeFi, who will explore the broader BNB Chain ecosystem once they are comfortable.
4. **PancakeSwap volume.** Secondary market trading of ALP on PancakeSwap will generate swap fees and volume for the ecosystem.
5. **BSC-native design.** AlpanCoin was built specifically for BNB Chain's economics — it would not be viable on Ethereum due to gas costs. We are not a cross-chain port; BSC is the primary chain.

---

## 9. Roadmap (Grant-Funded Milestones)

### Month 1–2 (Security)
- Engage and complete smart contract audit
- Deploy redundant keeper infrastructure
- Publish audit report publicly

### Month 3 (Liquidity & Growth)
- Launch ALP/BNB pool on PancakeSwap with bootstrapped liquidity
- Release improved frontend with price chart and calculator
- Begin community building (Twitter/X, Telegram)

### Month 4–6 (Governance & Expansion)
- Migrate admin to Gnosis Safe multi-sig
- Publish v2 specification (market-cap-weighted index variant)
- Apply for listing on DeFi aggregator dashboards (DefiLlama, DappRadar)
- Begin cross-chain research (BNB Chain CCIP / LayerZero)

### Success Metrics (6 months post-grant)
- Total Value Locked: >$100,000 BNB in reserve
- Unique wallets that have minted ALP: >500
- PancakeSwap pool liquidity: >$50,000
- Audit report: published and all critical/high findings resolved

---

## 10. Links and References

| Resource | Link |
|---|---|
| Website | https://sage-salamander-28977d.netlify.app |
| AlpanCoin contract | https://bscscan.com/address/0x146a5De5b4F34A9e4203b5D03F5b9CCbd6707224 |
| PriceOracle contract | https://bscscan.com/address/0x30E23bf1831037E675c1422da358A27F5eF2e0C3 |
| Whitepaper | https://alpancoin.com/whitepaper |
| GitHub | https://github.com/AlpanCoinDev/alpancoin |

---

## 11. Contact

**Nuria Vinyarta**
Alicante, Spain
nuria@alpancoin.com

---

*AlpanCoin is an open-source, non-custodial DeFi protocol. This application is submitted in good faith and all information provided is accurate to the best of the applicant's knowledge.*
