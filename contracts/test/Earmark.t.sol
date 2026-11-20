// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Earmark} from "../src/Earmark.sol";
import {MockUSDC} from "../src/test/MockUSDC.sol";

contract EarmarkTest is Test {
    Earmark internal earmark;
    MockUSDC internal usdc;

    address internal owner = makeAddr("owner");
    address internal maya = makeAddr("maya"); // sender
    address internal alex = makeAddr("alex"); // receiver
    address internal eve = makeAddr("eve"); // someone else

    address internal hartwell = makeAddr("hartwell"); // store payout address
    uint256 internal hartwellSignerPk = 0xA11CE;
    address internal hartwellSigner;

    address internal otherStore = makeAddr("otherStore");
    uint256 internal otherSignerPk = 0xB0B;
    address internal otherSigner;

    bytes32 internal constant SHOVEL = keccak256("hartwell-supply:snow-shovel");
    bytes32 internal constant DRILL = keccak256("hartwell-supply:cordless-drill");

    uint256 internal constant GIFT_45 = 45_000_000; // $45.00
    uint256 internal constant SHOVEL_PRICE = 39_980_000; // $39.98
    uint64 internal expiry;

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

    function setUp() public {
        vm.warp(1_800_000_000);
        hartwellSigner = vm.addr(hartwellSignerPk);
        otherSigner = vm.addr(otherSignerPk);

        usdc = new MockUSDC();
        earmark = new Earmark(usdc, owner);

        vm.startPrank(owner);
        earmark.registerStore(hartwell, hartwellSigner);
        earmark.registerStore(otherStore, otherSigner);
        vm.stopPrank();

        usdc.mint(maya, 1_000_000_000); // $1000
        vm.prank(maya);
        usdc.approve(address(earmark), type(uint256).max);

        expiry = uint64(block.timestamp + 30 days);
    }

    // ------------------------------------------------------------------ helpers

    function _gift(uint256 amount) internal returns (uint256) {
        vm.prank(maya);
        return earmark.createGift(alex, hartwell, SHOVEL, amount, expiry);
    }

    function _sign(uint256 pk, uint256 giftId, bytes32 itemId, uint256 price, bytes32 orderId, address receiver)
        internal
        view
        returns (bytes memory)
    {
        bytes32 digest = earmark.hashOrder(giftId, itemId, price, orderId, receiver);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, digest);
        return abi.encodePacked(r, s, v);
    }

    function _storeSig(uint256 giftId, uint256 price, bytes32 orderId) internal view returns (bytes memory) {
        return _sign(hartwellSignerPk, giftId, SHOVEL, price, orderId, alex);
    }

    /// Sign first: an external call inside the argument list would consume vm.prank.
    function _redeemAsAlex(uint256 giftId, uint256 price, bytes32 orderId) internal {
        bytes memory sig = _storeSig(giftId, price, orderId);
        vm.prank(alex);
        earmark.redeem(giftId, price, orderId, sig);
    }

    // ------------------------------------------------------------------ registerStore

    function test_RegisterStore_SetsSignerAndEmits() public {
        address store = makeAddr("newStore");
        vm.expectEmit(true, true, false, false);
        emit StoreRegistered(store, eve);
        vm.prank(owner);
        earmark.registerStore(store, eve);
        assertEq(earmark.storeSigner(store), eve);
    }

    function test_RegisterStore_OnlyOwner() public {
        vm.prank(eve);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, eve));
        earmark.registerStore(eve, eve);
    }

    function test_RegisterStore_RejectsZeroAddress() public {
        vm.startPrank(owner);
        vm.expectRevert(Earmark.ZeroAddress.selector);
        earmark.registerStore(address(0), eve);
        vm.expectRevert(Earmark.ZeroAddress.selector);
        earmark.registerStore(eve, address(0));
        vm.stopPrank();
    }

    // ------------------------------------------------------------------ createGift

    function test_CreateGift_StoresGiftPullsUsdcAndFingerprintMatchesFormula() public {
        assertEq(earmark.nextGiftId(), 1);
        bytes32 expectedFp = keccak256(abi.encode(maya, alex, hartwell, SHOVEL, GIFT_45, expiry, uint256(1)));

        vm.expectEmit(true, true, true, true);
        emit GiftCreated(1, maya, alex, hartwell, SHOVEL, GIFT_45, expiry, expectedFp);
        uint256 id = _gift(GIFT_45);

        assertEq(id, 1, "ids start at 1");
        assertEq(earmark.nextGiftId(), 2);
        assertEq(usdc.balanceOf(address(earmark)), GIFT_45);
        assertEq(usdc.balanceOf(maya), 1_000_000_000 - GIFT_45);

        Earmark.Gift memory g = earmark.getGift(id);
        assertEq(g.sender, maya);
        assertEq(g.receiver, alex);
        assertEq(g.store, hartwell);
        assertEq(g.itemId, SHOVEL);
        assertEq(g.amount, GIFT_45);
        assertEq(g.expiry, expiry);
        assertEq(g.fingerprint, expectedFp);
        assertEq(g.status, earmark.STATUS_LOCKED());
        assertEq(earmark.fingerprintOf(maya, alex, hartwell, SHOVEL, GIFT_45, expiry, 1), expectedFp);

        // second gift gets id 2 and a different fingerprint (nonce == giftId)
        uint256 id2 = _gift(GIFT_45);
        assertEq(id2, 2);
        assertTrue(earmark.getGift(id2).fingerprint != expectedFp);
    }

    function test_CreateGift_RevertsUnregisteredStore() public {
        vm.prank(maya);
        vm.expectRevert(abi.encodeWithSelector(Earmark.StoreNotRegistered.selector, eve));
        earmark.createGift(alex, eve, SHOVEL, GIFT_45, expiry);
    }

    function test_CreateGift_RevertsZeroAmount() public {
        vm.prank(maya);
        vm.expectRevert(Earmark.ZeroAmount.selector);
        earmark.createGift(alex, hartwell, SHOVEL, 0, expiry);
    }

    function test_CreateGift_RevertsExpiryNotInFuture() public {
        uint64 nowTs = uint64(block.timestamp);
        vm.prank(maya);
        vm.expectRevert(abi.encodeWithSelector(Earmark.ExpiryNotInFuture.selector, nowTs));
        earmark.createGift(alex, hartwell, SHOVEL, GIFT_45, nowTs);
    }

    function test_CreateGift_RevertsZeroReceiver() public {
        vm.prank(maya);
        vm.expectRevert(Earmark.ZeroAddress.selector);
        earmark.createGift(address(0), hartwell, SHOVEL, GIFT_45, expiry);
    }

    // ------------------------------------------------------------------ redeem: happy paths

    function test_ChangeLimit_IsTenDollars() public view {
        assertEq(earmark.CHANGE_LIMIT(), 10_000_000);
    }

    /// The demo story: $45 gift, $39.98 shovel, $5.02 left over goes to Alex (<= $10 CHANGE_LIMIT).
    function test_Redeem_Story_45_3998_502() public {
        uint256 id = _gift(GIFT_45);
        bytes32 orderId = keccak256("order-1");
        bytes memory sig = _storeSig(id, SHOVEL_PRICE, orderId);
        uint256 mayaBefore = usdc.balanceOf(maya);

        vm.expectEmit(true, true, true, true);
        emit GiftRedeemed(id, alex, hartwell, SHOVEL_PRICE, 5_020_000, alex, orderId);
        vm.prank(alex);
        earmark.redeem(id, SHOVEL_PRICE, orderId, sig);

        assertEq(usdc.balanceOf(hartwell), 39_980_000, "store paid $39.98");
        assertEq(usdc.balanceOf(alex), 5_020_000, "$5.02 change -> receiver");
        assertEq(usdc.balanceOf(maya), mayaBefore, "sender gets nothing back");
        assertEq(usdc.balanceOf(address(earmark)), 0);
        assertEq(earmark.getGift(id).status, earmark.STATUS_SPENT());
        assertTrue(earmark.usedOrderIds(orderId));
    }

    /// Leftover under the limit goes to the receiver: $44 gift, $39.98 shovel, $4.02 to Alex.
    function test_Redeem_LeftoverUnderLimit_GoesToReceiver() public {
        uint256 id = _gift(44_000_000);
        bytes32 orderId = keccak256("order-under");
        bytes memory sig = _storeSig(id, SHOVEL_PRICE, orderId);

        vm.expectEmit(true, true, true, true);
        emit GiftRedeemed(id, alex, hartwell, SHOVEL_PRICE, 4_020_000, alex, orderId);
        vm.prank(alex);
        earmark.redeem(id, SHOVEL_PRICE, orderId, sig);

        assertEq(usdc.balanceOf(hartwell), SHOVEL_PRICE);
        assertEq(usdc.balanceOf(alex), 4_020_000, "$4.02 -> receiver");
        assertEq(usdc.balanceOf(address(earmark)), 0);
    }

    /// Boundary: exactly $10.00 left over still goes to the receiver (<= CHANGE_LIMIT).
    function test_Redeem_LeftoverExactly1000_GoesToReceiver() public {
        uint256 id = _gift(GIFT_45);
        bytes32 orderId = keccak256("order-exact");
        uint256 mayaBefore = usdc.balanceOf(maya);
        _redeemAsAlex(id, 35_000_000, orderId);
        assertEq(usdc.balanceOf(alex), 10_000_000);
        assertEq(usdc.balanceOf(hartwell), 35_000_000);
        assertEq(usdc.balanceOf(maya), mayaBefore);
    }

    /// Boundary: $10.01 left over goes back to the sender.
    function test_Redeem_Leftover1001_GoesToSender() public {
        uint256 id = _gift(GIFT_45);
        bytes32 orderId = keccak256("order-1001");
        uint256 mayaBefore = usdc.balanceOf(maya);
        _redeemAsAlex(id, 34_990_000, orderId);
        assertEq(usdc.balanceOf(alex), 0);
        assertEq(usdc.balanceOf(maya) - mayaBefore, 10_010_000);
        assertEq(usdc.balanceOf(hartwell), 34_990_000);
    }

    /// Leftover over $10 goes back to the sender: $100 gift, $39.98 shovel, $60.02 to Maya.
    function test_Redeem_LeftoverOverLimit_GoesToSender() public {
        uint256 id = _gift(100_000_000);
        bytes32 orderId = keccak256("order-over");
        uint256 mayaBefore = usdc.balanceOf(maya);

        vm.expectEmit(true, true, true, true);
        emit GiftRedeemed(id, alex, hartwell, SHOVEL_PRICE, 60_020_000, maya, orderId);
        _redeemAsAlex(id, SHOVEL_PRICE, orderId);

        assertEq(usdc.balanceOf(maya) - mayaBefore, 60_020_000);
        assertEq(usdc.balanceOf(alex), 0);
        assertEq(usdc.balanceOf(hartwell), SHOVEL_PRICE);
    }

    function test_Redeem_ExactPrice_NoChange() public {
        uint256 id = _gift(SHOVEL_PRICE);
        bytes32 orderId = keccak256("order-nochange");
        _redeemAsAlex(id, SHOVEL_PRICE, orderId);
        assertEq(usdc.balanceOf(hartwell), SHOVEL_PRICE);
        assertEq(usdc.balanceOf(address(earmark)), 0);
    }

    function test_Redeem_AfterSignerRotation_OldKeyRejected() public {
        uint256 id = _gift(GIFT_45);
        bytes32 orderId = keccak256("rotate");
        bytes memory oldSig = _storeSig(id, SHOVEL_PRICE, orderId);
        vm.prank(owner);
        earmark.registerStore(hartwell, otherSigner);
        vm.prank(alex);
        vm.expectRevert(abi.encodeWithSelector(Earmark.InvalidStoreSignature.selector, hartwellSigner, otherSigner));
        earmark.redeem(id, SHOVEL_PRICE, orderId, oldSig);
    }

    // ------------------------------------------------------------------ redeem: rules

    /// Wrong store: a valid-looking order signed by ANOTHER registered store's signer.
    function test_Revert_WrongStore() public {
        uint256 id = _gift(GIFT_45);
        bytes32 orderId = keccak256("wrong-store");
        bytes memory sig = _sign(otherSignerPk, id, SHOVEL, SHOVEL_PRICE, orderId, alex);
        vm.prank(alex);
        vm.expectRevert(abi.encodeWithSelector(Earmark.InvalidStoreSignature.selector, otherSigner, hartwellSigner));
        earmark.redeem(id, SHOVEL_PRICE, orderId, sig);
    }

    /// Wrong item: the real store signer signs an order for the drill; gift is for the shovel.
    function test_Revert_WrongItem() public {
        uint256 id = _gift(100_000_000);
        bytes32 orderId = keccak256("wrong-item");
        bytes memory sig = _sign(hartwellSignerPk, id, DRILL, 89_000_000, orderId, alex);
        vm.prank(alex);
        vm.expectPartialRevert(Earmark.InvalidStoreSignature.selector);
        earmark.redeem(id, 89_000_000, orderId, sig);
    }

    /// Wrong receiver (caller): someone other than the receiver submits a valid order.
    function test_Revert_WrongReceiver_Caller() public {
        uint256 id = _gift(GIFT_45);
        bytes32 orderId = keccak256("wrong-caller");
        bytes memory sig = _storeSig(id, SHOVEL_PRICE, orderId);
        vm.prank(eve);
        vm.expectRevert(abi.encodeWithSelector(Earmark.NotReceiver.selector, eve, alex));
        earmark.redeem(id, SHOVEL_PRICE, orderId, sig);
    }

    /// Wrong receiver (signature): the store signed for a different receiver.
    function test_Revert_WrongReceiver_Signature() public {
        uint256 id = _gift(GIFT_45);
        bytes32 orderId = keccak256("wrong-recv-sig");
        bytes memory sig = _sign(hartwellSignerPk, id, SHOVEL, SHOVEL_PRICE, orderId, eve);
        vm.prank(alex);
        vm.expectPartialRevert(Earmark.InvalidStoreSignature.selector);
        earmark.redeem(id, SHOVEL_PRICE, orderId, sig);
    }

    /// Forged signature: signed by a random unregistered key.
    function test_Revert_ForgedSignature() public {
        uint256 id = _gift(GIFT_45);
        bytes32 orderId = keccak256("forged");
        uint256 forgerPk = 0xBAD;
        bytes memory sig = _sign(forgerPk, id, SHOVEL, SHOVEL_PRICE, orderId, alex);
        vm.prank(alex);
        vm.expectRevert(
            abi.encodeWithSelector(Earmark.InvalidStoreSignature.selector, vm.addr(forgerPk), hartwellSigner)
        );
        earmark.redeem(id, SHOVEL_PRICE, orderId, sig);
    }

    /// Forged signature: garbage bytes / tampered price.
    function test_Revert_MalformedOrTamperedSignature() public {
        uint256 id = _gift(GIFT_45);
        bytes32 orderId = keccak256("garbage");
        vm.startPrank(alex);
        vm.expectRevert(abi.encodeWithSelector(Earmark.InvalidStoreSignature.selector, address(0), hartwellSigner));
        earmark.redeem(id, SHOVEL_PRICE, orderId, hex"deadbeef");

        // signed for $39.98, submitted claiming $30.00
        bytes memory sig = _storeSig(id, SHOVEL_PRICE, orderId);
        vm.expectPartialRevert(Earmark.InvalidStoreSignature.selector);
        earmark.redeem(id, 30_000_000, orderId, sig);
        vm.stopPrank();
    }

    function test_Revert_OverPrice() public {
        uint256 id = _gift(GIFT_45);
        bytes32 orderId = keccak256("over-price");
        uint256 price = 45_000_001;
        bytes memory sig = _storeSig(id, price, orderId);
        vm.prank(alex);
        vm.expectRevert(abi.encodeWithSelector(Earmark.PriceExceedsAmount.selector, price, GIFT_45));
        earmark.redeem(id, price, orderId, sig);
    }

    function test_Revert_Expired() public {
        uint256 id = _gift(GIFT_45);
        bytes32 orderId = keccak256("expired");
        bytes memory sig = _storeSig(id, SHOVEL_PRICE, orderId);
        vm.warp(uint256(expiry) + 1);
        vm.prank(alex);
        vm.expectRevert(abi.encodeWithSelector(Earmark.GiftExpired.selector, id, expiry));
        earmark.redeem(id, SHOVEL_PRICE, orderId, sig);
    }

    function test_Redeem_AtExactExpiry_StillWorks() public {
        uint256 id = _gift(GIFT_45);
        bytes32 orderId = keccak256("at-expiry");
        bytes memory sig = _storeSig(id, SHOVEL_PRICE, orderId);
        vm.warp(expiry);
        vm.prank(alex);
        earmark.redeem(id, SHOVEL_PRICE, orderId, sig);
        assertEq(earmark.getGift(id).status, earmark.STATUS_SPENT());
    }

    function test_Revert_AlreadyUsed() public {
        uint256 id = _gift(GIFT_45);
        bytes32 orderId = keccak256("used-1");
        _redeemAsAlex(id, SHOVEL_PRICE, orderId);

        bytes32 orderId2 = keccak256("used-2");
        bytes memory sig2 = _storeSig(id, SHOVEL_PRICE, orderId2);
        vm.prank(alex);
        vm.expectRevert(abi.encodeWithSelector(Earmark.GiftNotLocked.selector, id, earmark.STATUS_SPENT()));
        earmark.redeem(id, SHOVEL_PRICE, orderId2, sig2);
    }

    function test_Revert_ReusedOrderId() public {
        uint256 id1 = _gift(GIFT_45);
        uint256 id2 = _gift(GIFT_45);
        bytes32 orderId = keccak256("same-order");
        _redeemAsAlex(id1, SHOVEL_PRICE, orderId);

        bytes memory sig2 = _storeSig(id2, SHOVEL_PRICE, orderId);
        vm.prank(alex);
        vm.expectRevert(abi.encodeWithSelector(Earmark.OrderIdAlreadyUsed.selector, orderId));
        earmark.redeem(id2, SHOVEL_PRICE, orderId, sig2);
    }

    function test_Revert_GiftNotFound() public {
        vm.prank(alex);
        vm.expectRevert(abi.encodeWithSelector(Earmark.GiftNotFound.selector, 99));
        earmark.redeem(99, 1, bytes32(0), "");
    }

    // ------------------------------------------------------------------ refund

    function test_Refund_AfterExpiry_AllToSender() public {
        uint256 id = _gift(GIFT_45);
        uint256 mayaBefore = usdc.balanceOf(maya);
        vm.warp(uint256(expiry) + 1);

        vm.expectEmit(true, true, false, true);
        emit GiftRefunded(id, maya, GIFT_45);
        vm.prank(eve); // anyone may call
        earmark.refund(id);

        assertEq(usdc.balanceOf(maya) - mayaBefore, GIFT_45);
        assertEq(usdc.balanceOf(eve), 0);
        assertEq(usdc.balanceOf(address(earmark)), 0);
        assertEq(earmark.getGift(id).status, earmark.STATUS_REFUNDED());

        // refunded gift cannot be redeemed or refunded again
        vm.expectRevert(abi.encodeWithSelector(Earmark.GiftNotLocked.selector, id, earmark.STATUS_REFUNDED()));
        earmark.refund(id);
    }

    function test_Refund_BeforeExpiry_Reverts() public {
        uint256 id = _gift(GIFT_45);
        vm.expectRevert(abi.encodeWithSelector(Earmark.GiftNotExpired.selector, id, expiry));
        earmark.refund(id);
        vm.warp(expiry); // at expiry it is still redeemable, so not yet refundable
        vm.expectRevert(abi.encodeWithSelector(Earmark.GiftNotExpired.selector, id, expiry));
        earmark.refund(id);
    }

    function test_Refund_AfterSpent_Reverts() public {
        uint256 id = _gift(GIFT_45);
        bytes32 orderId = keccak256("spent-then-refund");
        _redeemAsAlex(id, SHOVEL_PRICE, orderId);
        vm.warp(uint256(expiry) + 1);
        vm.expectRevert(abi.encodeWithSelector(Earmark.GiftNotLocked.selector, id, earmark.STATUS_SPENT()));
        earmark.refund(id);
    }

    function test_Refund_UnknownGift_Reverts() public {
        vm.expectRevert(abi.encodeWithSelector(Earmark.GiftNotFound.selector, 7));
        earmark.refund(7);
    }

    // ------------------------------------------------------------------ EIP-712 shape

    /// The digest the contract checks must equal a hand-built EIP-712 digest
    /// (what viem signTypedData / earmarkSigner produce).
    function test_HashOrder_MatchesManualEip712() public view {
        bytes32 domainTypehash =
            keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
        bytes32 ds = keccak256(
            abi.encode(domainTypehash, keccak256("Earmark"), keccak256("1"), block.chainid, address(earmark))
        );
        assertEq(earmark.domainSeparator(), ds);

        bytes32 typehash =
            keccak256("Order(uint256 giftId,bytes32 itemId,uint256 price,bytes32 orderId,address receiver)");
        assertEq(earmark.ORDER_TYPEHASH(), typehash);

        bytes32 orderId = keccak256("x");
        bytes32 structHash = keccak256(abi.encode(typehash, uint256(1), SHOVEL, SHOVEL_PRICE, orderId, alex));
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", ds, structHash));
        assertEq(earmark.hashOrder(1, SHOVEL, SHOVEL_PRICE, orderId, alex), digest);
    }

    // ------------------------------------------------------------------ fuzz

    function testFuzz_ChangeSplit(uint256 amount, uint256 price) public {
        amount = bound(amount, 1, 1_000_000_000);
        price = bound(price, 0, amount);
        // ~1 in 4 runs land within a cent of the $10 boundary
        if (amount > 10_100_000 && price % 4 == 0) price = amount - 9_990_000 - (price % 20_001);

        uint256 id = _gift(amount);
        bytes32 orderId = keccak256(abi.encode("fuzz", amount, price));
        uint256 mayaBefore = usdc.balanceOf(maya);

        _redeemAsAlex(id, price, orderId);

        uint256 change = amount - price;
        assertEq(usdc.balanceOf(hartwell), price, "store gets exactly price");
        if (change <= earmark.CHANGE_LIMIT()) {
            assertEq(usdc.balanceOf(alex), change, "small change -> receiver");
            assertEq(usdc.balanceOf(maya), mayaBefore);
        } else {
            assertEq(usdc.balanceOf(alex), 0);
            assertEq(usdc.balanceOf(maya) - mayaBefore, change, "big change -> sender");
        }
        assertEq(usdc.balanceOf(address(earmark)), 0, "contract holds nothing after");
    }
}
