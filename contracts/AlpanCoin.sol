// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Pausable.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./interfaces/IPriceOracle.sol";

/// @title  AlpanCoin (ALP)
/// @notice ERC-20 index token whose *reference price* tracks the simple
///         arithmetic mean of the top-50 cryptocurrencies by market cap.
///
///         The token is mintable and redeemable against BNB (the native gas
///         token on BNB Chain).  One ALP represents ownership of 1 USD-worth
///         of the index, so mint and redeem prices are derived from the oracle.
///
///         Architecture
///         ─────────────
///         • PriceOracle   – off-chain keepers push asset prices; the oracle
///                           caches the rolling simple average (index price).
///         • AlpanCoin     – reads the cached index price; users pay BNB to
///                           mint ALP tokens proportional to the USD value.
///
///         Price conventions
///         ─────────────────
///         • Oracle prices : 8 decimals  (e.g. 1 USD = 1_00000000)
///         • BNB/USD price : 8 decimals  (provided by the keeper / Chainlink)
///         • ALP token     : 18 decimals (standard ERC-20)
///
///         Mint formula
///         ─────────────
///         bnbAmount  [wei]  × bnbUsdPrice [8 dec]
///         ─────────────────────────────────────── = alpAmount [18 dec]
///              indexPrice [8 dec]  ×  1e10
///
///         Roles
///         ─────
///         • DEFAULT_ADMIN_ROLE  – grant/revoke roles, set parameters
///         • MINTER_ROLE         – can call mint() on behalf of users
///         • PAUSER_ROLE         – can pause/unpause the contract
///         • PRICE_UPDATER_ROLE  – can update the BNB/USD reference price
///
contract AlpanCoin is ERC20, ERC20Burnable, ERC20Pausable, AccessControl, ReentrancyGuard {

    // ─── Roles ───────────────────────────────────────────────────────────────
    bytes32 public constant MINTER_ROLE        = keccak256("MINTER_ROLE");
    bytes32 public constant PAUSER_ROLE        = keccak256("PAUSER_ROLE");
    bytes32 public constant PRICE_UPDATER_ROLE = keccak256("PRICE_UPDATER_ROLE");

    // ─── Constants ───────────────────────────────────────────────────────────
    uint256 public constant MAX_SUPPLY         = 21_000_000 * 1e18; // 21 million ALP
    uint256 public constant MIN_MINT_BNB       = 0.001 ether;
    uint256 public constant MAX_PRICE_STALENESS = 1 hours;

    // Protocol fee in basis points (e.g. 30 = 0.30 %)
    uint256 public protocolFeeBps              = 30;
    address public feeRecipient;

    // ─── Oracle ──────────────────────────────────────────────────────────────
    IPriceOracle public oracle;

    // BNB/USD price (8 decimals) — updated by PRICE_UPDATER_ROLE or Chainlink keeper
    uint256 public bnbUsdPrice;
    uint256 public bnbUsdUpdatedAt;

    // ─── Events ──────────────────────────────────────────────────────────────
    event OracleUpdated(address indexed oldOracle, address indexed newOracle);
    event BnbUsdPriceUpdated(uint256 price, uint256 timestamp);
    event Minted(address indexed to, uint256 bnbSpent, uint256 alpMinted, uint256 indexPrice);
    event Redeemed(address indexed from, uint256 alpBurned, uint256 bnbReturned, uint256 indexPrice);
    event ProtocolFeeUpdated(uint256 oldBps, uint256 newBps);
    event FeeRecipientUpdated(address indexed oldRecipient, address indexed newRecipient);
    event BnbWithdrawn(address indexed to, uint256 amount);

    // ─────────────────────────────────────────────────────────────────────────
    // Constructor
    // ─────────────────────────────────────────────────────────────────────────

    /// @param _oracle      Address of the deployed PriceOracle contract
    /// @param _bnbUsdPrice Initial BNB/USD price (8 decimals)
    /// @param _admin       Account that receives all roles initially
    constructor(
        address _oracle,
        uint256 _bnbUsdPrice,
        address _admin
    ) ERC20("AlpanCoin", "ALP") {
        require(_oracle != address(0), "ALP: zero oracle");
        require(_bnbUsdPrice > 0,      "ALP: zero BNB price");
        require(_admin != address(0),  "ALP: zero admin");

        oracle           = IPriceOracle(_oracle);
        bnbUsdPrice      = _bnbUsdPrice;
        bnbUsdUpdatedAt  = block.timestamp;
        feeRecipient     = _admin;

        _grantRole(DEFAULT_ADMIN_ROLE,  _admin);
        _grantRole(MINTER_ROLE,         _admin);
        _grantRole(PAUSER_ROLE,         _admin);
        _grantRole(PRICE_UPDATER_ROLE,  _admin);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Core: Mint
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Send BNB to receive ALP tokens at the current index price.
    /// @dev    msg.value is the BNB amount to spend.
    function mint() external payable nonReentrant whenNotPaused {
        require(msg.value >= MIN_MINT_BNB, "ALP: below min mint");

        (uint256 indexPrice, uint256 indexUpdatedAt) = oracle.getIndexPrice();
        require(indexPrice > 0, "ALP: oracle not initialized");
        require(
            block.timestamp - indexUpdatedAt <= MAX_PRICE_STALENESS,
            "ALP: index price stale"
        );
        require(
            block.timestamp - bnbUsdUpdatedAt <= MAX_PRICE_STALENESS,
            "ALP: BNB price stale"
        );

        // Deduct protocol fee from BNB received
        uint256 fee        = (msg.value * protocolFeeBps) / 10_000;
        uint256 netBnb     = msg.value - fee;

        // alpAmount = (netBnb * bnbUsdPrice) / indexPrice
        // • netBnb        : wei (1e18)
        // • bnbUsdPrice   : 8 decimals, e.g. $600 → 60_000_000_000
        // • indexPrice    : 8 decimals, e.g. $200 → 20_000_000_000
        // • numerator     : 1e18 * 1e8 = 1e26
        // • denominator   : 1e8
        // • result        : 1e18  (correct ALP decimals)
        uint256 alpAmount = (netBnb * bnbUsdPrice) / indexPrice;

        require(totalSupply() + alpAmount <= MAX_SUPPLY, "ALP: exceeds max supply");

        // Collect fee
        if (fee > 0) {
            (bool sent, ) = feeRecipient.call{value: fee}("");
            require(sent, "ALP: fee transfer failed");
        }

        _mint(msg.sender, alpAmount);
        emit Minted(msg.sender, msg.value, alpAmount, indexPrice);
    }

    /// @notice Privileged mint (e.g. initial distribution, rewards).
    function mintTo(address to, uint256 amount) external onlyRole(MINTER_ROLE) {
        require(totalSupply() + amount <= MAX_SUPPLY, "ALP: exceeds max supply");
        _mint(to, amount);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Core: Redeem
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Burn ALP tokens and receive BNB at the current index price.
    /// @param alpAmount Amount of ALP (18 decimals) to redeem.
    function redeem(uint256 alpAmount) external nonReentrant whenNotPaused {
        require(alpAmount > 0, "ALP: zero amount");
        require(balanceOf(msg.sender) >= alpAmount, "ALP: insufficient balance");

        (uint256 indexPrice, uint256 indexUpdatedAt) = oracle.getIndexPrice();
        require(indexPrice > 0, "ALP: oracle not initialized");
        require(
            block.timestamp - indexUpdatedAt <= MAX_PRICE_STALENESS,
            "ALP: index price stale"
        );
        require(
            block.timestamp - bnbUsdUpdatedAt <= MAX_PRICE_STALENESS,
            "ALP: BNB price stale"
        );

        // bnbAmount = (alpAmount * indexPrice) / bnbUsdPrice
        // Inverse of the mint formula; result is in wei.
        uint256 grossBnb = (alpAmount * indexPrice) / bnbUsdPrice;
        uint256 fee      = (grossBnb * protocolFeeBps) / 10_000;
        uint256 netBnb   = grossBnb - fee;

        require(address(this).balance >= grossBnb, "ALP: insufficient reserves");

        _burn(msg.sender, alpAmount);

        if (fee > 0) {
            (bool feeSent, ) = feeRecipient.call{value: fee}("");
            require(feeSent, "ALP: fee transfer failed");
        }

        (bool sent, ) = msg.sender.call{value: netBnb}("");
        require(sent, "ALP: BNB transfer failed");

        emit Redeemed(msg.sender, alpAmount, netBnb, indexPrice);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // View helpers
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Preview how many ALP tokens a given BNB amount would produce.
    function previewMint(uint256 bnbAmount)
        external
        view
        returns (uint256 alpAmount, uint256 fee, uint256 indexPrice)
    {
        (indexPrice, ) = oracle.getIndexPrice();
        fee       = (bnbAmount * protocolFeeBps) / 10_000;
        uint256 net = bnbAmount - fee;
        alpAmount = (net * bnbUsdPrice) / indexPrice;
    }

    /// @notice Preview how much BNB a given ALP amount would return on redeem.
    function previewRedeem(uint256 alpAmount)
        external
        view
        returns (uint256 bnbAmount, uint256 fee, uint256 indexPrice)
    {
        (indexPrice, ) = oracle.getIndexPrice();
        uint256 gross = (alpAmount * indexPrice) / bnbUsdPrice;
        fee      = (gross * protocolFeeBps) / 10_000;
        bnbAmount = gross - fee;
    }

    /// @notice Returns the current index price from the oracle.
    function currentIndexPrice() external view returns (uint256 price, uint256 updatedAt) {
        return oracle.getIndexPrice();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Admin setters
    // ─────────────────────────────────────────────────────────────────────────

    function setOracle(address newOracle) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(newOracle != address(0), "ALP: zero address");
        emit OracleUpdated(address(oracle), newOracle);
        oracle = IPriceOracle(newOracle);
    }

    function setBnbUsdPrice(uint256 price) external onlyRole(PRICE_UPDATER_ROLE) {
        require(price > 0, "ALP: zero price");
        bnbUsdPrice     = price;
        bnbUsdUpdatedAt = block.timestamp;
        emit BnbUsdPriceUpdated(price, block.timestamp);
    }

    function setProtocolFee(uint256 bps) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(bps <= 500, "ALP: fee too high"); // max 5 %
        emit ProtocolFeeUpdated(protocolFeeBps, bps);
        protocolFeeBps = bps;
    }

    function setFeeRecipient(address recipient) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(recipient != address(0), "ALP: zero address");
        emit FeeRecipientUpdated(feeRecipient, recipient);
        feeRecipient = recipient;
    }

    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    /// @notice Withdraw BNB reserves (emergency / governance).
    function withdrawBnb(address payable to, uint256 amount) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(to != address(0), "ALP: zero address");
        require(amount <= address(this).balance, "ALP: insufficient balance");
        (bool sent, ) = to.call{value: amount}("");
        require(sent, "ALP: transfer failed");
        emit BnbWithdrawn(to, amount);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Receive BNB (liquidity top-up by admin, etc.)
    // ─────────────────────────────────────────────────────────────────────────

    receive() external payable {}

    // ─────────────────────────────────────────────────────────────────────────
    // Required overrides
    // ─────────────────────────────────────────────────────────────────────────

    function _update(address from, address to, uint256 value)
        internal
        override(ERC20, ERC20Pausable)
    {
        super._update(from, to, value);
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(AccessControl)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
