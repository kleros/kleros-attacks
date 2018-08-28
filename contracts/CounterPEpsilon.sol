pragma solidity ^0.4.24;

import "kleros/contracts/Kleros.sol";
import "kleros-interaction/contracts/standard/rng/RNG.sol";
import {MiniMeTokenERC20 as Pinakion} from "kleros-interaction/contracts/standard/arbitration/ArbitrableTokens/MiniMeTokenERC20.sol";

contract CounterPEpsilon {
  Pinakion public pinakion;
  Kleros public kleros;
  RNG public rng; // Random Number Generator used to assign voters
  uint public rnBlock; // The block number for random number generation
  bool public isOn; // Is the CC game running
  bool public isDrawn; // True if the jurors are drawn
  mapping(address => uint) public withdraw; // The amount of money available for withdraw

  bool public settled;
  bool public settleLoaded;

  uint public disputeID;
  uint public choiceX; // The choice counter-ccordination targets- the true choice
  uint public choiceY; // The choice P+epsilon targets
  uint public deposit;
  uint public epsilon;
  uint public maxCPayment; // The maximum amount of coherence payment, as defined by the CC paper
  uint public marginErr;
  uint public marginVictory;
  uint public jurorsDrawn; // The total number of jurors in the case
  uint public choices; // The coices for the dispute

  uint public session; // The session of the dispute
  uint public appeal; // The appeal this contract is coordinating
  // HACK: Keep this here to avoid "stack too deep"
  uint public maxAppeal; // After the case is settled save the appeals here

  // HACK: Keep these variables here to avoid "stack too deep" error in settle()
  uint public votesTotalX; // The # of X votes in the appeal including non-registered
  uint public votesTotalY; // The # of Y votes in the appeal including non-registered

  struct Juror {
    uint draws; // The draws length of this juror
    bool paid;  // If the juror has deposited money
  }

  mapping (address => Juror) public registeredJurors; // The jurors want to participate in CC and their draw length
  uint public totalVotesPaid; // The total amount of votes this contract has in deposits
  address[] public jurors; // An array of the jurors participating in CC

  mapping(address => bool) public votesNeededX; // The votes that need to be cast for X

  modifier onlyBy(address _account) {require(msg.sender == _account); _;}
  modifier onlyDuring(Kleros.Period _period) {require(kleros.period() == _period); _;}
  modifier onlyDuringStartSession() {require(kleros.session() == session); _;}

  event AmountShift(uint val, address juror, uint vote);

  /* @dev Constructor
   * @param _pinakion Address of PNK
   * @param _kleros Address of Kleros
   * @param _rng Address of RNG
   * @param _disputeID The dispute ID
   * @param _choiceX The truthful choice
   * @param _choiceY The choice of the attacker
   * @param _deposit The minimum deposit amount for a juror to register
   * @param _epsilon The eplsion of the attack
   * @param _maxCPayment The max amount of coherence payment (defined L in the paper)
   * @param _marginErr The margin of error E
   * @param _marginVictory The margin of victory F
   */
  constructor(
    Pinakion _pinakion,
    Kleros _kleros,
    RNG _rng,
    uint _disputeID,
    uint _choiceX,
    uint _choiceY,
    uint _deposit,
    uint _epsilon,
    uint _maxCPayment,
    uint _marginErr,
    uint _marginVictory){
      pinakion = _pinakion;
      kleros = _kleros;
      rng = _rng;
      disputeID = _disputeID;
      choiceX = _choiceX;
      choiceY = _choiceY;
      deposit = _deposit;
      maxCPayment = _maxCPayment;
      epsilon = _epsilon;
      marginErr = _marginErr;
      marginVictory = _marginVictory;
      session = kleros.session();
      jurorsDrawn = kleros.amountJurors(disputeID); // Period has to be vote for this to work!!!
      (, , appeal, choices, , , ,) = kleros.disputes(disputeID); // Get the appeal latest appeal for the dispute
  }

  /** @dev Callback of approveAndCall - transfer pinakions in the contract. Should be called by the pinakion contract. TRUSTED.
   *  After the deposit is paid, the registration is final
   *  @param _from The address making the transfer.
   *  @param _amount Amount of tokens to transfer to this contract (in basic units).
   */
  function receiveApproval(address _from, uint _amount, address, bytes) public
    onlyBy(pinakion)
    onlyDuring(Kleros.Period.Vote)
    onlyDuringStartSession() {
      require(!isOn);
      Juror storage juror = registeredJurors[_from];
      require(_amount >= juror.draws * deposit); // We need at least draws * D in deposit
      require(!juror.paid);

      require(pinakion.transferFrom(_from, this, _amount));

      juror.paid = true;
      totalVotesPaid += registeredJurors[_from].draws;
      jurors.push(_from);
  }

  /* @dev Registers a juror for making a deposit
   * A juror must call this function before making his deposit of PNK
   * @param _draws Valid draws of the juror
   */
  function registerJuror(uint[] _draws) public
    onlyDuring(Kleros.Period.Vote)
    onlyDuringStartSession() {
      require(!isOn);
      Juror storage juror = registeredJurors[msg.sender];
      require(kleros.validDraws(msg.sender, disputeID, _draws)); // Juror registers with this much draws
      require(!juror.paid); // The juror can pay only once

      juror.draws = _draws.length;
    }

  /** @dev Begins the counter coordination game.
   *  Locks the jurors and the random block number in the future.
   */
  function begin() public
    onlyDuring(Kleros.Period.Vote)
    onlyDuringStartSession() {
      require(!isOn);
      // TODO: Round ceil division of odd number
      require(totalVotesPaid >= jurorsDrawn/2 + marginErr); // Begin only if S >= M/2 + E. Else we wait for more jurors

      isOn = true; // Start the CC if we have enough jurors
      rnBlock = block.number + 1; // The block hash must not be known when begin() is called
      rng.requestRN(rnBlock);
  }

  /** @dev Assigns the jurors how to vote.
   *  With n jurors, the complexity is O(n).
   */
  function drawJurors() public
    onlyDuring(Kleros.Period.Vote)
    onlyDuringStartSession(){
        require(isOn);
        require(block.number > rnBlock); // We must have passed the selected block number
        isDrawn = true;

        // Draw a random number between 0 and jurors.length
        uint randomNumber = rng.getUncorrelatedRN(rnBlock) % jurors.length;

        // Choose [M/2] + F jurors to vote X, the rest will vote Y
        //
        // This algorithm will start from a random index in the juror array and it will
        // assign the subsequent [M/2] + F jurors to vote for the desired desired outcome
        // NOTE: There is a bias to the juror selection, as jurors close to each other will get drawn together
        for (uint i = 0; i < jurorsDrawn/2 + marginVictory; i++){
          votesNeededX[jurors[randomNumber]] = true;
          randomNumber = (randomNumber + 1) % jurors.length;
        }
  }

  /* @dev Getter for how a juror should vote
   * @return 1 if vote is for X, 2 if vote is for Y, 0 if address if not registered
   */
   function getJurorVote(address _juror) public view returns(uint) {
     if(votesNeededX[_juror]){return 1;}
     return registeredJurors[_juror].paid ? 2 : 0;
   }

   /* @dev Check if the casted vote is coherent with what was instructed by the CC contract
    * @param _juror The juror address
    * @param _vote The casted vote
    * @return True if the juror has NOT defected
    */
   function isVoteCoherent(address _juror, uint _vote) public view returns(bool) {
     if(getJurorVote(_juror) == 1 && _vote == choiceX){return true;}
     return getJurorVote(_juror) == 2 && _vote == choiceY ? true : false;
   }

   /* @dev Juror can withdraw his balance from here
    */
   function withdrawJuror() public{
     withdrawSelect(msg.sender);
   }

   /** @dev Withdraw the tokens of a selected address
    *  @param _juror The withdraw address
    */
   function withdrawSelect(address _juror) public {
     uint amount = withdraw[_juror];
     withdraw[_juror] = 0;

     // The juror receives d + p + e (deposit + p + epsilon)
     require(pinakion.transfer(_juror, amount));
   }

   /* @dev Settles the counter-coordination
    */
   function settle() public {
     require(kleros.disputeStatus(disputeID) ==  Arbitrator.DisputeStatus.Solved); // The case must be solved.
     require(!settled); // This function can be run only once

     settled = true; // Settle the CC

     (, , maxAppeal, , , , ,) = kleros.disputes(disputeID); // Get the appeal latest appeal for the dispute

     // Get the winning choice of the appeal
     uint winningChoice = kleros.getWinningChoice(disputeID, maxAppeal);

     uint ccDefectors = 0; // The number of defectors in the CC
     uint votesCohX = 0; // The # of registered votes for X that did not defect
     uint votesCohY = 0; // The # of registered votes for Y that did not defect

     // votesLen is the length of the votes for the appeal. There is no getter function for that, so we have to calculate it here.
     // We must end up with the exact same value as if we would have called dispute.votes[i].length
     uint votesLen = 0;
     for (uint c = 0; c <= choices; c++) { // Iterate for each choice of the dispute.
       votesLen += kleros.getVoteCount(disputeID, appeal, c);
     }
     //emit Log(votesLen, 0x0, "votesLen");

      // First loop to count the # of defectors, # votes for Y and # votes for X
     for (uint j=0; j < votesLen; j++){  // Now we will use votesLen as a substitute for dispute.votes[i].length
       uint voteRuling = kleros.getVoteRuling(disputeID, appeal, j);
       address voteAccount = kleros.getVoteAccount(disputeID, appeal, j);
       //emit Log(voteRuling, voteAccount, "voted");

       // Count the total amount of votes in the appeal
       if (voteRuling == choiceX){votesTotalX += 1;}
       else if (voteRuling == choiceX){votesTotalY += 1;} // voteRuling could be zero if juror has not voted, so check

       if(getJurorVote(voteAccount) > 0){ // The juror is registered for CC
         if(isVoteCoherent(voteAccount, voteRuling)){
           // NOTE: This works only for binary disputes
           // Count the non-defecting X and Y votes
           voteRuling == choiceX ? votesCohX += 1 : votesCohY += 1;
         } else {
           ccDefectors+=1;
         }
       }
     }

     uint amountX = 0; // Amount to distribute to non-defecting X voters
     uint amountY = 0; // Amount to distribute to non-defecting Y voters

     // NOTE: This works only for binary disputes
     // Distribuite rewards
     if(winningChoice == choiceX){
      amountX = deposit + deposit * ccDefectors/(totalVotesPaid - ccDefectors) + epsilon * votesCohY/(totalVotesPaid - ccDefectors);
      amountY = deposit + deposit * ccDefectors/(totalVotesPaid - ccDefectors) + epsilon * (votesCohY/(totalVotesPaid - ccDefectors) - 1);
     }
     else if (winningChoice == choiceY){ // winningChoice could be zero, so check if it is not
       uint d = kleros.getStakePerDraw();

       // Calculate B: CC Paper, Point 1.7
       // m1 = min{coherence payouts paid to Y CC, L*y}
       uint m1 = votesTotalX/votesTotalY * d * votesCohY < maxCPayment * votesCohY ? votesTotalX/votesTotalY * d * votesCohY : maxCPayment * votesCohY;
       uint b = m1 - d * votesCohX + deposit * ccDefectors;
       amountX = deposit + d + b/(totalVotesPaid - ccDefectors);

       // m2 = min{coherence payment, L}
       uint m2 = votesTotalX/votesTotalY * d < maxCPayment ? amountX/amountY * d : maxCPayment;
       amountY = deposit - m2 + b/(totalVotesPaid - ccDefectors);
     }

     // Second loop to reward non-defecting voters
     for (j=0; j < votesLen; j++){
      voteRuling = kleros.getVoteRuling(disputeID, appeal, j);
      voteAccount = kleros.getVoteAccount(disputeID, appeal, j);
       // If the juror is coherent and the juror is registered
       if(isVoteCoherent(voteAccount, voteRuling) && getJurorVote(voteAccount) > 0){
         voteRuling == choiceX ? withdraw[voteAccount] += amountX : withdraw[voteAccount] += amountY;
       }
     }
   }
 }
