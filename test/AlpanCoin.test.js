const { expect }      = require("chai");
const { ethers }      = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

const ONE_ETHER   = ethers.parseEther("1");
const BNB_USD     = 600_00000000n;  // $600 (8 dec)
const INDEX_PRICE = 200_00000000n;  // $200 (8 dec)
const MAX_SUPPLY  = ethers.parseEther("21000000");

describe("AlpanCoin", function () {
  // ── Fixture ─────────────────────────────────────────────────────────────────
  async function deployFixture() {
    const [admin, user, stranger] = await ethers.getSigners();

    const MockOracle = await ethers.getContractFactory("MockPriceOracle");
    const mockOracle = await MockOracle.deploy();
    await mockOracle.addAsset("IDX", INDEX_PRICE);

    const AlpanCoin = await ethers.getContractFactory("AlpanCoin");
    const alp       = await AlpanCoin.deploy(
      await mockOracle.getAddress(),
      BNB_USD,
      admin.address
    );

    return { alp, mockOracle, admin, user, stranger };
  }

  // ── Deployment ──────────────────────────────────────────────────────────────
  describe("Deployment", function () {
    it("sets name and symbol", async function () {
      const { alp } = await loadFixture(deployFixture);
      expect(await alp.name()).to.equal("AlpanCoin");
      expect(await alp.symbol()).to.equal("ALP");
    });

    it("grants all roles to admin", async function () {
      const { alp, admin } = await loadFixture(deployFixture);
      expect(await alp.hasRole(await alp.DEFAULT_ADMIN_ROLE(), admin.address)).to.be.true;
      expect(await alp.hasRole(await alp.MINTER_ROLE(),        admin.address)).to.be.true;
      expect(await alp.hasRole(await alp.PAUSER_ROLE(),        admin.address)).to.be.true;
    });

    it("stores BNB/USD price and oracle address", async function () {
      const { alp, mockOracle } = await loadFixture(deployFixture);
      expect(await alp.bnbUsdPrice()).to.equal(BNB_USD);
      expect(await alp.oracle()).to.equal(await mockOracle.getAddress());
    });
  });

  // ── mint() ──────────────────────────────────────────────────────────────────
  describe("mint()", function () {
    it("mints ~2.991 ALP for 1 BNB at $600 BNB / $200 index", async function () {
      // 1 BNB × $600 / $200 = 3 ALP  −  0.30% fee  ≈  2.991 ALP
      const { alp, user } = await loadFixture(deployFixture);
      await alp.connect(user).mint({ value: ONE_ETHER });
      const bal      = await alp.balanceOf(user.address);
      const expected = ethers.parseEther("2.991");
      const diff     = bal > expected ? bal - expected : expected - bal;
      expect(diff).to.be.lte(ethers.parseEther("0.001"));
    });

    it("reverts below MIN_MINT_BNB", async function () {
      const { alp, user } = await loadFixture(deployFixture);
      await expect(
        alp.connect(user).mint({ value: ethers.parseEther("0.0001") })
      ).to.be.revertedWith("ALP: below min mint");
    });

    it("reverts when index price is stale", async function () {
      const { alp, mockOracle, user } = await loadFixture(deployFixture);
      await mockOracle.setIndexPrice(INDEX_PRICE, 1n);
      await expect(alp.connect(user).mint({ value: ONE_ETHER })).to.be.revertedWith(
        "ALP: index price stale"
      );
    });

    it("emits Minted event", async function () {
      const { alp, user } = await loadFixture(deployFixture);
      await expect(alp.connect(user).mint({ value: ONE_ETHER })).to.emit(alp, "Minted");
    });
  });

  // ── redeem() ────────────────────────────────────────────────────────────────
  describe("redeem()", function () {
    async function mintedFixture() {
      const base = await loadFixture(deployFixture);
      const { alp, admin, user } = base;
      await admin.sendTransaction({ to: await alp.getAddress(), value: ethers.parseEther("10") });
      await alp.connect(user).mint({ value: ONE_ETHER });
      return base;
    }

    it("burns ALP and returns BNB", async function () {
      const { alp, user } = await mintedFixture();
      const alpBal    = await alp.balanceOf(user.address);
      const bnbBefore = await ethers.provider.getBalance(user.address);

      const tx  = await alp.connect(user).redeem(alpBal);
      const rc  = await tx.wait();
      const gas = rc.gasUsed * rc.gasPrice;

      const bnbAfter = await ethers.provider.getBalance(user.address);
      expect(bnbAfter + gas).to.be.gt(bnbBefore);
      expect(await alp.balanceOf(user.address)).to.equal(0n);
    });

    it("reverts on zero amount", async function () {
      const { alp, user } = await mintedFixture();
      await expect(alp.connect(user).redeem(0n)).to.be.revertedWith("ALP: zero amount");
    });

    it("reverts on insufficient balance", async function () {
      const { alp, stranger } = await mintedFixture();
      await expect(alp.connect(stranger).redeem(ONE_ETHER)).to.be.revertedWith(
        "ALP: insufficient balance"
      );
    });

    it("emits Redeemed event", async function () {
      const { alp, user } = await mintedFixture();
      const alpBal = await alp.balanceOf(user.address);
      await expect(alp.connect(user).redeem(alpBal)).to.emit(alp, "Redeemed");
    });
  });

  // ── Preview helpers ───────────────────────────────────────────────────────────
  describe("previewMint / previewRedeem", function () {
    it("previewMint matches actual mint result", async function () {
      const { alp, user } = await loadFixture(deployFixture);
      const [expected] = await alp.previewMint(ONE_ETHER);
      await alp.connect(user).mint({ value: ONE_ETHER });
      const actual = await alp.balanceOf(user.address);
      const diff   = actual > expected ? actual - expected : expected - actual;
      expect(diff).to.be.lte(ethers.parseEther("0.0001"));
    });

    it("previewRedeem returns less than original BNB (2x fee)", async function () {
      const { alp } = await loadFixture(deployFixture);
      const [minted]   = await alp.previewMint(ONE_ETHER);
      const [redeemed] = await alp.previewRedeem(minted);
      expect(redeemed).to.be.lt(ONE_ETHER);
      expect(redeemed).to.be.gt(ethers.parseEther("0.99"));
    });
  });

  // ── Admin setters ─────────────────────────────────────────────────────────────
  describe("Admin setters", function () {
    it("admin can update BNB/USD price", async function () {
      const { alp, admin } = await loadFixture(deployFixture);
      await alp.connect(admin).setBnbUsdPrice(700_00000000n);
      expect(await alp.bnbUsdPrice()).to.equal(700_00000000n);
    });

    it("admin can set fee up to 500 bps", async function () {
      const { alp, admin } = await loadFixture(deployFixture);
      await alp.connect(admin).setProtocolFee(100);
      expect(await alp.protocolFeeBps()).to.equal(100n);
      await expect(alp.connect(admin).setProtocolFee(501)).to.be.revertedWith("ALP: fee too high");
    });

    it("stranger cannot call admin setters", async function () {
      const { alp, stranger } = await loadFixture(deployFixture);
      await expect(alp.connect(stranger).setProtocolFee(0)).to.be.reverted;
    });
  });

  // ── Pause ─────────────────────────────────────────────────────────────────────
  describe("Pause", function () {
    it("pauser can pause and unpause mint", async function () {
      const { alp, admin, user } = await loadFixture(deployFixture);
      await alp.connect(admin).pause();
      await expect(alp.connect(user).mint({ value: ONE_ETHER })).to.be.reverted;
      await alp.connect(admin).unpause();
      await expect(alp.connect(user).mint({ value: ONE_ETHER })).to.not.be.reverted;
    });
  });

  // ── MAX_SUPPLY ─────────────────────────────────────────────────────────────────
  describe("MAX_SUPPLY cap", function () {
    it("mintTo reverts beyond MAX_SUPPLY", async function () {
      const { alp, admin } = await loadFixture(deployFixture);
      await expect(
        alp.connect(admin).mintTo(admin.address, MAX_SUPPLY + 1n)
      ).to.be.revertedWith("ALP: exceeds max supply");
    });
  });
});
