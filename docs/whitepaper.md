# AlpanCoin (ALP) — Whitepaper v1.0

**March 2026**
Website: [alpancoin.com](https://alpancoin.com)
Contract: `0x146a5De5b4F34A9e4203b5D03F5b9CCbd6707224` (BNB Chain Mainnet)

---

## Abstract

AlpanCoin (ALP) is a decentralised index token deployed on BNB Chain that gives any user instant, permissionless exposure to the top 50 cryptocurrencies by market capitalisation through a single ERC-20 token. Its reference price is defined as the simple arithmetic mean of the USD prices of those 50 assets, updated on-chain by a permissioned keeper network. Users mint ALP by sending BNB and redeem ALP back to BNB at any time, with the exchange rate determined entirely by the on-chain oracle — no centralised intermediary, no order book, no slippage beyond the protocol fee.

---

## 1. Introduction

### 1.1 The Diversification Problem

Retail investors who want broad cryptocurrency exposure face a fragmented experience: they must open accounts on multiple exchanges, manage dozens of wallets, rebalance positions manually, and pay trading fees at every step. Institutional-grade index products (ETFs, structured products) are either unavailable in most jurisdictions or require minimum investments that exclude the majority of participants.

### 1.2 Existing Solutions and Their Limitations

| Approach | Limitation |
|---|---|
| Centralised crypto indices (CoinShares, Bitwise) | Custodial risk, geographic restrictions, high fees, accredited investors only |
| DeFi basket protocols (Index Coop, Enzyme) | Complex rebalancing, gas-intensive on Ethereum, liquidity fragmented across pools |
| Manual portfolio | Time-consuming, error-prone, requires active management |

### 1.3 AlpanCoin's Approach

AlpanCoin collapses the complexity of a 50-asset portfolio into a single on-chain primitive:

- **One token, fifty assets.** Holding ALP is economically equivalent to holding an equal-weighted slice of the top-50 crypto market.
- **BNB Chain native.** Sub-second finality and sub-cent fees make micro-transactions viable.
- **Fully on-chain pricing.** No reliance on off-chain APIs at the protocol level; price data is committed to the blockchain before any mint or redeem is processed.
- **Permissionless and non-custodial.** Smart contracts hold no user funds between transactions; redemption is always available.

---

## 2. Protocol Architecture

### 2.1 System Overview

```
  User
   │
   ├─ mint(BNB)  ──────────────────────────────────►  AlpanCoin.sol
   │                                                         │
   └─ redeem(ALP) ─────────────────────────────────►         │
                                                             │ reads
                                                             ▼
                                               PriceOracle.sol
                                                    ▲
                                                    │ updatePrices()
                                               Keeper Network
                                                    ▲
                                                    │
                                            Off-chain price feeds
                                         (CEX APIs, Chainlink, etc.)
```

### 2.2 PriceOracle Contract

`PriceOracle` is the single source of truth for asset prices. It stores up to 50 asset slots, each containing:

- `symbol` — ticker string (e.g. `"BTC"`)
- `price` — USD price with 8 decimal places (Chainlink convention)
- `updatedAt` — Unix timestamp of the last update
- `active` — whether the asset is included in the index average

The contract exposes two roles via OpenZeppelin `AccessControl`:

| Role | Capability |
|---|---|
| `DEFAULT_ADMIN_ROLE` | Add/remove assets, grant/revoke roles |
| `KEEPER_ROLE` | Push price updates (single or batch) |

The **index price** is the simple arithmetic mean of all active assets with a non-zero price, recalculated lazily on every keeper update and cached as a single `uint256`. On-chain reads of the index price are therefore O(1).

**Staleness guard:** Any price older than 1 hour is considered stale. Mint and redeem operations revert if either the index price or the BNB/USD price is stale, protecting users from acting on outdated data.

### 2.3 AlpanCoin Contract

`AlpanCoin` is a standard ERC-20 token extended with mint/redeem mechanics:

```
Roles
─────
DEFAULT_ADMIN_ROLE   → governance
MINTER_ROLE          → privileged mint (airdrops, treasury)
PAUSER_ROLE          → emergency pause
PRICE_UPDATER_ROLE   → update BNB/USD reference price
```

Supply cap: **21,000,000 ALP** (immutable).

### 2.4 Mint Formula

```
                bnbAmount [wei] × bnbUsdPrice [8 dec]
alpAmount  =  ─────────────────────────────────────────
                       indexPrice [8 dec] × 1e10
```

Where `bnbAmount` is the net BNB after deducting the protocol fee, and the result carries 18 decimal places (standard ERC-20). The formula ensures that 1 ALP always represents 1 USD-worth of the index at mint time.

### 2.5 Redeem Formula

The inverse of mint:

```
                alpAmount [18 dec] × indexPrice [8 dec]
bnbAmount  =  ──────────────────────────────────────────
                              bnbUsdPrice [8 dec]
```

A protocol fee is deducted from the gross BNB before sending to the redeemer.

### 2.6 Protocol Fee

The current protocol fee is **0.30%** (30 basis points), configurable by governance up to a maximum of **5%** (500 basis points). Fees are forwarded to the `feeRecipient` address at transaction time.

---

## 3. Token Economics

### 3.1 Token Parameters

| Parameter | Value |
|---|---|
| Name | AlpanCoin |
| Symbol | ALP |
| Decimals | 18 |
| Maximum Supply | 21,000,000 ALP |
| Blockchain | BNB Chain (chainId 56) |
| Contract | `0x146a5De5b4F34A9e4203b5D03F5b9CCbd6707224` |

### 3.2 Price Discovery

ALP does not have a fixed price. Its value at any moment is:

```
ALP price (USD) = indexPrice = mean( price[BTC], price[ETH], … price[ZEC] )
```

At launch (March 2026), the index price was approximately **$1,489**, reflecting the arithmetic mean of the top-50 asset prices at that time.

### 3.3 Index Composition

The index comprises the top 50 cryptocurrencies by market capitalisation at the time of deployment. The initial composition (snapshot: March 2025) includes:

BTC, ETH, BNB, SOL, XRP, DOGE, ADA, AVAX, SHIB, TON, LINK, DOT, TRX, MATIC, NEAR, ICP, LTC, APT, UNI, LEO, ATOM, XLM, ETC, FIL, INJ, IMX, STX, HBAR, VET, MNT, OP, ARB, GRT, EGLD, SAND, AAVE, THETA, XMR, FTM, RUNE, KAS, ALGO, MANA, FLOW, EOS, IOTA, CRV, SNX, CHZ, ZEC.

The composition is subject to periodic governance review to reflect changes in market cap rankings.

### 3.4 Reserve Mechanism

BNB received from mint operations is held in the AlpanCoin contract itself and constitutes the redemption reserve. The contract guarantees that any ALP holder can redeem their tokens for the corresponding BNB value at the current index price, subject to reserve availability. An admin `withdrawBnb` function exists for treasury management and is governed by the `DEFAULT_ADMIN_ROLE`.

---

## 4. Security

### 4.1 Smart Contract Security Measures

- **ReentrancyGuard** on both `mint()` and `redeem()` to prevent re-entrant attacks.
- **Pausable** — `PAUSER_ROLE` can halt mint and redeem in case of an oracle compromise or other emergency.
- **Staleness checks** — both the index price and the BNB/USD price must have been updated within the last hour.
- **Supply cap** — `totalSupply + newMint ≤ MAX_SUPPLY` enforced on every mint.
- **Minimum mint** — 0.001 BNB minimum prevents dust-level griefing.
- **OpenZeppelin v5** — all role, ERC-20, pausable, and reentrancy primitives are sourced from the audited OpenZeppelin Contracts v5 library.

### 4.2 Oracle Security

The keeper network is the primary trust assumption of the protocol. Mitigations:

- Prices are committed on-chain and visible to all users before any trade.
- The 1-hour staleness window limits the window of exploitation in case the keeper fails.
- The admin can deactivate individual assets whose price feeds are compromised.
- Future roadmap includes integrating Chainlink Data Feeds as a secondary oracle source.

### 4.3 Known Limitations

- The simple arithmetic mean is sensitive to high-priced assets (BTC, ETH). A market-cap-weighted or price-normalised approach is planned for v2.
- The protocol currently relies on a single centralised keeper. Decentralisation of the keeper role is a priority for the next development phase.

---

## 5. Roadmap

### Phase 1 — Foundation (Q1 2026) ✅
- Smart contract development and deployment on BNB Chain Mainnet
- PriceOracle seeded with 50 assets and initial prices
- Web frontend (alpancoin.com) with MetaMask integration
- BscScan contract verification

### Phase 2 — Stability (Q2 2026)
- Independent smart contract audit
- Automated keeper with redundant price sources (Binance, CoinGecko, Chainlink)
- Governance multi-sig (Gnosis Safe) replacing single-EOA admin
- PancakeSwap liquidity pool (ALP/BNB)

### Phase 3 — Growth (Q3 2026)
- Market-cap-weighted index variant (ALP-W)
- Mobile-optimised interface and wallet connect v2
- Integration with DeFi aggregators (1inch, ParaSwap)
- Community governance token for index composition votes

### Phase 4 — Ecosystem (Q4 2026)
- Chainlink CCIP cross-chain bridge (ALP on Base, Arbitrum)
- Staking yield from protocol fee distribution
- SDK for third-party integrations
- Institutional API

---

## 6. Team

**Nuria Vinyarta** — Founder & Lead Developer
Alicante, Spain. Full-stack developer and DeFi researcher with a background in financial markets. Conceived, designed, and deployed AlpanCoin end-to-end, including smart contracts (Solidity/Hardhat), on-chain oracle infrastructure, and the web frontend.

---

## 7. Legal Disclaimer

AlpanCoin (ALP) is an experimental DeFi protocol. It is not a security, investment product, or financial instrument. Interacting with the protocol involves significant risk, including but not limited to smart contract bugs, oracle failures, and cryptocurrency price volatility. Users should conduct their own research and consult qualified advisors. This whitepaper is provided for informational purposes only and does not constitute an offer or solicitation to buy or sell any asset.

---

*AlpanCoin — Whitepaper v1.0 — March 2026*
*alpancoin.com*
