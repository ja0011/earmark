// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/// @title Earmark
/// @notice Money that can only be spent on one item, at one store, by one person.
///         A sender locks USDC for a receiver. The receiver redeems it with an EIP-712
///         order signed by the store's registered signer. Leftover up to CHANGE_LIMIT
///         goes to the receiver; more than that goes back to the sender. After expiry,
///         an unused gift can be refunded to the sender by anyone.
contract Earmark is Ownable, ReentrancyGuard, EIP712 {
    using SafeERC20 for IERC20;

    // ------------------------------------------------------------------ types

    struct Gift {
        address sender;
        address receiver;
        address store;
        bytes32 itemId;
        uint256 amount;
        uint64 expiry;
        bytes32 fingerprint;
        uint8 status; // 0 None, 1 Locked, 2 Spent, 3 Refunded
    }

    uint8 public constant STATUS_NONE = 0;
    uint8 public constant STATUS_LOCKED = 1;
    uint8 public constant STATUS_SPENT = 2;
    uint8 public constant STATUS_REFUNDED = 3;

    /// @notice $10.00 in 6-decimal USDC. Leftover at or under this goes to the receiver.
    uint256 public constant CHANGE_LIMIT = 10_000_000;

    bytes32 public constant ORDER_TYPEHASH =
        keccak256("Order(uint256 giftId,bytes32 itemId,uint256 price,bytes32 orderId,address receiver)");

    // ------------------------------------------------------------------ storage

    IERC20 public immutable usdc;

    /// @notice Next gift id to be assigned. Gift ids start at 1.
    uint256 public nextGiftId = 1;

    mapping(uint256 => Gift) private _gifts;
    mapping(address => address) private _storeSigners;
    mapping(bytes32 => bool) public usedOrderIds;

    // ------------------------------------------------------------------ events

    event StoreRegistered(address indexed store, address indexed signer);
    event GiftCreated(
        uint256 indexed giftId,
        address indexed sender,
        address indexed receiver,
        address store,
        bytes32 itemId,
        uint256 amount,
        uint64 expiry,
        bytes32 fingerprint
    );
    event GiftRedeemed(
        uint256 indexed giftId,
        address indexed receiver,
        address indexed store,
        uint256 price,
        uint256 change,
        address changeTo,
        bytes32 orderId
    );
    event GiftRefunded(uint256 indexed giftId, address indexed sender, uint256 amount);

    // ------------------------------------------------------------------ errors

    error ZeroAddress();
    error StoreNotRegistered(address store);
    error ZeroAmount();
    error ExpiryNotInFuture(uint64 expiry);
    error GiftNotFound(uint256 giftId);
    error GiftNotLocked(uint256 giftId, uint8 status);
    error NotReceiver(address caller, address receiver);
    error GiftExpired(uint256 giftId, uint64 expiry);
    error GiftNotExpired(uint256 giftId, uint64 expiry);
    error PriceExceedsAmount(uint256 price, uint256 amount);
    error OrderIdAlreadyUsed(bytes32 orderId);
    error InvalidStoreSignature(address recovered, address expected);

    // ------------------------------------------------------------------ constructor

    constructor(IERC20 usdc_, address owner_) Ownable(owner_) EIP712("Earmark", "1") {
        if (address(usdc_) == address(0)) revert ZeroAddress();
        usdc = usdc_;
    }

    // ------------------------------------------------------------------ stores

    /// @notice Save which key a store signs orders with. Calling again rotates the key.
    function registerStore(address store, address signer) external onlyOwner {
        if (store == address(0) || signer == address(0)) revert ZeroAddress();
        _storeSigners[store] = signer;
        emit StoreRegistered(store, signer);
    }

    function storeSigner(address store) external view returns (address) {
        return _storeSigners[store];
    }

    // ------------------------------------------------------------------ gifts

    /// @notice Lock `amount` USDC (6 decimals) for `receiver` to spend on `itemId` at `store`.
    ///         Caller must have approved this contract for `amount`.
    function createGift(address receiver, address store, bytes32 itemId, uint256 amount, uint64 expiry)
        external
        nonReentrant
        returns (uint256 giftId)
    {
        if (receiver == address(0)) revert ZeroAddress();
        if (_storeSigners[store] == address(0)) revert StoreNotRegistered(store);
        if (amount == 0) revert ZeroAmount();
        if (expiry <= block.timestamp) revert ExpiryNotInFuture(expiry);

        giftId = nextGiftId++;
        bytes32 fp = fingerprintOf(msg.sender, receiver, store, itemId, amount, expiry, giftId);

        _gifts[giftId] = Gift({
            sender: msg.sender,
            receiver: receiver,
            store: store,
            itemId: itemId,
            amount: amount,
            expiry: expiry,
            fingerprint: fp,
            status: STATUS_LOCKED
        });

        usdc.safeTransferFrom(msg.sender, address(this), amount);

        emit GiftCreated(giftId, msg.sender, receiver, store, itemId, amount, expiry, fp);
    }

    /// @notice Spend a gift at its store. Only the receiver may call. `storeSignature` is the
    ///         store signer's EIP-712 signature over Order(giftId, gift.itemId, price, orderId, gift.receiver).
    function redeem(uint256 giftId, uint256 price, bytes32 orderId, bytes calldata storeSignature)
        external
        nonReentrant
    {
        Gift storage g = _gifts[giftId];
        if (g.status == STATUS_NONE) revert GiftNotFound(giftId);
        if (g.status != STATUS_LOCKED) revert GiftNotLocked(giftId, g.status);
        if (msg.sender != g.receiver) revert NotReceiver(msg.sender, g.receiver);
        if (block.timestamp > g.expiry) revert GiftExpired(giftId, g.expiry);
        if (price > g.amount) revert PriceExceedsAmount(price, g.amount);
        if (usedOrderIds[orderId]) revert OrderIdAlreadyUsed(orderId);

        _verifyStoreSignature(g, giftId, price, orderId, storeSignature);

        // effects
        usedOrderIds[orderId] = true;
        g.status = STATUS_SPENT;

        // interactions
        (uint256 change, address changeTo) = _payout(g, price);

        emit GiftRedeemed(giftId, g.receiver, g.store, price, change, changeTo, orderId);
    }

    function _verifyStoreSignature(
        Gift storage g,
        uint256 giftId,
        uint256 price,
        bytes32 orderId,
        bytes calldata storeSignature
    ) internal view {
        address expected = _storeSigners[g.store];
        bytes32 digest = hashOrder(giftId, g.itemId, price, orderId, g.receiver);
        (address recovered, ECDSA.RecoverError err,) = ECDSA.tryRecover(digest, storeSignature);
        if (err != ECDSA.RecoverError.NoError || recovered == address(0) || recovered != expected) {
            revert InvalidStoreSignature(recovered, expected);
        }
    }

    function _payout(Gift storage g, uint256 price) internal returns (uint256 change, address changeTo) {
        change = g.amount - price;
        changeTo = change <= CHANGE_LIMIT ? g.receiver : g.sender;
        if (price > 0) usdc.safeTransfer(g.store, price);
        if (change > 0) usdc.safeTransfer(changeTo, change);
    }

    /// @notice After expiry, return an unused gift to its sender. Anyone may call.
    function refund(uint256 giftId) external nonReentrant {
        Gift storage g = _gifts[giftId];
        if (g.status == STATUS_NONE) revert GiftNotFound(giftId);
        if (g.status != STATUS_LOCKED) revert GiftNotLocked(giftId, g.status);
        if (block.timestamp <= g.expiry) revert GiftNotExpired(giftId, g.expiry);

        g.status = STATUS_REFUNDED;
        address sender = g.sender;
        uint256 amount = g.amount;

        usdc.safeTransfer(sender, amount);

        emit GiftRefunded(giftId, sender, amount);
    }

    // ------------------------------------------------------------------ views

    function getGift(uint256 giftId) external view returns (Gift memory) {
        return _gifts[giftId];
    }

    /// @notice Alias of getGift, matching the interface spec.
    function gifts(uint256 giftId) external view returns (Gift memory) {
        return _gifts[giftId];
    }

    /// @notice keccak256(abi.encode(sender, receiver, store, itemId, amount, expiry, nonce)), nonce == giftId.
    function fingerprintOf(
        address sender,
        address receiver,
        address store,
        bytes32 itemId,
        uint256 amount,
        uint64 expiry,
        uint256 nonce
    ) public pure returns (bytes32) {
        return keccak256(abi.encode(sender, receiver, store, itemId, amount, expiry, nonce));
    }

    /// @notice EIP-712 domain separator (name "Earmark", version "1", chainId, this address).
    function domainSeparator() external view returns (bytes32) {
        return _domainSeparatorV4();
    }

    /// @notice Full EIP-712 digest the store signer must sign.
    function hashOrder(uint256 giftId, bytes32 itemId, uint256 price, bytes32 orderId, address receiver)
        public
        view
        returns (bytes32)
    {
        return _hashTypedDataV4(keccak256(abi.encode(ORDER_TYPEHASH, giftId, itemId, price, orderId, receiver)));
    }
}
