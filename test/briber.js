/* eslint-disable no-undef */ // Avoid the linter considering truffle elements as undef.

const Pinakion = artifacts.require('MiniMeTokenERC20')
const ConstantNG = artifacts.require('ConstantNG')
const Kleros = artifacts.require('Kleros')
const Briber = artifacts.require('Briber')
const tryCatch = require('./exception.js').tryCatch
const errTypes = require('./exception.js').errTypes

contract('Briber', function(accounts) {
  const timePeriod = 0
  const randomNumber = 10
  const governor = accounts[0]
  const juror1 = accounts[1]
  const juror2 = accounts[2]
  const juror3 = accounts[3]
  const attacker = accounts[4]
  const other = accounts[5]
  const timePeriods = [
    timePeriod,
    timePeriod,
    timePeriod,
    timePeriod,
    timePeriod
  ]
  const bribe = 0.2e18
  const target = 1
  const differentTarget = 2
  const choices = 2
  const extraData = 0x0

  it('Should set correct values', async () => {
    let pinakion = await Pinakion.new(0x0, 0x0, 0, 'Pinakion', 18, 'PNK', true)
    let RNG = await ConstantNG.new(randomNumber)
    let kleros = await Kleros.new(
      pinakion.address,
      RNG.address,
      timePeriods,
      governor
    )
    let briber = await Briber.new(kleros.address, 0, bribe, target, {
      from: attacker
    })

    assert.equal(
      await briber.kleros(),
      kleros.address,
      'Incorrect Kleros address'
    )
    assert.equal(await briber.disputeID(), 0, 'Incorrect dispute ID')
    assert.equal(await briber.bribe(), bribe, 'Incorrect bribe value')
    assert.equal(await briber.target(), target, 'Incorrect target')
    assert.equal(await briber.owner(), attacker, 'Incorrect owner address')
  })

  it("Shouldn't be able to bribe in an unsolved dispute", async () => {
    let pinakion = await Pinakion.new(0x0, 0x0, 0, 'Pinakion', 18, 'PNK', true)
    let RNG = await ConstantNG.new(randomNumber)
    let kleros = await Kleros.new(
      pinakion.address,
      RNG.address,
      timePeriods,
      governor
    )

    await pinakion.generateTokens(governor, -1)
    await pinakion.transfer(juror1, 1e18)
    await pinakion.transfer(juror2, 1e18)
    await pinakion.approveAndCall(kleros.address, 1e18, 0x0, { from: juror1 })
    await pinakion.approveAndCall(kleros.address, 1e18, 0x0, { from: juror2 })
    await kleros.createDispute(choices, extraData, {
      value: await kleros.arbitrationCost(extraData)
    })

    // activation period
    await kleros.activateTokens(1e18, { from: juror1 })
    await kleros.activateTokens(1e18, { from: juror2 })
    await kleros.passPeriod()
    // drawing
    await kleros.passPeriod()
    // voting

    let draw1 = []
    let draw2 = []
    for (let i = 1; i <= 3; i++) {
      if (await kleros.isDrawn(0, juror1, i)) {
        draw1.push(i)
      } else {
        draw2.push(i)
      }
    }

    let briber = await Briber.new(kleros.address, 0, bribe, target, {
      from: attacker
    })
    await kleros.voteRuling(0, target, draw1, { from: juror1 })
    await kleros.voteRuling(0, differentTarget, draw2, { from: juror2 })
    await kleros.passPeriod()
    // appeal
    await tryCatch(briber.settle({ from: attacker }), errTypes.revert)
  })

  it('Should pay correct amount in case of a dispute with no appeals', async () => {
    let pinakion = await Pinakion.new(0x0, 0x0, 0, 'Pinakion', 18, 'PNK', true)
    let RNG = await ConstantNG.new(randomNumber)
    let kleros = await Kleros.new(
      pinakion.address,
      RNG.address,
      timePeriods,
      governor
    )

    await pinakion.generateTokens(governor, -1)
    await pinakion.transfer(juror1, 1e18)
    await pinakion.transfer(juror2, 1e18)
    await pinakion.approveAndCall(kleros.address, 1e18, 0x0, { from: juror1 })
    await pinakion.approveAndCall(kleros.address, 1e18, 0x0, { from: juror2 })
    await kleros.createDispute(choices, extraData, {
      value: await kleros.arbitrationCost(extraData)
    })

    // activation period
    await kleros.activateTokens(1e18, { from: juror1 })
    await kleros.activateTokens(1e18, { from: juror2 })
    await kleros.passPeriod()
    // drawing
    await kleros.passPeriod()
    // voting
    let draw1 = []
    let draw2 = []
    for (let i = 1; i <= 3; i++) {
      if (await kleros.isDrawn(0, juror1, i)) {
        draw1.push(i)
      } else {
        draw2.push(i)
      }
    }

    let briber = await Briber.new(kleros.address, 0, bribe, target, {
      from: attacker
    })
    await kleros.voteRuling(0, target, draw1, { from: juror1 })
    await kleros.voteRuling(0, differentTarget, draw2, { from: juror2 })
    await kleros.passPeriod()
    // appeal
    await kleros.passPeriod()
    // execution
    // sending to the contract some eth so it'll be able to pay the bribe
    await briber.send(bribe * 10, { from: other })
    let contractBalance = await web3.eth.getBalance(briber.address)
    assert.equal(
      contractBalance.toNumber(),
      bribe * 10,
      'Incorrect balance of Briber contract'
    )

    let balanceBeforeBribe1 = await web3.eth.getBalance(juror1)
    let balanceBeforeBribe2 = await web3.eth.getBalance(juror2)
    await briber.settle({ from: attacker })

    let balanceAfterBribe1 = await web3.eth.getBalance(juror1)
    let balanceAfterBribe2 = await web3.eth.getBalance(juror2)
    assert.equal(
      balanceAfterBribe1.toNumber(),
      balanceBeforeBribe1.toNumber() + bribe * draw1.length,
      'Incorrect balance of the first juror'
    )
    assert.equal(
      balanceAfterBribe2.toNumber(),
      balanceBeforeBribe2.toNumber(),
      'Incorrect balance of the second juror'
    )
  })

  it('Should pay correct amount in case of an appealed dispute', async () => {
    let pinakion = await Pinakion.new(0x0, 0x0, 0, 'Pinakion', 18, 'PNK', true)
    let RNG = await ConstantNG.new(randomNumber)
    let kleros = await Kleros.new(
      pinakion.address,
      RNG.address,
      timePeriods,
      governor
    )

    await pinakion.generateTokens(governor, -1)
    await pinakion.transfer(juror1, 2e18)
    await pinakion.transfer(juror2, 2e18)
    await pinakion.transfer(juror3, 2e18)
    await pinakion.approveAndCall(kleros.address, 2e18, 0x0, { from: juror1 })
    await pinakion.approveAndCall(kleros.address, 2e18, 0x0, { from: juror2 })
    await pinakion.approveAndCall(kleros.address, 2e18, 0x0, { from: juror3 })
    await kleros.createDispute(choices, extraData, {
      value: await kleros.arbitrationCost(extraData)
    })

    // activation period
    await kleros.activateTokens(1e18, { from: juror1 })
    await kleros.activateTokens(1e18, { from: juror2 })
    await kleros.passPeriod()
    // drawing
    await kleros.passPeriod()
    // voting

    let draw1 = []
    let draw2 = []
    for (let i = 1; i <= 3; i++) {
      if (await kleros.isDrawn(0, juror1, i)) {
        draw1.push(i)
      } else {
        draw2.push(i)
      }
    }

    await kleros.voteRuling(0, target, draw1, { from: juror1 })
    await kleros.voteRuling(0, differentTarget, draw2, { from: juror2 })
    await kleros.passPeriod()
    // appeal
    await kleros.appeal(0, extraData, {
      value: await kleros.appealCost(0, extraData)
    })

    await kleros.passPeriod()
    // execution
    await kleros.passPeriod()
    // 2nd session of voting because of appeal
    // activation period
    await kleros.activateTokens(1e18, { from: juror1 })
    await kleros.activateTokens(1e18, { from: juror3 })
    await kleros.passPeriod()
    // drawing
    await kleros.passPeriod()
    // voting
    let draw1Appeal = []
    let draw3Appeal = []
    for (let i = 1; i <= 3; i++) {
      if (await kleros.isDrawn(0, juror1, i)) {
        draw1Appeal.push(i)
      } else {
        draw3Appeal.push(i)
      }
    }

    let briber = await Briber.new(kleros.address, 0, bribe, target, {
      from: attacker
    })
    await kleros.voteRuling(0, target, draw1Appeal, { from: juror1 })
    await kleros.voteRuling(0, target, draw3Appeal, { from: juror3 })
    await kleros.passPeriod()
    // appeal
    await kleros.passPeriod()
    // execution
    // sending to the contract some eth so it'll be able to pay the bribe
    await briber.send(bribe * 10, { from: other })
    let contractBalance = await web3.eth.getBalance(briber.address)
    assert.equal(
      contractBalance.toNumber(),
      bribe * 10,
      'Incorrect balance of Briber contract'
    )

    let balanceBeforeBribe1 = await web3.eth.getBalance(juror1)
    let balanceBeforeBribe2 = await web3.eth.getBalance(juror2)
    let balanceBeforeBribe3 = await web3.eth.getBalance(juror3)

    await briber.settle({ from: attacker })

    let balanceAfterBribe1 = await web3.eth.getBalance(juror1)
    let balanceAfterBribe2 = await web3.eth.getBalance(juror2)
    let balanceAfterBribe3 = await web3.eth.getBalance(juror3)
    assert.equal(
      balanceAfterBribe1.toNumber(),
      balanceBeforeBribe1.toNumber() +
        bribe * (draw1.length + draw1Appeal.length),
      'Incorrect balance of the first juror'
    )
    assert.equal(
      balanceAfterBribe2.toNumber(),
      balanceBeforeBribe2.toNumber(),
      'Incorrect balance of the second juror'
    )
    assert.equal(
      balanceAfterBribe3.toNumber(),
      balanceBeforeBribe3.toNumber() + bribe * draw3Appeal.length,
      'Incorrect balance of the third juror'
    )
  })
})
