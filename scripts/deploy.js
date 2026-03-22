/**
 * AlpanCoin — Deployment Script
 *
 * Deploys in order:
 *   1. PriceOracle  – seeded with the top-50 crypto symbols + initial prices
 *   2. AlpanCoin    – linked to the oracle
 *
 * Usage:
 *   npx hardhat run scripts/deploy.js --network bscTestnet
 */

const hre = require("hardhat");
const { ethers } = hre;
const fs = require("fs");

// ─── Top-50 crypto symbols (by market cap, March 2025 snapshot) ──────────────
const TOP_50_SYMBOLS = [
  "BTC",  "ETH",  "BNB",  "SOL",  "XRP",
  "DOGE", "ADA",  "AVAX", "SHIB", "TON",
  "LINK", "DOT",  "TRX",  "MATIC","NEAR",
  "ICP",  "LTC",  "APT",  "UNI",  "LEO",
  "ATOM", "XLM",  "ETC",  "FIL",  "INJ",
  "IMX",  "STX",  "HBAR", "VET",  "MNT",
  "OP",   "ARB",  "GRT",  "EGLD", "SAND",
  "AAVE", "THETA","XMR",  "FTM",  "RUNE",
  "KAS",  "ALGO", "MANA", "FLOW", "EOS",
  "IOTA", "CRV",  "SNX",  "CHZ",  "ZEC",
];

// ─── Seed prices (8 decimals) ─────────────────────────────────────────────────
const SEED_PRICES = [
  BigInt("6800000000000"), // BTC  ~ $68,000
  BigInt("350000000000"),  // ETH  ~ $3,500
  BigInt("59000000000"),   // BNB  ~ $590
  BigInt("170000000000"),  // SOL  ~ $170
  BigInt("60000000"),      // XRP  ~ $0.60
  BigInt("18000000"),      // DOGE ~ $0.18
  BigInt("45000000"),      // ADA  ~ $0.45
  BigInt("3900000000"),    // AVAX ~ $39
  BigInt("2000"),          // SHIB ~ $0.000020
  BigInt("700000000"),     // TON  ~ $7
  BigInt("1750000000"),    // LINK ~ $17.50
  BigInt("800000000"),     // DOT  ~ $8
  BigInt("12000000"),      // TRX  ~ $0.12
  BigInt("82000000"),      // MATIC~ $0.82
  BigInt("700000000"),     // NEAR ~ $7
  BigInt("1250000000"),    // ICP  ~ $12.50
  BigInt("8300000000"),    // LTC  ~ $83
  BigInt("1300000000"),    // APT  ~ $13
  BigInt("1200000000"),    // UNI  ~ $12
  BigInt("1000000000"),    // LEO  ~ $10
  BigInt("1050000000"),    // ATOM ~ $10.50
  BigInt("13000000"),      // XLM  ~ $0.13
  BigInt("3400000000"),    // ETC  ~ $34
  BigInt("600000000"),     // FIL  ~ $6
  BigInt("4200000000"),    // INJ  ~ $42
  BigInt("340000000"),     // IMX  ~ $3.40
  BigInt("260000000"),     // STX  ~ $2.60
  BigInt("15000000"),      // HBAR ~ $0.15
  BigInt("4000000"),       // VET  ~ $0.04
  BigInt("1000000000"),    // MNT  ~ $10
  BigInt("250000000"),     // OP   ~ $2.50
  BigInt("180000000"),     // ARB  ~ $1.80
  BigInt("20000000"),      // GRT  ~ $0.20
  BigInt("4500000000"),    // EGLD ~ $45
  BigInt("60000000"),      // SAND ~ $0.60
  BigInt("10500000000"),   // AAVE ~ $105
  BigInt("250000000"),     // THETA~ $2.50
  BigInt("14000000000"),   // XMR  ~ $140
  BigInt("65000000"),      // FTM  ~ $0.65
  BigInt("1000000000"),    // RUNE ~ $10
  BigInt("12000000"),      // KAS  ~ $0.12
  BigInt("18000000"),      // ALGO ~ $0.18
  BigInt("50000000"),      // MANA ~ $0.50
  BigInt("75000000"),      // FLOW ~ $0.75
  BigInt("85000000"),      // EOS  ~ $0.85
  BigInt("23000000"),      // IOTA ~ $0.23
  BigInt("37000000"),      // CRV  ~ $0.37
  BigInt("30000000"),      // SNX  ~ $0.30
  BigInt("10000000"),      // CHZ  ~ $0.10
  BigInt("3700000000"),    // ZEC  ~ $37
];

