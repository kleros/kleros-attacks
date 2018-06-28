/**
 * @title Attack on early reveal by deposit and use of cut and choose.
 * @author Clément Lesaege - <clement@lesaege.com>
 *  
 * This code implements the Cut and choose against early reveal penalization attack (https://docs.google.com/document/d/1KVUrjxUkVT01ekQHhDeILr5unJdHP-UFl_dkki-xCmE/).
 */
pragma solidity ^0.4.15;

import "kleros-interaction/contracts/standard/rng/RNG.sol";
 
contract CutAndChooseForEarlyReveal {
    
    uint public promise;
    bytes32[] public hashedValues;
    address public attacker;
    RNG public rng;
    uint public rngBlock; // The block random number will be linked to.
    
    /** @dev Constructor, take a deposit and the promised value.
     *  @param _promise The value the attacker promise to vote.
     *  @param _hashedValues The results of keccak256(_promise,salt).
     *  @param _rng The random number generator which will be used.
     */
    function CutAndChooseForEarlyReveal(uint _promise, bytes32[] _hashedValues, RNG _rng) public payable {
        promise=_promise;
        for (uint i=0;i<_hashedValues.length;i++)
            hashedValues.push(_hashedValues[i]);
         
        attacker=msg.sender;
        rng=_rng;
        rngBlock=block.number;
    }
    
    /** @dev Give back the deposit to the attacker.
     *  Note that if the rng is blocked, the attacker deposit will be too.
     *  @param _salts The salts which were used for the committed values except the one which should not be revealed which must be 0 instead.
     */
    function showCorrect(uint[] _salts) public {
        uint random = rng.getUncorrelatedRN(rngBlock);
        require(random!=0); // Make sure the random number is ready.
        random %= hashedValues.length; // Reduce it into [[0,_hashedValues.length-1]].
        for (uint i=0;i<hashedValues.length;i++)
            if (i==random)
                require(_salts[i]==0); // The non revealed one must be 0.
            else
                require(keccak256(promise,_salts[i])==hashedValues[i]); // The others must be the correct salts.
        
        attacker.transfer(this.balance);
    }
    
}