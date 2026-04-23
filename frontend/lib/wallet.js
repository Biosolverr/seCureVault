import { CoinbaseWalletSDK } from "@coinbase/wallet-sdk";
import { ethers } from "ethers";

const BASE_CHAIN_ID = 8453;
const BASE_RPC = "https://mainnet.base.org";

async function ensureBase(provider) {
  const net = await provider.getNetwork();
  if (net.chainId !== BigInt(BASE_CHAIN_ID)) {
    await provider.send("wallet_switchEthereumChain", [
      { chainId: "0x" + BASE_CHAIN_ID.toString(16) }
    ]);
  }
}

export async function connectCoinbase() {
  const sdk = new CoinbaseWalletSDK({ appName: "SecureVault" });
  const ethereum = sdk.makeWeb3Provider(BASE_RPC, BASE_CHAIN_ID);
  const provider = new ethers.BrowserProvider(ethereum);
  await provider.send("eth_requestAccounts", []);
  await ensureBase(provider);
  const signer = await provider.getSigner();
  return { provider, signer, walletType: "Coinbase" };
}

export async function connectInjected() {
  if (!window.ethereum) throw new Error("MetaMask не найден");
  const provider = new ethers.BrowserProvider(window.ethereum);
  await provider.send("eth_requestAccounts", []);
  await ensureBase(provider);
  const signer = await provider.getSigner();
  return { provider, signer, walletType: "MetaMask" };
}
