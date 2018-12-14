/* eslint-disable no-undef */ // Avoid the linter considering truffle elements as undef.

const Pinakion = artifacts.require('MiniMeTokenERC20')
const ConstantNG = artifacts.require('ConstantNG')
const Kleros = artifacts.require('Kleros')
const Briber = artifacts.require('Briber')
const tryCatch = require('./exception.js').tryCatch
const errTypes = require('./exception.js').errTypes

contract('Briber', function(accounts) {
  const governor = accounts[0]
  const juror1 = accounts[1]
  const juror2 = accounts[2]
  const juror3 = accounts[3]
  const attacker = accounts[4]
  const other = accounts[5]
  
  it('Should set correct values', async () => {
    let pinakion = await Pinakion.new(0x0, 0x0, 0, 'Pinakion', 18, 'PNK', true)
    let RNG = await ConstantNG.new(10)
    let kleros = await Kleros.new(
      pinakion.address,
      RNG.address,
      [0, 0, 0, 0, 0],
      governor
    )
    let briber = await Briber.new(kleros.address, 98, 200e18, 117, {
      from: attacker
    })

    assert.equal(
      await briber.kleros(),
      kleros.address,
      'Incorrect Kleros address'
    )
    assert.equal(await briber.disputeID(), 98, 'Incorrect dispute ID')
    assert.equal(await briber.bribe(), 200e18, 'Incorrect bribe value')
    assert.equal(await briber.target(), 117, 'Incorrect target')
    assert.equal(await briber.owner(), attacker, 'Incorrect owner address')
  })

  it("Shouldn't be able to bribe in an unsolved dispute", async () => {
    let pinakion = await Pinakion.new(0x0, 0x0, 0, 'Pinakion', 18, 'PNK', true)
    let RNG = await ConstantNG.new(100)
    let kleros = await Kleros.new(
      pinakion.address,
      RNG.address,
      [0, 0, 0, 0, 0],
      governor
    )
    
    await pinakion.generateTokens(governor, -1)
    await pinakion.transfer(juror1, 10e18)
    await pinakion.transfer(juror2, 10e18)
    await pinakion.approveAndCall(kleros.address, 10e18, 0x0, { from: juror1 })
    await pinakion.approveAndCall(kleros.address, 10e18, 0x0, { from: juror2 })
    await kleros.createDispute(5, 0x88, {
      value: await kleros.arbitrationCost(0x88)
    })

    // activation period
    await kleros.activateTokens(10e18, { from: juror1 })
    await kleros.activateTokens(10e18, { from: juror2 })
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

    let briber = await Briber.new(kleros.address, 0, 5e18, 1, {
      from: attacker
    })
    await kleros.voteRuling(0, 1, draw1, { from: juror1 })
    await kleros.voteRuling(0, 3, draw2, { from: juror2 })
    await kleros.passPeriod()
    // appeal
    await tryCatch(briber.settle({ from: attacker }), errTypes.revert)
  })

  it('Should pay correct amount in case of a dispute with no appeals', async () => {
    let pinakion = await Pinakion.new(0x0, 0x0, 0, 'Pinakion', 18, 'PNK', true)
    let RNG = await ConstantNG.new(1000)
    let kleros = await Kleros.new(
      pinakion.address,
      RNG.address,
      [0, 0, 0, 0, 0],
      governor
    )

    await pinakion.generateTokens(governor, -1)
    await pinakion.transfer(juror1, 6e18)
    await pinakion.transfer(juror2, 6e18)
    await pinakion.approveAndCall(kleros.address, 6e18, 0x0, { from: juror1 })
    await pinakion.approveAndCall(kleros.address, 6e18, 0x0, { from: juror2 })
    await kleros.createDispute(15, 0x11, {
      value: await kleros.arbitrationCost(0x11)
    })

    // activation period
    await kleros.activateTokens(2e18, { from: juror1 })
    await kleros.activateTokens(2e18, { from: juror2 })
    await kleros.passPeriod()
    // // drawing
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

    let briber = await Briber.new(kleros.address, 0, 1e18, 7, {
      from: attacker
    })
    await kleros.voteRuling(0, 7, draw1, { from: juror1 })
    await kleros.voteRuling(0, 11, draw2, { from: juror2 })
    await kleros.passPeriod()
    // appeal
    await kleros.passPeriod()
    // execution
    // sending to the contract some eth so it'll be able to pay the bribe
    await briber.send(5e18, { from: other })
    let contractBalance = await web3.eth.getBalance(briber.address)
    assert.equal(
      contractBalance.toNumber(),
      5e18,
      'Incorrect balance of Briber contract'
    )

    let balanceBeforeBribe1 = await web3.eth.getBalance(juror1)
    let balanceBeforeBribe2 = await web3.eth.getBalance(juror2)
    await briber.settle({ from: attacker })

    let balanceAfterBribe1 = await web3.eth.getBalance(juror1)
    let balanceAfterBribe2 = await web3.eth.getBalance(juror2)
    assert.equal(
      balanceAfterBribe1.toNumber(),
      balanceBeforeBribe1.toNumber() + 1e18 * draw1.length,
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
    let RNG = await ConstantNG.new(10000)
    let kleros = await Kleros.new(
      pinakion.address,
      RNG.address,
      [0,0,0,0,0],
      governor
    )

    await pinakion.generateTokens(governor, -1)
    await pinakion.transfer(juror1, 50e18)
    await pinakion.transfer(juror2, 50e18)
    await pinakion.transfer(juror3, 50e18)
    await pinakion.approveAndCall(kleros.address, 50e18, 0x0, { from: juror1 })
    await pinakion.approveAndCall(kleros.address, 50e18, 0x0, { from: juror2 })
    await pinakion.approveAndCall(kleros.address, 50e18, 0x0, { from: juror3 })
    await kleros.createDispute(100, 0x43, {
      value: await kleros.arbitrationCost(0x43)
    })

    // activation period
    await kleros.activateTokens(25e18, { from: juror1 })
    await kleros.activateTokens(25e18, { from: juror2 })
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

    await kleros.voteRuling(0, 73, draw1, { from: juror1 })
    await kleros.voteRuling(0, 1, draw2, { from: juror2 })
    await kleros.passPeriod()
    // appeal
    await kleros.appeal(0, 0x43, {
      value: await kleros.appealCost(0, 0x43)
    })

    await kleros.passPeriod()
    // execution
    await kleros.passPeriod()
    // 2nd session of voting because of appeal
    // activation period
    await kleros.activateTokens(25e18, { from: juror1 })
    await kleros.activateTokens(25e18, { from: juror3 })
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

    let briber = await Briber.new(kleros.address, 0, 1e18, 73, {
      from: attacker
    })
    await kleros.voteRuling(0, 73, draw1Appeal, { from: juror1 })
    await kleros.voteRuling(0, 73, draw3Appeal, { from: juror3 })
    await kleros.passPeriod()
    // appeal
    await kleros.passPeriod()
    // execution
    // sending to the contract some eth so it'll be able to pay the bribe
    await briber.send(6e18, { from: other })
    let contractBalance = await web3.eth.getBalance(briber.address)
    assert.equal(
      contractBalance.toNumber(),
      6e18,
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
        1e18 * (draw1.length + draw1Appeal.length),
      'Incorrect balance of the first juror'
    )
    assert.equal(
      balanceAfterBribe2.toNumber(),
      balanceBeforeBribe2.toNumber(),
      'Incorrect balance of the second juror'
    )
    assert.equal(
      balanceAfterBribe3.toNumber(),
      balanceBeforeBribe3.toNumber() + 1e18 * draw3Appeal.length,
      'Incorrect balance of the third juror'
    )
  })
})
