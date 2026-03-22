require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

const PRIVATE_KEY = process.env.PRIVATE_KEY  || "0x" + "0".repeat(64);
const BSC_API_KEY = process.env.BSCSCAN_API_KEY || "";

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },

  networks: {
    hardhat: {
      chainId: 31337,
    },
    localhost: {
      url: "http://127.0.0.1:8545",
      chainId: 31337,
    },
    bscTestnet: {
      url: process.env.BSC_TESTNET_RPC_URL || "https://data-seed-prebsc-1-s1.binance.org:8545",
      chainId: 97,
      accounts: [PRIVATE_KEY],
      gasPrice: 10_000_000_000,
      gas: 6_000_000,
    },
    bscMainnet: {
      url: process.env.BSC_MAINNET_RPC_URL || "https://bsc-dataseed.binance.org",
      chainId: 56,
      accounts: [PRIVATE_KEY],
      gasPrice: 3_000_000_000,
      gas: 6_000_000,
    },
  },

  etherscan: {
    apiKey: {
      bscMainnet: BSC_API_KEY,
      bscTestnet: BSC_API_KEY,
    },
    customChains: [
      {
        network: "bscMainnet",
        chainId: 56,
        urls: {
          apiURL:     "https://api.bscscan.com/v2/api",
          browserURL: "https://bscscan.com",
        },
      },
      {
        network: "bscTestnet",
        chainId: 97,
        urls: {
          apiURL:     "https://api-testnet.bscscan.com/api",
          browserURL: "https://testnet.bscscan.com",
        },
      },
    ],
  },

  gasReporter: {
    enabled:  process.env.REPORT_GAS === "true",
    currency: "USD",
    token:    "BNB",
  },

  paths: {
    sources:   "./contracts",
    tests:     "./test",
    cache:     "./cache",
    artifacts: "./artifacts",
  },

  mocha: {
    timeout: 60_000,
  },
};
