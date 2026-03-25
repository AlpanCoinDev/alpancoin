/**
 * AlpanCoin — Keeper: update oracle prices
 *
 * Fetches live USD prices from CoinGecko (free public API, no key required).
 * Compatible with both oracle versions:
 *   - NEW oracle (post-Chainlink migration): calls refreshFromChainlink() first,
 *     then keeper-pushes only assets without a registered feed.
 *   - OLD oracle (pre-Chainlink migration): keeper-pushes all 50 assets.
 *
 * Usage:
 *   npx hardhat run scripts/updatePrices.js --network bscMainnet
 *   npx hardhat run scripts/updatePrices.js --network bscTestnet
 */

const hre = require("hardhat");
const { ethers } = hre;
const fs = require("fs");

// ─── CoinGecko ID mapping for all 50 tracked assets ──────────────────────────
const CG_IDS = {
  BTC:   "bitcoin",
  ETH:   "ethereum",
  BNB:   "binancecoin",
  SOL:   "solana",
  XRP:   "ripple",
  DOGE:  "dogecoin",
  ADA:   "cardano",
  AVAX:  "avalanche-2",
  SHIB:  "shiba-inu",
  TON:   "the-open-network",
  LINK:  "chainlink",
  DOT:   "polkadot",
  TRX:   "tron",
  MATIC: "polygon-ecosystem-token", // renombrado a POL; alias CoinGecko activo
  NEAR:  "near",
  ICP:   "internet-computer",
  LTC:   "litecoin",
  APT:   "aptos",
  UNI:   "uniswap",
  LEO:   "leo-token",
  ATOM:  "cosmos",
  XLM:   "stellar",
  ETC:   "ethereum-classic",
  FIL:   "filecoin",
  INJ:   "injective-protocol",
  IMX:   "immutable-x",
  STX:   "blockstack",
  HBAR:  "hedera-hashgraph",
  VET:   "vechain",
  MNT:   "mantle",
  OP:    "optimism",
  ARB:   "arbitrum",
  GRT:   "the-graph",
  EGLD:  "elrond-erd-2",
  SAND:  "the-sandbox",
  AAVE:  "aave",
  THETA: "theta-token",
  XMR:   "monero",
  FTM:   "fantom",
  RUNE:  "thorchain",
  KAS:   "kaspa",
  ALGO:  "algorand",
  MANA:  "decentraland",
  FLOW:  "flow",
  EOS:   "eos",
  IOTA:  "iota",
  CRV:   "curve-dao-token",
  SNX:   "havven",
  CHZ:   "chiliz",
  ZEC:   "zcash",
};

// ─── Fetch prices from CoinGecko (single batched request) ────────────────────
async function fetchCoinGeckoPrices(symbols) {
  const ids = [...new Set(symbols.map((s) => CG_IDS[s]).filter(Boolean))];
  const url =
    `https://api.coingecko.com/api/v3/simple/price` +
    `?ids=${ids.join(",")}` +
    `&vs_currencies=usd` +
    `&precision=8`;

  const resp = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(15_000),
  });

  if (!resp.ok) throw new Error(`CoinGecko HTTP ${resp.status}: ${await resp.text()}`);
  return await resp.json(); // { "bitcoin": { "usd": 95000.12 }, ... }
}

// ─── Convert USD float to 8-decimal uint256 ──────────────────────────────────
function toPrice8(usd) {
  // Use string multiplication to avoid float precision loss on large values
  return BigInt(Math.round(usd * 1e8));
}

