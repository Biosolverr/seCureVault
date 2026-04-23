const { ethers, upgrades } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying with account:", deployer.address);

  // ── Настрой перед деплоем ──────────────────────────────────────────────
  const GUARDIAN     = process.env.GUARDIAN_ADDRESS     || deployer.address;
  const COUNTERPARTY = process.env.COUNTERPARTY_ADDRESS || deployer.address;
  const SECRET_WORD  = process.env.SECRET_WORD          || "change-me-before-mainnet";
  const LOCK_HOURS   = Number(process.env.LOCK_HOURS    || 24);
  // ──────────────────────────────────────────────────────────────────────

  const secret = ethers.encodeBytes32String(SECRET_WORD);
  const commitmentHash = ethers.keccak256(
    ethers.solidityPacked(["bytes32"], [secret])
  );
  const lockDuration = LOCK_HOURS * 60 * 60;

  const SecureVault = await ethers.getContractFactory("SecureVault");

  console.log("Deploying SecureVault UUPS proxy...");
  const vault = await upgrades.deployProxy(
    SecureVault,
    [deployer.address, GUARDIAN, COUNTERPARTY, commitmentHash, lockDuration],
    { initializer: "initialize", kind: "uups" }
  );
  await vault.waitForDeployment();
  const addr = await vault.getAddress();

  console.log("✅ SecureVault proxy:", addr);
  console.log("   Owner:          ", deployer.address);
  console.log("   Guardian:       ", GUARDIAN);
  console.log("   Counterparty:   ", COUNTERPARTY);
  console.log("   CommitmentHash: ", commitmentHash);
  console.log("   LockDuration:   ", lockDuration, "sec");
}

main()
  .then(() => process.exit(0))
  .catch((e) => { console.error(e); process.exit(1); });
