// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "./interfaces/IPriceOracle.sol";

/// @title PriceOracle
/// @notice Stores and aggregates prices for the top-50 cryptocurrencies.
///         Prices carry 8 decimal places (same convention as Chainlink feeds).
///
///         Two roles:
///         - DEFAULT_ADMIN_ROLE : can grant/revoke roles and add/remove assets.
///         - KEEPER_ROLE        : can push updated price data.
///
///         The simple-average index price is recalculated lazily on every
///         keeper update, so on-chain reads are O(1).
contract PriceOracle is IPriceOracle, AccessControl {
    bytes32 public constant KEEPER_ROLE = keccak256("KEEPER_ROLE");

    uint256 public constant MAX_ASSETS = 50;
    uint256 public constant MAX_PRICE_STALENESS = 1 hours;

    struct AssetData {
        string  symbol;
        uint256 price;       // 8 decimals
        uint256 updatedAt;
        bool    active;
    }

    // Ordered list of asset slots (index 0-49)
    AssetData[MAX_ASSETS] private _assets;
    uint256 private _assetCount;

    // Cached simple-average index price
    uint256 private _indexPrice;
    uint256 private _indexUpdatedAt;

    // ─────────────────────────────────────────────────────────────────────────
    // Constructor
    // ─────────────────────────────────────────────────────────────────────────

    constructor(address admin) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(KEEPER_ROLE, admin);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Admin functions
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Register a new asset in the next available slot.
    /// @dev    Only callable by DEFAULT_ADMIN_ROLE.
    function addAsset(string calldata symbol) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_assetCount < MAX_ASSETS, "Oracle: max assets reached");
        uint256 slot = _assetCount;
        _assets[slot].symbol    = symbol;
        _assets[slot].active    = true;
        _assets[slot].price     = 0;
        _assets[slot].updatedAt = 0;
        _assetCount++;
    }

    /// @notice Deactivate an asset slot (price excluded from index average).
    function deactivateAsset(uint256 assetId) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(assetId < _assetCount, "Oracle: invalid assetId");
        _assets[assetId].active = false;
        _recalcIndex();
    }

    /// @notice Reactivate a previously deactivated slot.
    function activateAsset(uint256 assetId) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(assetId < _assetCount, "Oracle: invalid assetId");
        _assets[assetId].active = true;
        _recalcIndex();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Keeper functions
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Update a single asset price.
    /// @param assetId Slot index [0, assetCount-1]
    /// @param price   New price with 8 decimals
    function updatePrice(uint256 assetId, uint256 price) external onlyRole(KEEPER_ROLE) {
        require(assetId < _assetCount, "Oracle: invalid assetId");
        require(price > 0, "Oracle: zero price");

        _assets[assetId].price     = price;
        _assets[assetId].updatedAt = block.timestamp;

        emit PriceUpdated(assetId, _assets[assetId].symbol, price, block.timestamp);

        _recalcIndex();
    }

    /// @notice Batch-update multiple asset prices in a single transaction.
    /// @param assetIds Array of slot indices
    /// @param prices   Corresponding prices (8 decimals each)
    function updatePrices(
        uint256[] calldata assetIds,
        uint256[] calldata prices
    ) external onlyRole(KEEPER_ROLE) {
        require(assetIds.length == prices.length, "Oracle: length mismatch");
        require(assetIds.length > 0, "Oracle: empty arrays");

        for (uint256 i = 0; i < assetIds.length; i++) {
            uint256 id    = assetIds[i];
            uint256 price = prices[i];
            require(id < _assetCount, "Oracle: invalid assetId");
            require(price > 0, "Oracle: zero price");

            _assets[id].price     = price;
            _assets[id].updatedAt = block.timestamp;

            emit PriceUpdated(id, _assets[id].symbol, price, block.timestamp);
        }

        _recalcIndex();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // View functions (IPriceOracle)
    // ─────────────────────────────────────────────────────────────────────────

    function getAssetPrice(uint256 assetId)
        external
        view
        override
        returns (uint256 price, uint256 updatedAt)
    {
        require(assetId < _assetCount, "Oracle: invalid assetId");
        AssetData storage a = _assets[assetId];
        return (a.price, a.updatedAt);
    }

    function getIndexPrice()
        external
        view
        override
        returns (uint256 indexPrice, uint256 updatedAt)
    {
        return (_indexPrice, _indexUpdatedAt);
    }

    function getAssetCount() external view override returns (uint256) {
        return _assetCount;
    }

    function getAssetSymbol(uint256 assetId)
        external
        view
        override
        returns (string memory)
    {
        require(assetId < _assetCount, "Oracle: invalid assetId");
        return _assets[assetId].symbol;
    }

    /// @notice Returns whether a slot is active and its full data.
    function getAssetData(uint256 assetId)
        external
        view
        returns (
            string memory symbol,
            uint256 price,
            uint256 updatedAt,
            bool active
        )
    {
        require(assetId < _assetCount, "Oracle: invalid assetId");
        AssetData storage a = _assets[assetId];
        return (a.symbol, a.price, a.updatedAt, a.active);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Internal helpers
    // ─────────────────────────────────────────────────────────────────────────

    /// @dev Recalculates the simple-average index price from all active assets
    ///      that have a non-zero price.  Called after every state change.
    function _recalcIndex() internal {
        uint256 sum;
        uint256 count;

        for (uint256 i = 0; i < _assetCount; i++) {
            if (_assets[i].active && _assets[i].price > 0) {
                sum   += _assets[i].price;
                count++;
            }
        }

        if (count > 0) {
            _indexPrice      = sum / count;
            _indexUpdatedAt  = block.timestamp;
            emit IndexPriceUpdated(_indexPrice, block.timestamp);
        }
    }
}
