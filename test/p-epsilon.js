const PEpsilon = artifacts.require("PEpsilon")
const KlerosPOC = artifacts.require("KlerosPOC")
const Pinakion = artifacts.require("MiniMeTokenERC20")
const ConstantRandom = artifacts.require("ConstantNG")
const ArbitrableTransaction = artifacts.require("ArbitrableTransaction")

contract('PEpsilon', async (accounts) => {
  let creator  = accounts[0]
  let jurorA = accounts[1]
  let jurorB = accounts[2]
  let jurorC = accounts[3]
  let other = accounts[4]
  let payer = accounts[5]
  let payee = accounts[6]
  let governor = accounts[7]

  let attacker = accounts[9]

  it("should deposit deploy the contract correctly", async () => {
    let pinakion = await Pinakion.new(0x0, 0x0, 0, 'Pinakion', 18, 'PNK', true, {from: creator})
    let rng = await ConstantRandom.new(10, {from: creator})
    let klerosPOC = await KlerosPOC.new(pinakion.address, rng.address, [2, 4, 8, 2, 5], governor, {from: creator})
    let pEpsilon = await PEpsilon.new(pinakion.address, klerosPOC.address, 0, 0, 0, {from: attacker})

    assert.equal(await pEpsilon.pinakion(), pinakion.address, "The pnk address is wrong")
    assert.equal(await pEpsilon.court(), klerosPOC.address, "The klerosPOC address is wrong")
    assert.equal(await pEpsilon.attacker(), attacker, "The attacker address is wrong")
  })

  it("should deposit PNK to the bribe contract", async () => {
    let pinakion = await Pinakion.new(0x0, 0x0, 0, 'Pinakion', 18, 'PNK', true, {from: creator})
    let rng = await ConstantRandom.new(10, {from: creator})
    let klerosPOC = await KlerosPOC.new(pinakion.address, rng.address, [2, 4, 8, 2, 5], governor, {from: creator})
    await pinakion.changeController(klerosPOC.address, {from: creator})
    let pEpsilon = await PEpsilon.new(pinakion.address, klerosPOC.address, 0, 0, 0, {from: attacker})

    await klerosPOC.buyPinakion({from: attacker, value: 1e18})
    await klerosPOC.withdraw(1e18, {from: attacker})
    await pinakion.approveAndCall(pEpsilon.address, 1e18, '', {from: attacker})

    assert.equal(await pEpsilon.balance(), 1e18, 'contract balance is wrong')
  })

  it("should execute attack corectly", async () => {
    let pinakion = await Pinakion.new(0x0, 0x0, 0, 'Pinakion', 18, 'PNK', true, {from: creator})
    let rng = await ConstantRandom.new(10, {from: creator})
    let klerosPOC = await KlerosPOC.new(pinakion.address, rng.address, [0, 0, 0, 0, 0], governor, {from: creator})
    await pinakion.changeController(klerosPOC.address, {from: creator})
    await klerosPOC.buyPinakion({from: jurorA, value: 0.4e18})
    await klerosPOC.activateTokens(0.4e18, {from: jurorA})
    await klerosPOC.buyPinakion({from: jurorB, value: 0.6e18})
    await klerosPOC.activateTokens(0.6e18, {from: jurorB})
    let arbitrableTransaction = await ArbitrableTransaction.new(klerosPOC.address, 0x0, 0, payee, 0x0, {from: payer, value: 0.1e18})
    let arbitrationFee = await klerosPOC.arbitrationCost(0x0, {from: payer})
    await arbitrableTransaction.payArbitrationFeeByPartyA({from: payer, value: arbitrationFee})
    await arbitrableTransaction.payArbitrationFeeByPartyB({from: payee, value: arbitrationFee})

    await klerosPOC.passPeriod({from: other}) // Pass twice to go to vote.
    await klerosPOC.passPeriod({from: other})

    let drawA = []
    let drawB = []
    for (let i = 1; i <= 3; i++) {
      if (await klerosPOC.isDrawn(0, jurorA, i)) { drawA.push(i) } else { drawB.push(i) }
    }

    // Attacker needs some PNK
    await klerosPOC.buyPinakion({from: attacker, value: 2e18})
    await klerosPOC.withdraw(2e18, {from: attacker})

    // initialize the attack contract opposite to how the judges would vote
    let desiredOutcome;
    if (drawA.length > drawB.length) {
      desiredOutcome = 2 // Winner wil be 1
    } else {
      desiredOutcome = 1 // Winner will be 2
    }

    let epsilon = 1e9
    let pEpsilon = await PEpsilon.new(pinakion.address, klerosPOC.address, 0, desiredOutcome, epsilon, {from: attacker})

    // Attacker deposits the bribe
    await pinakion.approveAndCall(pEpsilon.address, 2e18, '', {from: attacker})

    await klerosPOC.voteRuling(0, 1, drawA, {from: jurorA})
    await klerosPOC.voteRuling(0, 2, drawB, {from: jurorB})

    await klerosPOC.passPeriod({from: other}) // Pass twice to go to execution.
    await klerosPOC.passPeriod({from: other})
    await klerosPOC.oneShotTokenRepartition(0, {from: other})

    // Attacker settles the bribe
    await pEpsilon.settle({from: attacker})

    let stakePerWeight = (await klerosPOC.getStakePerDraw()).toNumber();

    assert.ok(await pEpsilon.settled(), 'the bribe has to be settled')
    //assert.equal((await pEpsilon.remainingWithdraw()).toNumber(), 2 * drawB.length * stakePerWeight + epsilon, 'the bribe remaining withdraw amount is not correct')

    assert.equal((await klerosPOC.jurors(jurorA))[1].toNumber(), 0, 'The amount of token at stake for juror A is incorrect.')
    assert.equal((await klerosPOC.jurors(jurorB))[1].toNumber(), 0, 'The amount of token at stake for juror B is incorrect.')
    if (drawA.length > drawB.length) {
      assert.equal((await klerosPOC.jurors(jurorA))[0].toNumber(), 0.4e18 + drawB.length * stakePerWeight, 'The balance of juror A has not been updated correctly.')
      assert.equal((await klerosPOC.jurors(jurorB))[0].toNumber(), 0.6e18 - drawB.length * stakePerWeight, 'The balance of juror B has not been updated correctly.')

      assert.equal((await klerosPOC.getWinningChoice(0, 0)).toNumber(), 1)
      assert.equal((await pEpsilon.withdraw(jurorB)).toNumber(), (stakePerWeight / drawA.length) + (drawB.length * stakePerWeight + epsilon), 'The bribe balance of juror B has not been updated correctly')
    } else {
      assert.equal((await klerosPOC.jurors(jurorA))[0].toNumber(), 0.4e18 - drawA.length * stakePerWeight, 'The balance of juror A has not been updated correctly.')
      assert.equal((await klerosPOC.jurors(jurorB))[0].toNumber(), 0.6e18 + drawA.length * stakePerWeight, 'The balance of juror B has not been updated correctly.')

      assert.equal((await klerosPOC.getWinningChoice(0, 0)).toNumber(), 2)
      assert.equal((await pEpsilon.withdraw(jurorA)).toNumber(), (stakePerWeight / drawB.length) + (drawA.length * stakePerWeight + epsilon), 'The bribe balance of juror A has not been updated correctly')
    }
  })

})
