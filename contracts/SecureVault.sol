// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/cryptography/EIP712Upgradeable.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";

// ============ ROLES REGISTRY ============

contract RolesRegistry {
    bytes32 public constant GUARDIAN_ROLE    = keccak256("GUARDIAN_ROLE");
    bytes32 public constant COUNTERPARTY_ROLE = keccak256("COUNTERPARTY_ROLE");

    mapping(bytes32 => mapping(address => bool)) private _roles;

    event RoleGranted(bytes32 indexed role, address indexed account);
    event RoleRevoked(bytes32 indexed role, address indexed account);

    function _grantRole(bytes32 role, address account) internal {
        _roles[role][account] = true;
        emit RoleGranted(role, account);
    }

    function hasRole(bytes32 role, address account) public view returns (bool) {
        return _roles[role][account];
    }
}

// ============ UPGRADE TIMELOCK ============

abstract contract UpgradeTimelock {
    uint256 public constant UPGRADE_DELAY = 48 hours;
    uint256 public upgradeTimelock;
    address public pendingImplementation;

    event UpgradeScheduled(address indexed implementation, uint256 releaseTime);

    function _initiateUpgrade(address newImplementation) internal {
        upgradeTimelock = block.timestamp + UPGRADE_DELAY;
        pendingImplementation = newImplementation;
        emit UpgradeScheduled(newImplementation, upgradeTimelock);
    }

    function _checkUpgradeTimelock(address newImplementation) internal view {
        require(newImplementation == pendingImplementation, "Untrusted implementation");
        require(block.timestamp >= upgradeTimelock, "Upgrade timelock not expired");
    }
}

// ============ REENTRANCY GUARD ============

abstract contract SecureVaultBase {
    uint256 private _status;

    function __SecureVaultBase_init() internal {
        _status = 1;
    }

    modifier nonReentrant() {
        require(_status != 2, "ReentrancyGuard: reentrant call");
        _status = 2;
        _;
        _status = 1;
    }
}

// ============ SECURE VAULT ============

