/**
 * AlpanCoin — Deploy AlpanCoin only
 *
 * Use this script when PriceOracle is already deployed.
 *
 * Usage:
 *   npx hardhat run scripts/deployAlpanCoin.js --network bscMainnet
 */

const hre = require("hardhat");
const { ethers } = hre;
const fs = require("fs");

const ORACLE_ADDRESS = "0x30E23bf1831037E675c1422da358A27F5eF2e0C3";

async function main() {
  const [deployer] = await ethers.getSigners();
  const network    = hre.network.name;

  console.log("\n┌─────────────────────────────────────────────────┐");
  console.log("│        AlpanCoin — Deploy AlpanCoin only        │");
  console.log("└─────────────────────────────────────────────────┘");
  console.log(`Network  : ${network} (chainId ${hre.network.config.chainId})`);
  console.log(`Deployer : ${deployer.address}`);
  console.log(`Balance  : ${ethers.formatEther(await deployer.provider.getBalance(deployer.address))} BNB`);
  console.log(`Oracle   : ${ORACLE_ADDRESS}\n`);

  const bnbUsdPrice = process.env.BNB_USD_PRICE
    ? BigInt(process.env.BNB_USD_PRICE)
    : BigInt("60000000000"); // $600 default (8 decimals)

  console.log(`BNB/USD  : $${Number(bnbUsdPrice) / 1e8}\n`);

  const AlpanCoin = await ethers.getContractFactory("AlpanCoin");
  const alp       = await AlpanCoin.deploy(ORACLE_ADDRESS, bnbUsdPrice, deployer.address);
  await alp.waitForDeployment();
  const alpAddress = await alp.getAddress();

  console.log(`AlpanCoin deployed → ${alpAddress}`);

  console.log("\n── Verify command ──────────────────────────────────");
  console.log(`npx hardhat verify --network ${network} ${alpAddress} "${ORACLE_ADDRESS}" "${bnbUsdPrice}" "${deployer.address}"`);

  // Merge with existing deployment.json if present
  let existing = {};
  if (fs.existsSync("deployment.json")) {
    existing = JSON.parse(fs.readFileSync("deployment.json", "utf8"));
  }

  const out = {
    ...existing,
    network,
    alpAddr:     alpAddress,
    bnbUsdPrice: bnbUsdPrice.toString(),
    deployedAt:  new Date().toISOString(),
  };
  fs.writeFileSync("deployment.json", JSON.stringify(out, null, 2));
  console.log("\nAddresses saved to deployment.json\n");

  if (network === "bscMainnet") {
    console.log("── BscScan ─────────────────────────────────────────");
    console.log(`AlpanCoin: https://bscscan.com/address/${alpAddress}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
