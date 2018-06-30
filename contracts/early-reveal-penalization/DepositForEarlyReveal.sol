/**
 * @title Attack on early reveal by deposit
 * @author Clément Lesaege - <clement@lesaege.com>
 * Based on a simplification of the cut and chose attack by Zack Lawrence.
 *  
 *
 * The attacker can give insight to its choice in an early reveal penalization scheme.
 * (See Truthcoin whitepaper article IV (f): http://www.truthcoin.info/papers/truthcoin-whitepaper.pdf)
 * The attacker put a deposit in the contract, this deposit will only be reimburse if the attacker votes as it promised to the contract.
 * This let other parties to that either:
 *  -The attacker voted/will vote as it promised.
 *  OR
 *  -The attacker will lose its deposit.
 *
 *
 * Scheme against early reveal:
 * During the commitment phase, parties commit to a value by submitting hashedValue=hash(value,salt) where salt is a random value.
 * During the reveal phase, parties can submit (value,salt), the contract verifies that hash(value,salt) corresponds to the submission.
 * If it does, it accepts value.
 *
 * Before the reveal phase anyone can submit the (value,salt) of another party to penalize it.
 * This way parties are incentivized not to reveal their (value,salt) (they can reveal value, but there no reason to believe a party which just revealed value).
 *
 *
 * To attack this scheme and let other parties know value, the attacker submits (hashedValue,value) and pays a deposit d while creating this contract.
 * After the reveal phase starts, the attacker can submit salt to this contract. If hash(value,salt) corresponds to hashedValue, this contract gives back the attacker deposit.
 * If the attacker made a false promise, the deposit stays stucked forever in this contract.
 */
pragma solidity ^0.4.15;
 
contract DepositForEarlyReveal {
    
    uint public promise;
    bytes32 public hashedValue;
    address public attacker;
    
    /** @dev Constructor, take a deposit and the promised value.
     *  @param _promise The value the attacker promise to vote.
     *  @param _hashedValue The result of keccak256(_promise,salt).
     */
    function DepositForEarlyReveal(uint _promise, bytes32 _hashedValue) public payable {
        promise=_promise;
        hashedValue=_hashedValue;
        attacker=msg.sender;
    }
    
    /** @dev Give back the deposit to the attacker.
     *  @param _salt The random salt which was used.
     */
    function showCorrect(uint _salt) public {
        require(keccak256(promise,_salt)==hashedValue);
        attacker.transfer(this.balance);
    }
    
}