contract SecureVault is
    UUPSUpgradeable,
    OwnableUpgradeable,
    SecureVaultBase,
    EIP712Upgradeable,
    RolesRegistry,
    UpgradeTimelock,
    IERC721Receiver
{
    using SafeERC20 for IERC20;
    using ECDSA for bytes32;

    enum State { INIT, FUNDED, LOCKED, EXECUTION_PENDING, EXECUTED, REFUNDED }

    State public currentState;
    address public counterparty;
    address public guardian;
    bytes32 public commitmentHash;
    uint256 public lockDuration;
    uint256 public lockTimestamp;
    uint256 public refundDelay;

    uint256 public constant QUARANTINE_STAKE = 0.01 ether;
    uint256 public quarantineEndTime;
    address public quarantineInitiator;

    uint256 public nonce;

    // FIX 1: EIP-712 typehash includes address(this) via domain separator — replay-safe
    bytes32 public constant RECOVERY_TYPEHASH =
        keccak256("Recovery(address newOwner,uint256 nonce,uint256 deadline)");

    event Deposited(address indexed sender, uint256 amount);
    event StateChanged(State indexed from, State indexed to);
    event SecretRevealed(bytes32 secret);
    event Quarantined(address indexed initiator, uint256 endTime);
    event Refunded(address indexed recipient, uint256 amount);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        address _owner,
        address _guardian,
        address _counterparty,
        bytes32 _commitmentHash,
        uint256 _lockDuration
    ) public initializer {
        __Ownable_init(_owner);
        __EIP712_init("SecureVault", "1");
        __SecureVaultBase_init();

        guardian     = _guardian;
        counterparty = _counterparty;
        commitmentHash = _commitmentHash;
        lockDuration = _lockDuration;
        refundDelay  = 24 hours;
        currentState = State.INIT;

        _grantRole(GUARDIAN_ROLE,     _guardian);
        _grantRole(COUNTERPARTY_ROLE, _counterparty);
    }

    // -------- Modifiers --------

    modifier inState(State _state) {
        require(currentState == _state, "Invalid state for operation");
        _;
    }

    modifier noFlashLoan() {
        require(tx.origin == msg.sender, "Flash loan detected");
        _;
    }

    // FIX 2: карантин блокирует критические операции
    modifier notQuarantined() {
        require(block.timestamp > quarantineEndTime, "Contract is quarantined");
        _;
    }

    // -------- State transitions --------

    function deposit() external payable inState(State.INIT) notQuarantined {
        require(msg.value > 0, "Amount must be > 0");
        _transition(State.INIT, State.FUNDED);
        emit Deposited(msg.sender, msg.value);
    }

    function lock() external onlyOwner inState(State.FUNDED) notQuarantined {
        lockTimestamp = block.timestamp;
        _transition(State.FUNDED, State.LOCKED);
    }

    function initiateExecution(bytes32 secret)
        external
        inState(State.LOCKED)
        notQuarantined
    {
        // FIX 3: только counterparty или owner могут раскрыть секрет
        require(
            msg.sender == counterparty || msg.sender == owner(),
            "Unauthorized"
        );
        require(
            keccak256(abi.encodePacked(secret)) == commitmentHash,
            "Invalid secret"
        );
        require(
            block.timestamp >= lockTimestamp + lockDuration,
            "Lock period not over"
        );
        emit SecretRevealed(secret);
        _transition(State.LOCKED, State.EXECUTION_PENDING);
    }

    function execute()
        external
        nonReentrant
        inState(State.EXECUTION_PENDING)
        notQuarantined
    {
        require(
            msg.sender == counterparty || msg.sender == owner(),
            "Unauthorized"
        );
        _transition(State.EXECUTION_PENDING, State.EXECUTED);
        uint256 balance = address(this).balance;
        (bool success, ) = counterparty.call{value: balance}("");
        require(success, "Transfer failed");
        assertFundIntegrity();
    }

    function refund() external nonReentrant notQuarantined {
        require(msg.sender == owner(), "Only owner");
        require(
            currentState == State.FUNDED ||
            (currentState == State.LOCKED &&
                block.timestamp >= lockTimestamp + lockDuration + refundDelay),
            "Refund not available yet"
        );
        State prev = currentState;
        uint256 balance = address(this).balance;
        // FIX 4: prevState сохраняется до перехода — событие корректно
        currentState = State.REFUNDED;
        (bool success, ) = owner().call{value: balance}("");
        require(success, "Transfer failed");
        emit StateChanged(prev, State.REFUNDED);
        emit Refunded(msg.sender, balance);
        assertFundIntegrity();
    }

    // -------- Quarantine --------

    function initiateQuarantine() external payable {
        require(msg.value == QUARANTINE_STAKE, "Must stake 0.01 ETH");
        require(quarantineEndTime < block.timestamp, "Already quarantined");
        quarantineInitiator = msg.sender;
        quarantineEndTime   = block.timestamp + 12 hours;
        emit Quarantined(msg.sender, quarantineEndTime);
    }

    // -------- Token deposits --------

    function depositTokens(address token, uint256 amount) external nonReentrant {
        uint256 balanceBefore = IERC20(token).balanceOf(address(this));
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        uint256 balanceAfter = IERC20(token).balanceOf(address(this));
        require(balanceAfter - balanceBefore > 0, "No tokens received");
    }

    // -------- Account recovery (EIP-712, replay-safe) --------

    function recoverAccount(
        address newOwner,
        uint256 deadline,
        bytes calldata ownerSignature,
        bytes calldata guardianSignature
    ) external {
        require(block.timestamp <= deadline, "Expired deadline");

        bytes32 structHash = keccak256(
            abi.encode(RECOVERY_TYPEHASH, newOwner, nonce, deadline)
        );
        // _hashTypedDataV4 включает chainId и address(this) — защита от replay
        bytes32 hash = _hashTypedDataV4(structHash);

        address signer1 = hash.recover(ownerSignature);
        address signer2 = hash.recover(guardianSignature);

        require(signer1 == owner(),   "Invalid owner signature");
        require(signer2 == guardian,  "Invalid guardian signature");

        nonce++;
        _transferOwnership(newOwner);
    }

    // -------- Invariant --------

    function assertFundIntegrity() public view {
        if (currentState == State.EXECUTED || currentState == State.REFUNDED) {
            assert(address(this).balance == 0);
        }
    }

    // -------- Upgrade --------

    function scheduleUpgrade(address newImplementation) external onlyOwner {
        _initiateUpgrade(newImplementation);
    }

    function _authorizeUpgrade(address newImplementation)
        internal
        override
        onlyOwner
    {
        _checkUpgradeTimelock(newImplementation);
    }

    // -------- ERC721 receiver --------

    function onERC721Received(address, address, uint256, bytes calldata)
        external pure override returns (bytes4)
    {
        return IERC721Receiver.onERC721Received.selector;
    }

    // -------- Receive ETH --------

    // FIX 5: receive() реверт на неожиданные суммы — деньги не застревают
    receive() external payable {
        if (msg.value == QUARANTINE_STAKE && quarantineEndTime < block.timestamp) {
            quarantineInitiator = msg.sender;
            quarantineEndTime   = block.timestamp + 12 hours;
            emit Quarantined(msg.sender, quarantineEndTime);
        } else {
            revert("Use deposit()");
        }
    }

    // -------- Internal helpers --------

    function _transition(State from, State to) internal {
        currentState = to;
        emit StateChanged(from, to);
    }
}
