export const CONTRACT_ADDRESS = "0xcc3ecd133d27e2c9f0d6ae1701d8f70364efdc34";
export const BASE_CHAIN_ID = 8453;
export const BASE_RPC = "https://mainnet.base.org";

export const STATE_LABELS = ["INIT", "FUNDED", "LOCKED", "EXECUTION_PENDING", "EXECUTED", "REFUNDED"];

export const ABI = [
  "function deposit() payable",
  "function lock()",
  "function execute()",
  "function refund()",
  "function initiateExecution(bytes32)",
  "function initiateQuarantine() payable",
  "function currentState() view returns(uint8)",
  "function quarantineEndTime() view returns(uint256)",
  "function lockTimestamp() view returns(uint256)",
  "function lockDuration() view returns(uint256)",
  "function refundDelay() view returns(uint256)",
  "function counterparty() view returns(address)",
  "function guardian() view returns(address)",
  "event Deposited(address indexed sender, uint256 amount)",
  "event StateChanged(uint8 indexed from, uint8 indexed to)",
  "event Quarantined(address indexed initiator, uint256 endTime)",
  "event Refunded(address indexed recipient, uint256 amount)",
];
