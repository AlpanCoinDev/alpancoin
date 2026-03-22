/**
 * AlpanCoin — Keeper: update oracle prices
 *
 * Reads deployment.json, then pushes fresh prices to the PriceOracle.
 * Replace the random-walk stub with a live API call for production.
 *
 * Usage:
 *   npx hardhat run scripts/updatePrices.js --network bscTestnet
 */

const hre = require("hardhat");
const { ethers } = hre;
const fs  = require("fs");

async function main() {
  const deployment     = JSON.parse(fs.readFileSync("deployment.json", "utf8"));
  const { oracleAddr } = deployment;

  const [keeper] = await ethers.getSigners();
  console.log(`Keeper  : ${keeper.address}`);
  console.log(`Oracle  : ${oracleAddr}`);
  console.log(`Network : ${hre.network.name}`);

  const oracle = await ethers.getContractAt("PriceOracle", oracleAddr, keeper);
  const count  = (await oracle.getAssetCount()).toNumber();
  console.log(`\nAssets tracked: ${count}`);

  // ── Replace with real API call for production ─────────────────────────────
  // Example: const resp = await fetch("https://api.coingecko.com/api/v3/simple/price?...");
  console.log("Fetching prices (testnet stub — replace with live API)...");

  const ids    = [];
  const prices = [];

  for (let i = 0; i < count; i++) {
    const [price] = await oracle.getAssetPrice(i);
    const delta    = (Math.random() * 0.10) - 0.05; // ±5 % random walk
    const newPrice = BigInt(Math.floor(price.toBigInt() * BigInt(Math.floor((1 + delta) * 1000)) / 1000n));
    ids.push(i);
    prices.push(newPrice > 0n ? newPrice : 1n);
  }

  const CHUNK = 10;
  for (let start = 0; start < ids.length; start += CHUNK) {
    const tx = await oracle.updatePrices(
      ids.slice(start, start + CHUNK),
      prices.slice(start, start + CHUNK)
    );
    await tx.wait();
    console.log(`  Updated slots ${ids[start]}–${ids[Math.min(start + CHUNK - 1, ids.length - 1)]}`);
  }

  const [indexPrice, ts] = await oracle.getIndexPrice();
  console.log(`\nNew index price : $${(indexPrice.toBigInt() / BigInt(1e6) / 100n).toString()} (approx)`);
  console.log(`Updated at      : ${new Date(ts.toNumber() * 1000).toISOString()}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
