// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Earmark} from "../src/Earmark.sol";

/// @notice Deploys Earmark(usdc, owner = deployer).
/// env: DEPLOYER_PRIVATE_KEY (0x-hex), USDC_ADDRESS
contract Deploy is Script {
    function run() external returns (Earmark earmark) {
        uint256 pk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address usdc = vm.envAddress("USDC_ADDRESS");
        address deployer = vm.addr(pk);

        vm.startBroadcast(pk);
        earmark = new Earmark(IERC20(usdc), deployer);
        vm.stopBroadcast();

        console2.log("Earmark", address(earmark));
        console2.log("owner", deployer);
        console2.log("usdc", usdc);
    }
}
