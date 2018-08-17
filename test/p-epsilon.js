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

  let tryCatch = require("./exception.js").tryCatch
  let errTypes = require("./exception.js").errTypes

  it("should deposit deploy the contract correctly", async () => {
    let pinakion = await Pinakion.new(0x0, 0x0, 0, 'Pinakion', 18, 'PNK', true, {from: creator})
    let rng = await ConstantRandom.new(10, {from: creator})
    let klerosPOC = await KlerosPOC.new(pinakion.address, rng.address, [2, 4, 8, 2, 5], governor, {from: creator})
    let pEpsilon = await PEpsilon.new(pinakion.address, klerosPOC.address, 0, 0, 0, 5,{from: attacker})

    assert.equal(await pEpsilon.pinakion(), pinakion.address, "The pnk address is wrong")
    assert.equal(await pEpsilon.court(), klerosPOC.address, "The klerosPOC address is wrong")
    assert.equal(await pEpsilon.attacker(), attacker, "The attacker address is wrong")
    assert.equal(await pEpsilon.maxAppeals(), 5, "The appeals are not set correctly")
  })

  it("should deposit PNK to the bribe contract", async () => {
    let pinakion = await Pinakion.new(0x0, 0x0, 0, 'Pinakion', 18, 'PNK', true, {from: creator})
    let rng = await ConstantRandom.new(10, {from: creator})
    let klerosPOC = await KlerosPOC.new(pinakion.address, rng.address, [2, 4, 8, 2, 5], governor, {from: creator})
    await pinakion.changeController(klerosPOC.address, {from: creator})
    let pEpsilon = await PEpsilon.new(pinakion.address, klerosPOC.address, 0, 0, 0, 0,{from: attacker})

    await klerosPOC.buyPinakion({from: attacker, value: 1e18})
    await klerosPOC.withdraw(1e18, {from: attacker})
    await pinakion.approveAndCall(pEpsilon.address, 1e18, '', {from: attacker})

    assert.equal(await pEpsilon.balance(), 1e18, 'contract balance is wrong')
  })

  it("should not settle when case is not finished", async () => {
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

    // initialize the attack contract opposite to how the judges would vote
    let desiredOutcome;
    if (drawA.length > drawB.length) {
      desiredOutcome = 2 // Winner wil be 1
    } else {
      desiredOutcome = 1 // Winner will be 2
    }

    let epsilon = 1e9
    let pEpsilon = await PEpsilon.new(pinakion.address, klerosPOC.address, 0, desiredOutcome, epsilon, 5, {from: attacker})

    await klerosPOC.voteRuling(0, 1, drawA, {from: jurorA})
    await klerosPOC.voteRuling(0, 2, drawB, {from: jurorB})

    await klerosPOC.passPeriod({from: other}) // Pass once to go to appeal

    // Attacker settles the bribe
    await tryCatch(pEpsilon.settle({from: other}), errTypes.revert)
  })

  it("should reward bribed jurors corectly", async () => {
    for (let i=0; i < 5; i++){
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
      let pEpsilon = await PEpsilon.new(pinakion.address, klerosPOC.address, 0, desiredOutcome, epsilon, 5,{from: attacker})

      // Attacker deposits the bribe
      await pinakion.approveAndCall(pEpsilon.address, 2e18, '', {from: attacker})

      await klerosPOC.voteRuling(0, 1, drawA, {from: jurorA})
      await klerosPOC.voteRuling(0, 2, drawB, {from: jurorB})

      await klerosPOC.passPeriod({from: other}) // Pass twice to go to execution.
      await klerosPOC.passPeriod({from: other})
      await klerosPOC.oneShotTokenRepartition(0, {from: other})

      let stakePerWeight = (await klerosPOC.getStakePerDraw()).toNumber();

      // Attacker settles the bribe
      await pEpsilon.settle({from: other})
      assert.ok(await pEpsilon.settled(), 'the bribe has to be settled')

      assert.equal((await klerosPOC.jurors(jurorA))[1].toNumber(), 0, 'The amount of token at stake for juror A is incorrect.')
      assert.equal((await klerosPOC.jurors(jurorB))[1].toNumber(), 0, 'The amount of token at stake for juror B is incorrect.')
      if (drawA.length > drawB.length) {
        assert.equal((await klerosPOC.jurors(jurorA))[0].toNumber(), 0.4e18 + drawB.length * stakePerWeight, 'The balance of juror A has not been updated correctly.')
        assert.equal((await klerosPOC.jurors(jurorB))[0].toNumber(), 0.6e18 - drawB.length * stakePerWeight, 'The balance of juror B has not been updated correctly.')

        assert.equal((await pEpsilon.withdraw(jurorB)).toNumber(), drawB.length * (stakePerWeight + epsilon), 'The bribe balance of juror B has not been updated correctly')
      } else {
        assert.equal((await klerosPOC.jurors(jurorA))[0].toNumber(), 0.4e18 - drawA.length * stakePerWeight, 'The balance of juror A has not been updated correctly.')
        assert.equal((await klerosPOC.jurors(jurorB))[0].toNumber(), 0.6e18 + drawA.length * stakePerWeight, 'The balance of juror B has not been updated correctly.')

        assert.equal((await pEpsilon.withdraw(jurorA)).toNumber(), drawA.length * (stakePerWeight + epsilon), 'The bribe balance of juror A has not been updated correctly')
      }
    }
  })

  it("should reward bribed jurors correctly (when appeal)", async() => {
    for (let i=0;i<10;++i) {
      let pinakion = await Pinakion.new(0x0, 0x0, 0, 'Pinakion', 18, 'PNK', true, {from: creator})
      let rng = await ConstantRandom.new(10, {from: creator})
      let klerosPOC = await KlerosPOC.new(pinakion.address, rng.address, [0, 0, 0, 0, 0], governor, {from: creator})
      await pinakion.changeController(klerosPOC.address, {from: creator})
      await klerosPOC.buyPinakion({from: jurorA, value: 1.4e18})
      await klerosPOC.activateTokens(1.4e18, {from: jurorA})
      await klerosPOC.buyPinakion({from: jurorB, value: 1.6e18})
      await klerosPOC.activateTokens(1.6e18, {from: jurorB})
      await klerosPOC.buyPinakion({from: jurorC, value: 1.5e18})

      let arbitrableTransaction = await ArbitrableTransaction.new(klerosPOC.address, 0x0, 0, payee, 0x0, {from: payer, value: 0.1e18})
      let arbitrationFee = await klerosPOC.arbitrationCost(0x0, {from: payer})
      await arbitrableTransaction.payArbitrationFeeByPartyA({from: payer, value: arbitrationFee})
      await arbitrableTransaction.payArbitrationFeeByPartyB({from: payee, value: arbitrationFee})

      await klerosPOC.passPeriod({from: other}) // Pass twice to go to vote.
      await klerosPOC.passPeriod({from: other})

      let drawAInitial = []
      let drawBInitial = []
      for (let i = 1; i <= 3; i++) {
        if (await klerosPOC.isDrawn(0, jurorA, i)) { drawAInitial.push(i) } else { drawBInitial.push(i) }
      }

      await klerosPOC.voteRuling(0, 1, drawAInitial, {from: jurorA})
      await klerosPOC.voteRuling(0, 2, drawBInitial, {from: jurorB})

      await klerosPOC.passPeriod({from: other}) // Pass once to go to appeal.
      let appealFee = await klerosPOC.appealCost(0, 0x0)
      await arbitrableTransaction.appeal(0x0, {from: payee, value: appealFee})
      await klerosPOC.passPeriod({from: other}) // Pass twice to go to activation.
      await klerosPOC.passPeriod({from: other})

      await klerosPOC.activateTokens(1.4e18, {from: jurorA})
      await klerosPOC.activateTokens(1.5e18, {from: jurorC})

      await klerosPOC.passPeriod({from: other}) // Pass twice to go to vote.
      await klerosPOC.passPeriod({from: other})

      let drawAAppeal = []
      let drawCAppeal = []
      for (let i = 1; i <= 3; i++) {
        if (await klerosPOC.isDrawn(0, jurorA, i)) { drawAAppeal.push(i) } else { drawCAppeal.push(i) }
      }

      // Attacker needs some PNK
      await klerosPOC.buyPinakion({from: attacker, value: 2e18})
      await klerosPOC.withdraw(2e18, {from: attacker})

      // initialize the attack contract opposite to how the judges would vote
      let desiredOutcome;
      if (drawAAppeal.length > drawCAppeal.length) {
        desiredOutcome = 2 // Winner wil be 1
      } else {
        desiredOutcome = 1 // Winner will be 2
      }

      let epsilon = 1000000
      let pEpsilon = await PEpsilon.new(pinakion.address, klerosPOC.address, 0, desiredOutcome, epsilon, 5, {from: attacker})


      await klerosPOC.voteRuling(0, 1, drawAAppeal, {from: jurorA})
      await klerosPOC.voteRuling(0, 2, drawCAppeal, {from: jurorC})
      await klerosPOC.passPeriod({from: other}) // Pass twice to go to execution.
      await klerosPOC.passPeriod({from: other})
      await klerosPOC.oneShotTokenRepartition(0, {from: other})

      // Attacker settles the bribe
      await pEpsilon.settle({from: other})
      assert.ok(await pEpsilon.settled(), 'the bribe has to be settled')

      assert.equal((await klerosPOC.jurors(jurorA))[1].toNumber(), 0, 'The amount of token at stake for juror A is incorrect.')
      assert.equal((await klerosPOC.jurors(jurorB))[1].toNumber(), 0, 'The amount of token at stake for juror B is incorrect.')
      assert.equal((await klerosPOC.jurors(jurorC))[1].toNumber(), 0, 'The amount of token at stake for juror C is incorrect.')
      let stakePerWeight = (await klerosPOC.getStakePerDraw()).toNumber();
      if (drawAAppeal.length > drawCAppeal.length) { // Payer wins. So juror A is coherant.
        assert.equal((await klerosPOC.jurors(jurorA))[0].toNumber(), 1.4e18 + (drawCAppeal.length * (drawAAppeal.length > 0) + drawBInitial.length * (drawAInitial.length > 0)) * stakePerWeight, 'The balance of juror A has not been updated correctly (payer wins case).')
        assert.equal((await klerosPOC.jurors(jurorB))[0].toNumber(), 1.6e18 - drawBInitial.length * stakePerWeight, 'The balance of juror B has not been updated correctly (payer wins case).')
        assert.equal((await klerosPOC.jurors(jurorC))[0].toNumber(), 1.5e18 - drawCAppeal.length * stakePerWeight, 'The balance of juror C has not been updated correctly (payer wins case).')

        let reward
        if (drawAInitial.length == 1) {
          reward = stakePerWeight / drawBInitial.length
        } else {
          reward = 0
        }

        if (drawAInitial.length > 0){
          assert.equal((await pEpsilon.withdraw(jurorB)).toNumber(), drawBInitial.length * (stakePerWeight + epsilon) + reward * drawBInitial.length, 'The bribe balance of juror B (' + jurorB + ') is not correct; drawBInitLen: ' + drawBInitial.length + "; drawAInitLen: " + drawAInitial.length + " reward: " + reward)
        }
        if (drawCAppeal.length > 0){
          assert.equal((await pEpsilon.withdraw(jurorC)).toNumber(), drawCAppeal.length  * (stakePerWeight + epsilon), 'The bribe balance of juror C (' + jurorC + ') is not correct; drawAAppealLen: ' + drawAAppeal.length + '; drawCAppealLen: '+ drawCAppeal.length)
        }
      } else { // Payee wins. So juror B and C are coherant.
        assert.equal((await klerosPOC.jurors(jurorA))[0].toNumber(), 1.4e18 - (drawAAppeal.length + drawAInitial.length) * stakePerWeight, 'The balance of juror A has not been updated correctly (payee wins case).')
        assert.equal((await klerosPOC.jurors(jurorB))[0].toNumber(), 1.6e18 + (drawBInitial.length > 0) * drawAInitial.length * stakePerWeight, 'The balance of juror B has not been updated correctly (payee wins case).')
        assert.equal((await klerosPOC.jurors(jurorC))[0].toNumber(), 1.5e18 + (drawCAppeal.length > 0) * drawAAppeal.length * stakePerWeight, 'The balance of juror C has not been updated correctly (payee wins case).')

        if(drawAAppeal.length > 0 && drawAInitial.length > 0){
          assert.ok((await pEpsilon.withdraw(jurorA)).toNumber() >= (drawAAppeal.length + drawAInitial.length) * stakePerWeight + epsilon, 'The bribe balance of juror A is not correct')
        }
      }
    }
  })

  it("should allow for jurors to withraw balance", async () => {
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
    let pEpsilon = await PEpsilon.new(pinakion.address, klerosPOC.address, 0, desiredOutcome, epsilon, 5, {from: attacker})

    // Attacker deposits the bribe
    await pinakion.approveAndCall(pEpsilon.address, 2e18, '', {from: attacker})

    await klerosPOC.voteRuling(0, 1, drawA, {from: jurorA})
    await klerosPOC.voteRuling(0, 2, drawB, {from: jurorB})

    await klerosPOC.passPeriod({from: other}) // Pass twice to go to execution.
    await klerosPOC.passPeriod({from: other})
    await klerosPOC.oneShotTokenRepartition(0, {from: other})

    let stakePerWeight = (await klerosPOC.getStakePerDraw()).toNumber();

    // Attacker settles the bribe
    await pEpsilon.settle({from: other})
    assert.ok(await pEpsilon.settled(), 'the bribe has to be settled')

    let balB = (await pEpsilon.withdraw(jurorB)).toNumber()
    let balContract = (await pEpsilon.balance()).toNumber()
    await pEpsilon.withdrawJuror({from: jurorB})
    assert.equal((await pEpsilon.balance()).toNumber(), balContract - balB, 'The contract balance is not correct')
    assert.equal((await pinakion.balanceOf(jurorB)).toNumber(), balB, 'PNK balance of juror B is wrong')
    assert.equal((await pEpsilon.withdraw(jurorB)).toNumber(), 0, 'bribe contract has not updated juror B balance after withdraw')

    let balA = (await pEpsilon.withdraw(jurorA)).toNumber()
    await pEpsilon.withdrawJuror({from: jurorA})
    assert.equal((await pEpsilon.balance()).toNumber(), balContract - balB - balA, 'The contract balance is not correct')
    assert.equal((await pinakion.balanceOf(jurorA)).toNumber(), balA, 'PNK balance of juror A is wrong')
    assert.equal((await pEpsilon.withdraw(jurorA)).toNumber(), 0, 'bribe contract has not updated juror A balance after withdraw')
  })

  it("should allow anyone to help jurors to withraw balance", async () => {
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
    let pEpsilon = await PEpsilon.new(pinakion.address, klerosPOC.address, 0, desiredOutcome, epsilon, 5, {from: attacker})

    // Attacker deposits the bribe
    await pinakion.approveAndCall(pEpsilon.address, 2e18, '', {from: attacker})

    await klerosPOC.voteRuling(0, 1, drawA, {from: jurorA})
    await klerosPOC.voteRuling(0, 2, drawB, {from: jurorB})

    await klerosPOC.passPeriod({from: other}) // Pass twice to go to execution.
    await klerosPOC.passPeriod({from: other})
    await klerosPOC.oneShotTokenRepartition(0, {from: other})

    let stakePerWeight = (await klerosPOC.getStakePerDraw()).toNumber();

    // Attacker settles the bribe
    await pEpsilon.settle({from: other})
    assert.ok(await pEpsilon.settled(), 'the bribe has to be settled')

    let balB = (await pEpsilon.withdraw(jurorB)).toNumber()
    let balContract = (await pEpsilon.balance()).toNumber()
    await pEpsilon.withdrawSelect(jurorB, {from: other})
    assert.equal((await pEpsilon.balance()).toNumber(), balContract - balB, 'The contract balance is not correct')
    assert.equal((await pinakion.balanceOf(jurorB)).toNumber(), balB, 'PNK balance of juror B is wrong')
    assert.equal((await pEpsilon.withdraw(jurorB)).toNumber(), 0, 'bribe contract has not updated juror B balance after withdraw')

    let balA = (await pEpsilon.withdraw(jurorA)).toNumber()
    await pEpsilon.withdrawSelect(jurorA, {from: other})
    assert.equal((await pEpsilon.balance()).toNumber(), balContract - balB - balA, 'The contract balance is not correct')
    assert.equal((await pinakion.balanceOf(jurorA)).toNumber(), balA, 'PNK balance of juror A is wrong')
    assert.equal((await pEpsilon.withdraw(jurorA)).toNumber(), 0, 'bribe contract has not updated juror A balance after withdraw')
  })

  it("should allow attacker to withdraw PNK", async() =>{
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
    let pEpsilon = await PEpsilon.new(pinakion.address, klerosPOC.address, 0, desiredOutcome, epsilon, 5, {from: attacker})

    // Attacker deposits the bribe
    await pinakion.approveAndCall(pEpsilon.address, 2e18, '', {from: attacker})

    await klerosPOC.voteRuling(0, 1, drawA, {from: jurorA})
    await klerosPOC.voteRuling(0, 2, drawB, {from: jurorB})

    // can't withdraw before end of period
    await tryCatch(pEpsilon.withdrawAttacker({from: other}), errTypes.revert)

    await klerosPOC.passPeriod({from: other}) // Pass twice to go to execution.
    await klerosPOC.passPeriod({from: other})
    await klerosPOC.oneShotTokenRepartition(0, {from: other})

    let stakePerWeight = (await klerosPOC.getStakePerDraw()).toNumber();
    await pEpsilon.settle({from: other})
    let bal = (await pEpsilon.balance()).toNumber()
    let withdraws = (await pEpsilon.remainingWithdraw()).toNumber()

    await pEpsilon.withdrawAttacker({from: other})

    let attackerBal1 = (await pinakion.balanceOf(attacker)).toNumber()
    assert.equal(attackerBal1, bal - withdraws, 'attacker could not withdraw his PNK succesfully')

    // try to withdraw again
    await pEpsilon.withdrawAttacker({from: other})
    assert.equal((await pinakion.balanceOf(attacker)).toNumber(), attackerBal1, 'withdrew twice')
  })
})
