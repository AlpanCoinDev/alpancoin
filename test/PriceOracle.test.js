const { expect }      = require("chai");
const { ethers }      = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

describe("PriceOracle", function () {
  // ── Fixture ───────────────────────────────────────────────────────────────
  async function deployOracleFixture() {
    const [admin, keeper, stranger] = await ethers.getSigners();

    const PriceOracle = await ethers.getContractFactory("PriceOracle");
    const oracle      = await PriceOracle.deploy(admin.address);

    const KEEPER_ROLE = await oracle.KEEPER_ROLE();
    await oracle.connect(admin).grantRole(KEEPER_ROLE, keeper.address);

    return { oracle, admin, keeper, stranger, KEEPER_ROLE };
  }

  // ── Asset management ──────────────────────────────────────────────────────
  describe("Asset management", function () {
    it("admin can add assets", async function () {
      const { oracle, admin } = await loadFixture(deployOracleFixture);
      await oracle.connect(admin).addAsset("BTC");
      expect(await oracle.getAssetCount()).to.equal(1n);
      expect(await oracle.getAssetSymbol(0n)).to.equal("BTC");
    });

    it("reverts when MAX_ASSETS is exceeded", async function () {
      const { oracle, admin } = await loadFixture(deployOracleFixture);
      for (let i = 0; i < 50; i++) {
        await oracle.connect(admin).addAsset(`COIN${i}`);
      }
      await expect(oracle.connect(admin).addAsset("EXTRA")).to.be.revertedWith(
        "Oracle: max assets reached"
      );
    });

    it("non-admin cannot add assets", async function () {
      const { oracle, stranger } = await loadFixture(deployOracleFixture);
      await expect(oracle.connect(stranger).addAsset("BTC")).to.be.reverted;
    });

    it("admin can deactivate and reactivate assets", async function () {
      const { oracle, admin, keeper } = await loadFixture(deployOracleFixture);
      await oracle.connect(admin).addAsset("BTC");
      await oracle.connect(admin).addAsset("ETH");
      await oracle.connect(keeper).updatePrices([0n, 1n], [680_00000000n, 35_00000000n]);

      await oracle.connect(admin).deactivateAsset(0n);
      const [idx1] = await oracle.getIndexPrice();
      expect(idx1).to.equal(35_00000000n);

      await oracle.connect(admin).activateAsset(0n);
      const [idx2] = await oracle.getIndexPrice();
      expect(idx2).to.equal((680_00000000n + 35_00000000n) / 2n);
    });
  });

  // ── Price updates ─────────────────────────────────────────────────────────
  describe("Price updates", function () {
    async function oracleWithAssets() {
      const base = await loadFixture(deployOracleFixture);
      await base.oracle.connect(base.admin).addAsset("BTC");
      await base.oracle.connect(base.admin).addAsset("ETH");
      await base.oracle.connect(base.admin).addAsset("BNB");
      return base;
    }

    it("keeper can update a single price", async function () {
      const { oracle, keeper } = await oracleWithAssets();
      await oracle.connect(keeper).updatePrice(0n, 680_00000000n);
      const [price] = await oracle.getAssetPrice(0n);
      expect(price).to.equal(680_00000000n);
    });

    it("keeper can batch-update prices", async function () {
      const { oracle, keeper } = await oracleWithAssets();
      await oracle.connect(keeper).updatePrices([0n, 1n, 2n], [680_00000000n, 35_00000000n, 59_0000000n]);
      const [p0] = await oracle.getAssetPrice(0n);
      const [p1] = await oracle.getAssetPrice(1n);
      const [p2] = await oracle.getAssetPrice(2n);
      expect(p0).to.equal(680_00000000n);
      expect(p1).to.equal(35_00000000n);
      expect(p2).to.equal(59_0000000n);
    });

    it("stranger cannot update prices", async function () {
      const { oracle, stranger } = await oracleWithAssets();
      await expect(oracle.connect(stranger).updatePrice(0n, 1_00000000n)).to.be.reverted;
    });

    it("reverts on zero price", async function () {
      const { oracle, keeper } = await oracleWithAssets();
      await expect(oracle.connect(keeper).updatePrice(0n, 0n)).to.be.revertedWith(
        "Oracle: zero price"
      );
    });

    it("reverts on mismatched arrays in batch", async function () {
      const { oracle, keeper } = await oracleWithAssets();
      await expect(
        oracle.connect(keeper).updatePrices([0n, 1n], [680_00000000n])
      ).to.be.revertedWith("Oracle: length mismatch");
    });
  });

  // ── Index price calculation ───────────────────────────────────────────────
  describe("Index price (simple average)", function () {
    it("calculates correct simple average", async function () {
      const { oracle, admin, keeper } = await loadFixture(deployOracleFixture);
      const prices = [100_00000000n, 200_00000000n, 300_00000000n];
      for (let i = 0; i < 3; i++) await oracle.connect(admin).addAsset(`COIN${i}`);
      await oracle.connect(keeper).updatePrices([0n, 1n, 2n], prices);

      const [idx] = await oracle.getIndexPrice();
      expect(idx).to.equal(200_00000000n);
    });

    it("emits IndexPriceUpdated event", async function () {
      const { oracle, admin, keeper } = await loadFixture(deployOracleFixture);
      await oracle.connect(admin).addAsset("BTC");
      await expect(oracle.connect(keeper).updatePrice(0n, 680_00000000n)).to.emit(
        oracle, "IndexPriceUpdated"
      );
    });
  });

  // ── View revert guards ────────────────────────────────────────────────────
  describe("View guards", function () {
    it("getAssetPrice reverts on invalid id", async function () {
      const { oracle } = await loadFixture(deployOracleFixture);
      await expect(oracle.getAssetPrice(0n)).to.be.revertedWith("Oracle: invalid assetId");
    });
  });
});
