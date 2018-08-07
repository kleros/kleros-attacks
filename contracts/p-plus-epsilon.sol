pragma solidity ^0.4.24;

import "./Kleros.sol";
import {MiniMeTokenERC20 as Pinakion} from "kleros-interaction/contracts/standard/arbitration/ArbitrableTokens/MiniMeTokenERC20.sol";

/** @title PPlusEplsilonKleros
 *  @author Daniel Babbev
 *
 *  This contract implements a p + epsilon attack against the Kleros court,
 *  as described by VitaliK Buterin here: https://blog.ethereum.org/2015/01/28/p-epsilon-attack/
 */
contract PPlusEplsilonKleros {
  Pinakion public pinakion;
  Kleros public court;

  uint public balance;
  uint public disputeID;
  uint public desiredOutcome;
  uint public epsilon;
  bool public settled;
  mapping (address => uint) public withdraw; // We'll use a withdraw pattern here to avoid multiple sends when a juror has voted multiple times

  address public attacker;
  uint public remainingWithdraw; // Here we keep the total amount bribed jurors have available for withdraw.

  modifier onlyBy(address _account) {require(msg.sender == _account); _;}

  function constructor(Pinakion _pinakion, Kleros _kleros, uint _disputeID, uint _desiredOutcome, uint _epsilon) {
    attacker = msg.sender;
    court = _kleros;
    disputeID = _disputeID;
    epsilon = _epsilon;
    desiredOutcome = _desiredOutcome;
    pinakion = _pinakion;
  }

  /** @dev Callback of approveAndCall - transfer pinakions in the contract. Should be called by the pinakion contract. TRUSTED.
   *
   *  The attacker has to deposit sufficiently large amount of PNK to cover the payouts to the jurors.
   *
   *  @param _from The address making the transfer.
   *  @param _amount Amount of tokens to transfer to this contract (in basic units).
   */
  function receiveApproval(address _from, uint _amount, address, bytes) public onlyBy(pinakion) {
    require(pinakion.transferFrom(_from, this, _amount));

    balance += _amount;
  }

  /** @dev Jurors can withdraw their PNK from here
   */
  function withdraw() {
    require(withdraw[msg.sender] > 0);
    uint amount = withdraw[msg.sender];
    withdraw[msg.sender] = 0;

    // The juror receives d + p + e (deposit + p + epsilon)
    require(pinakion.transfer(msg.sender, amount));
  }

  /** @dev The attacker can withdraw their PNK from here after the bribe has been settled.
   */
  function withdrawAttacker(){
    require(settled);

    if (balance > remainingWithdraw) {
      // The attacker can withdraw the remaning balance of PNK after the contract has been settled.
      require(pinakion.transfer(attacker, balance - remainingWithdraw));
    }
  }

  /** @dev Settles the p + e bribe with the jurors.
   * If the dispute is ruled differently from desiredOutcome:
   *    The jurors who voted for desiredOutcome receive p + d + e in rewards from this contract.
   * If the dispute is ruled as in desiredOutcome:
   *    The jurors don't receive anything from this contract.
   */
  function settle() public {
    require(court.disputeStatus(disputeID) ==  Arbitrator.DisputeStatus.Solved);
    require(!settled); // This function can be executed only once.

    settled = true; // settle the bribe

    // From the dispute we get the # of appeals and available choices
    var (, , appeals, choices, , , ,) = court.disputes(disputeID);

    if (court.currentRuling(disputeID) != desiredOutcome){
      // Calculate the redistribution amounts.
      uint amountShift = court.getStakePerDraw();
      uint winningChoice = court.getWinningChoice(disputeID, appeals);

      // Rewards are calculated as per the one shot token reparation.
      for (uint i=0; i < appeals; i++){ // Loop each appeal and each vote.

        // Note that we don't check if the result was a tie becuse we are getting a funny compiler error: "stack is too deep" if we check.
        // TODO: Account for ties
        if (winningChoice != 0){
          // votesLen is the lenght of the votes per each appeal. There is no getter function for that, so we have to calculate it here.
          // We must end up with the exact same value as if we would have called dispute.votes[i].length
          uint votesLen = 0;
          for (uint c = 0; c < choices; c++) { // Iterate for each choice of the dispute.
            votesLen += court.getVoteCount(disputeID, i, c);
          }

          uint totalToRedistribute = 0;
          uint nbCoherent = 0;

          // Now we will use votesLen as a substitute for dispute.votes[i].length
          for (uint j=0; j < votesLen; j++){
            uint voteRuling = court.getVoteRuling(disputeID, i, j);
            address voteAccount = court.getVoteAccount(disputeID, i, j);

            if (voteRuling != winningChoice){
              totalToRedistribute += amountShift;

              if (voteRuling == desiredOutcome){ // If the juror voted as we desired.
                // Transfer this juror back the penalty.
                withdraw[voteAccount] += amountShift;
                remainingWithdraw += amountShift;
              }
            } else {
              nbCoherent++;
            }
          }
          if (nbCoherent > 0){
            // toRedistribute is the amount each juror received when he voted coherently.
            uint toRedistribute = totalToRedistribute / nbCoherent;

            // We use votesLen again as a substitute for dispute.votes[i].length
            for (j = 0; j < votesLen; j++){
              voteRuling = court.getVoteRuling(disputeID, i, j);
              voteAccount = court.getVoteAccount(disputeID, i, j);

              if (voteRuling == desiredOutcome){
                // Add the coherent juror reward + epsilon to the total payout.
                withdraw[voteAccount] += toRedistribute + epsilon;
                remainingWithdraw += toRedistribute + epsilon;
              }
            }
          }
        }
      }
    }
  }
}
