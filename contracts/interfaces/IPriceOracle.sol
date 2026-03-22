// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IPriceOracle
/// @notice Interface for the AlpanCoin price oracle that aggregates
///         prices of the top-50 cryptocurrencies by market cap.
interface IPriceOracle {
    /// @notice Emitted when a single asset price is updated.
    event PriceUpdated(uint256 indexed assetId, string symbol, uint256 price, uint256 timestamp);

    /// @notice Emitted when the index price is recalculated.
    event IndexPriceUpdated(uint256 indexPrice, uint256 timestamp);

    /// @notice Returns the price of a single tracked asset (8 decimals).
    /// @param assetId  Slot index [0, 49]
    function getAssetPrice(uint256 assetId) external view returns (uint256 price, uint256 updatedAt);

    /// @notice Returns the simple average price across all tracked assets (8 decimals).
    function getIndexPrice() external view returns (uint256 indexPrice, uint256 updatedAt);

    /// @notice Returns the number of assets currently tracked.
    function getAssetCount() external view returns (uint256);

    /// @notice Returns the symbol string for a given slot.
    function getAssetSymbol(uint256 assetId) external view returns (string memory);
}