async function main() {
  const deployment     = JSON.parse(fs.readFileSync("deployment.json", "utf8"));
  const { oracleAddr } = deployment;
  if (!oracleAddr) throw new Error("oracleAddr missing from deployment.json");

  const [keeper] = await ethers.getSigners();
  console.log(`\nKeeper  : ${keeper.address}`);
  console.log(`Oracle  : ${oracleAddr}`);
  console.log(`Network : ${hre.network.name}\n`);

  const oracle = await ethers.getContractAt("PriceOracle", oracleAddr, keeper);
  const count  = Number(await oracle.getAssetCount());
  console.log(`Assets tracked: ${count}`);
  console.log("─".repeat(55));

  // ── Resolve symbols ─────────────────────────────────────────────────────────
  const symbols = [];
  for (let i = 0; i < count; i++) {
    symbols.push(await oracle.getAssetSymbol(i));
  }

  // ── Fetch live prices from CoinGecko ────────────────────────────────────────
  console.log("Fetching prices from CoinGecko...");
  let cgData;
  try {
    cgData = await fetchCoinGeckoPrices(symbols);
  } catch (err) {
    console.error(`CoinGecko fetch failed: ${err.message}`);
    process.exitCode = 1;
    return;
  }
  console.log(`  OK — got ${Object.keys(cgData).length} price(s)\n`);

  // ── Step 1: Chainlink refresh (new oracle only) ──────────────────────────────
  let chainlinkActive = false;
  try {
    console.log("Step 1 — refreshFromChainlink()...");
    const tx      = await oracle.refreshFromChainlink();
    const receipt = await tx.wait();
    const updated = receipt.logs.filter((l) => l.fragment?.name === "PriceUpdated").length;
    console.log(`  ✓ ${updated} Chainlink price(s) updated  (tx: ${tx.hash})\n`);
    chainlinkActive = true;
  } catch {
    console.log("  oracle is pre-Chainlink version — skipping, will keeper-push all assets\n");
  }

  // ── Step 2: Keeper-push for keeper-only assets ───────────────────────────────
  const keeperIds    = [];
  const keeperPrices = [];

  for (let i = 0; i < count; i++) {
    // New oracle: skip assets that Chainlink already handled
    if (chainlinkActive) {
      const feed = await oracle.getFeed(i);
      if (feed !== ethers.ZeroAddress) continue;
    }

    const symbol = symbols[i];
    const cgId   = CG_IDS[symbol];
    const usd    = cgData[cgId]?.usd;

    if (!usd) {
      console.warn(`  ⚠ No CoinGecko price for ${symbol} (id: ${cgId}) — skipping`);
      continue;
    }

    const price = toPrice8(usd);
    keeperIds.push(i);
    keeperPrices.push(price);
    console.log(`  [${String(i).padStart(2)}] ${symbol.padEnd(6)}  $${usd.toFixed(4)}`);
  }

  if (keeperIds.length > 0) {
    console.log(`\nStep 2 — keeper-pushing ${keeperIds.length} asset(s)...`);
    const CHUNK = 10;
    for (let start = 0; start < keeperIds.length; start += CHUNK) {
      const end = Math.min(start + CHUNK, keeperIds.length);
      const tx  = await oracle.updatePrices(
        keeperIds.slice(start, end),
        keeperPrices.slice(start, end)
      );
      await tx.wait();
      console.log(`  ✓ Batch ${start / CHUNK + 1} committed  (tx: ${tx.hash})`);
    }
  } else {
    console.log("\nAll assets handled by Chainlink — no keeper push needed.");
  }

  // ── Step 3: Refresh BNB/USD price on AlpanCoin ──────────────────────────────
  const { alpAddr } = deployment;
  if (alpAddr) {
    const bnbUsd    = cgData[CG_IDS["BNB"]]?.usd;
    if (bnbUsd) {
      const alp = await ethers.getContractAt("AlpanCoin", alpAddr, keeper);
      const tx  = await alp.setBnbUsdPrice(toPrice8(bnbUsd));
      await tx.wait();
      console.log(`\nBNB/USD     : $${bnbUsd.toFixed(2)} updated on AlpanCoin (tx: ${tx.hash})`);
    }
  }

  // ── Summary ─────────────────────────────────────────────────────────────────
  const [indexPrice, ts] = await oracle.getIndexPrice();
  const usd = (Number(indexPrice) / 1e8).toFixed(2);
  console.log(`\n${"─".repeat(55)}`);
  console.log(`Index price : $${usd}`);
  console.log(`Updated at  : ${new Date(Number(ts) * 1000).toISOString()}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