async function main() {
  const [deployer] = await ethers.getSigners();
  const network    = hre.network.name;

  console.log("\n┌─────────────────────────────────────────────────┐");
  console.log("│          AlpanCoin Deployment Script            │");
  console.log("└─────────────────────────────────────────────────┘");
  console.log(`Network  : ${network} (chainId ${hre.network.config.chainId})`);
  console.log(`Deployer : ${deployer.address}`);
  console.log(`Balance  : ${ethers.formatEther(await deployer.provider.getBalance(deployer.address))} BNB\n`);

  // ── 1. Deploy PriceOracle ─────────────────────────────────────────────────
  console.log("1/3  Deploying PriceOracle...");
  const PriceOracle = await ethers.getContractFactory("PriceOracle");
  const oracle      = await PriceOracle.deploy(deployer.address);
  await oracle.waitForDeployment();
  const oracleAddress = await oracle.getAddress();
  console.log(`     PriceOracle deployed → ${oracleAddress}`);

  // ── 2. Seed oracle ────────────────────────────────────────────────────────
  console.log(`\n2/3  Seeding ${TOP_50_SYMBOLS.length} assets...`);

  for (let i = 0; i < TOP_50_SYMBOLS.length; i++) {
    const tx = await oracle.addAsset(TOP_50_SYMBOLS[i]);
    await tx.wait();
    process.stdout.write(`     Added [${String(i).padStart(2, "0")}] ${TOP_50_SYMBOLS[i].padEnd(6)}\r`);
  }

  const CHUNK = 10;
  const ids   = TOP_50_SYMBOLS.map((_, i) => i);
  for (let start = 0; start < ids.length; start += CHUNK) {
    const chunk  = ids.slice(start, start + CHUNK);
    const prices = SEED_PRICES.slice(start, start + CHUNK);
    const tx     = await oracle.updatePrices(chunk, prices);
    await tx.wait();
  }

  const [indexPrice] = await oracle.getIndexPrice();
  console.log(`\n     Index price: $${(indexPrice / BigInt(1e6) / 100n).toString()} (approx)`);

  // ── 3. Deploy AlpanCoin ───────────────────────────────────────────────────
  console.log("\n3/3  Deploying AlpanCoin...");

  const bnbUsdPrice = process.env.BNB_USD_PRICE
    ? BigInt(process.env.BNB_USD_PRICE)
    : BigInt("60000000000"); // $600 default

  const AlpanCoin = await ethers.getContractFactory("AlpanCoin");
  const alp       = await AlpanCoin.deploy(oracleAddress, bnbUsdPrice, deployer.address);
  await alp.waitForDeployment();
  const alpAddress = await alp.getAddress();
  console.log(`     AlpanCoin deployed  → ${alpAddress}`);

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log("\n┌─────────────────────────────────────────────────┐");
  console.log("│                 Deployment Summary              │");
  console.log("└─────────────────────────────────────────────────┘");
  console.log(`PriceOracle  : ${oracleAddress}`);
  console.log(`AlpanCoin    : ${alpAddress}`);
  console.log(`BNB/USD      : $${Number(bnbUsdPrice) / 1e8}`);

  if (network === "bscTestnet") {
    console.log("\n── BscScan links ───────────────────────────────────");
    console.log(`Oracle   : https://testnet.bscscan.com/address/${oracleAddress}`);
    console.log(`AlpanCoin: https://testnet.bscscan.com/address/${alpAddress}`);
  }

  console.log("\n── Verify commands ─────────────────────────────────");
  console.log(`npx hardhat verify --network ${network} ${oracleAddress} "${deployer.address}"`);
  console.log(`npx hardhat verify --network ${network} ${alpAddress} "${oracleAddress}" "${bnbUsdPrice}" "${deployer.address}"`);

  const out = {
    network,
    oracleAddr:  oracleAddress,
    alpAddr:     alpAddress,
    bnbUsdPrice: bnbUsdPrice.toString(),
    indexPrice:  indexPrice.toString(),
    deployedAt:  new Date().toISOString(),
  };
  fs.writeFileSync("deployment.json", JSON.stringify(out, null, 2));
  console.log("\nAddresses saved to deployment.json\n");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
