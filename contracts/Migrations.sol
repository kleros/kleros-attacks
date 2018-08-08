pragma solidity ^0.4.23;

import "kleros-interaction/contracts/standard/rng/ConstantNG.sol";
import "kleros/contracts/POC/KlerosPOC.sol";
import "kleros-interaction/contracts/standard/arbitration/ArbitrableTransaction.sol";

contract Migrations {
  address public owner;
  uint public last_completed_migration;

  constructor() public {
    owner = msg.sender;
  }

  modifier restricted() {
    if (msg.sender == owner) _;
  }

  function setCompleted(uint completed) public restricted {
    last_completed_migration = completed;
  }

  function upgrade(address new_address) public restricted {
    Migrations upgraded = Migrations(new_address);
    upgraded.setCompleted(last_completed_migration);
  }
}
