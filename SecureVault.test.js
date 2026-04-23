const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("SecureVault (patched)", function () {
  let vault;
  let owner, guardian, counterparty, other;
  let secret, commitmentHash, lockDuration;

  const STAKE = ethers.parseEther("0.01");

  beforeEach(async function () {
    [owner, guardian, counterparty, other] = await ethers.getSigners();

    secret         = ethers.encodeBytes32String("test-secret");
    commitmentHash = ethers.keccak256(ethers.solidityPacked(["bytes32"], [secret]));
    lockDuration   = 3600;

    const SecureVault = await ethers.getContractFactory("SecureVault");
    vault = await upgrades.deployProxy(
      SecureVault,
      [owner.address, guardian.address, counterparty.address, commitmentHash, lockDuration],
      { kind: "uups" }
    );
  });

  // ── Initial state ──────────────────────────────────────────────────────

  it("1. correct initial state", async function () {
    expect(await vault.currentState()).to.equal(0);
  });

  it("2. roles set correctly", async function () {
    expect(await vault.owner()).to.equal(owner.address);
    const GR = ethers.keccak256(ethers.toUtf8Bytes("GUARDIAN_ROLE"));
    expect(await vault.hasRole(GR, guardian.address)).to.be.true;
  });

  it("3. double-init blocked", async function () {
    await expect(
      vault.initialize(owner.address, guardian.address, counterparty.address, commitmentHash, lockDuration)
    ).to.be.revertedWithCustomError(vault, "InvalidInitialization");
  });

  // ── Deposit & lock ────────────────────────────────────────────────────

  it("4. deposit → FUNDED", async function () {
    await vault.deposit({ value: ethers.parseEther("1.0") });
    expect(await vault.currentState()).to.equal(1);
  });

  it("5. lock → LOCKED", async function () {
    await vault.deposit({ value: ethers.parseEther("1.0") });
    await vault.lock();
    expect(await vault.currentState()).to.equal(2);
  });

  it("6. non-owner cannot lock", async function () {
    await vault.deposit({ value: ethers.parseEther("1.0") });
    await expect(vault.connect(other).lock())
      .to.be.revertedWithCustomError(vault, "OwnableUnauthorizedAccount");
  });

  // ── Execution ─────────────────────────────────────────────────────────

  beforeEach(async function () {
    // shared setup skipped — done per describe block
  });

  describe("Execution", function () {
    beforeEach(async function () {
      await vault.deposit({ value: ethers.parseEther("1.0") });
      await vault.lock();
    });

    it("7. initiateExecution with correct secret → EXECUTION_PENDING", async function () {
      await time.increase(lockDuration);
      await vault.connect(counterparty).initiateExecution(secret);
      expect(await vault.currentState()).to.equal(3);
    });

    it("8. FIX: only counterparty/owner can call initiateExecution", async function () {
      await time.increase(lockDuration);
      await expect(vault.connect(other).initiateExecution(secret))
        .to.be.revertedWith("Unauthorized");
    });

    it("9. wrong secret reverts", async function () {
      await time.increase(lockDuration);
      await expect(vault.initiateExecution(ethers.encodeBytes32String("wrong")))
        .to.be.revertedWith("Invalid secret");
    });

    it("10. execute transfers funds to counterparty", async function () {
      await time.increase(lockDuration);
      await vault.connect(counterparty).initiateExecution(secret);
      const before = await ethers.provider.getBalance(counterparty.address);
      const tx = await vault.connect(counterparty).execute();
      const receipt = await tx.wait();
      const gas = receipt.gasUsed * receipt.gasPrice;
      const after = await ethers.provider.getBalance(counterparty.address);
      expect(after + gas - before).to.equal(ethers.parseEther("1.0"));
      expect(await vault.currentState()).to.equal(4);
    });
  });

  // ── Refund ────────────────────────────────────────────────────────────

  describe("Refund", function () {
    it("11. refund from FUNDED (no delay needed)", async function () {
      await vault.deposit({ value: ethers.parseEther("1.0") });
      const before = await ethers.provider.getBalance(owner.address);
      const tx = await vault.refund();
      const receipt = await tx.wait();
      const gas = receipt.gasUsed * receipt.gasPrice;
      const after = await ethers.provider.getBalance(owner.address);
      expect(after + gas - before).to.be.closeTo(
        ethers.parseEther("1.0"), ethers.parseEther("0.001")
      );
      expect(await vault.currentState()).to.equal(5);
    });

    it("12. FIX: StateChanged event has correct prevState from LOCKED", async function () {
      await vault.deposit({ value: ethers.parseEther("1.0") });
      await vault.lock();
      await time.increase(lockDuration + 24 * 3600 + 1);
      await expect(vault.refund())
        .to.emit(vault, "StateChanged")
        .withArgs(2 /* LOCKED */, 5 /* REFUNDED */);
    });

    it("13. unauthorized refund reverts", async function () {
      await vault.deposit({ value: ethers.parseEther("1.0") });
      await expect(vault.connect(other).refund()).to.be.revertedWith("Only owner");
    });
  });

  // ── Quarantine ────────────────────────────────────────────────────────

  describe("Quarantine", function () {
    it("14. quarantine activates with correct stake", async function () {
      await expect(vault.connect(other).initiateQuarantine({ value: STAKE }))
        .to.emit(vault, "Quarantined");
      expect(await vault.quarantineInitiator()).to.equal(other.address);
    });

    it("15. wrong stake reverts", async function () {
      await expect(vault.connect(other).initiateQuarantine({ value: ethers.parseEther("0.001") }))
        .to.be.revertedWith("Must stake 0.01 ETH");
    });

    it("16. FIX: quarantine blocks deposit", async function () {
      await vault.connect(other).initiateQuarantine({ value: STAKE });
      await expect(vault.deposit({ value: ethers.parseEther("1.0") }))
        .to.be.revertedWith("Contract is quarantined");
    });

    it("17. FIX: quarantine blocks execute", async function () {
      await vault.deposit({ value: ethers.parseEther("1.0") });
      await vault.lock();
      await time.increase(lockDuration);
      await vault.connect(counterparty).initiateExecution(secret);
      await vault.connect(other).initiateQuarantine({ value: STAKE });
      await expect(vault.connect(counterparty).execute())
        .to.be.revertedWith("Contract is quarantined");
    });

    it("18. fallback quarantine via receive()", async function () {
      await other.sendTransaction({ to: await vault.getAddress(), value: STAKE });
      expect(await vault.quarantineInitiator()).to.equal(other.address);
    });

    it("19. FIX: receive() reverts on unexpected ETH amounts", async function () {
      await expect(
        other.sendTransaction({ to: await vault.getAddress(), value: ethers.parseEther("0.5") })
      ).to.be.revertedWith("Use deposit()");
    });
  });

  // ── Invariant ─────────────────────────────────────────────────────────

  it("20. fund integrity after execute", async function () {
    await vault.deposit({ value: ethers.parseEther("1.0") });
    await vault.lock();
    await time.increase(lockDuration);
    await vault.connect(counterparty).initiateExecution(secret);
    await vault.connect(counterparty).execute();
    await vault.assertFundIntegrity();
    expect(await ethers.provider.getBalance(await vault.getAddress())).to.equal(0);
  });
});
