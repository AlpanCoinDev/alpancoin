// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../interfaces/IPriceOracle.sol";

/// @title MockPriceOracle
/// @notice Lightweight test double for IPriceOracle.
///         All state is manually settable so tests can arrange any scenario.
contract MockPriceOracle is IPriceOracle {
    struct AssetData {
        string  symbol;
        uint256 price;
        uint256 updatedAt;
    }

    AssetData[] private _assets;
    uint256 private _indexPrice;
    uint256 private _indexUpdatedAt;

    // ── Setup helpers ─────────────────────────────────────────────────────

    function addAsset(string memory symbol, uint256 price) external {
        _assets.push(AssetData(symbol, price, block.timestamp));
        _recalc();
    }

    function setAssetPrice(uint256 id, uint256 price) external {
        _assets[id].price     = price;
        _assets[id].updatedAt = block.timestamp;
        _recalc();
    }

    function setIndexPrice(uint256 price, uint256 ts) external {
        _indexPrice     = price;
        _indexUpdatedAt = ts;
    }

    // ── IPriceOracle ──────────────────────────────────────────────────────

    function getAssetPrice(uint256 assetId)
        external
        view
        override
        returns (uint256 price, uint256 updatedAt)
    {
        return (_assets[assetId].price, _assets[assetId].updatedAt);
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
        return _assets.length;
    }

    function getAssetSymbol(uint256 assetId)
        external
        view
        override
        returns (string memory)
    {
        return _assets[assetId].symbol;
    }

    // ── Internal ──────────────────────────────────────────────────────────

    function _recalc() internal {
        if (_assets.length == 0) return;
        uint256 sum;
        for (uint256 i = 0; i < _assets.length; i++) {
            sum += _assets[i].price;
        }
        _indexPrice     = sum / _assets.length;
        _indexUpdatedAt = block.timestamp;
        emit IndexPriceUpdated(_indexPrice, block.timestamp);
    }
}
