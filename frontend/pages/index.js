import { useState, useCallback } from "react";
import { ethers } from "ethers";
import { CONTRACT_ADDRESS, ABI, STATE_LABELS } from "../lib/contract";
import styles from "../styles/Home.module.css";

const STATE_COLORS = ["gray", "blue", "purple", "amber", "teal", "red"];

function HelpPanel() {
  const [open, setOpen] = useState(false);
  return (
    <div className={styles.helpWrap}>
      <button className={styles.helpBtn} onClick={() => setOpen(o => !o)} title="How it works">
        {open ? "✕" : "?"}
      </button>
      {open && (
        <div className={styles.helpBox}>
          <h3>How SecureVault works</h3>
          <p>Trustless escrow between two parties — no middleman needed.</p>

          <div className={styles.helpSteps}>
            <div className={styles.helpStep}><span>1</span>Owner deposits ETH → <b>FUNDED</b></div>
            <div className={styles.helpStep}><span>2</span>Owner locks the funds → <b>LOCKED</b></div>
            <div className={styles.helpStep}><span>3</span>Counterparty fulfills the deal off-chain</div>
            <div className={styles.helpStep}><span>4</span>Counterparty reveals secret → <b>EXECUTION_PENDING</b></div>
            <div className={styles.helpStep}><span>5</span>Funds sent to counterparty → <b>EXECUTED</b></div>
          </div>

          <p className={styles.helpNote}>Deal fell through? Owner can refund after the timer expires.</p>

          <h4>Protections</h4>
          <ul className={styles.helpList}>
            <li><b>Secret</b> — funds can't be released without the correct code</li>
            <li><b>Quarantine</b> — anyone can freeze the contract for 12h on suspicious activity</li>
            <li><b>Refund delay</b> — from LOCKED state only after lockDuration + 24h</li>
            <li><b>Upgrade timelock</b> — contract upgrades require 48h notice</li>
          </ul>

          <h4>Use cases</h4>
          <ul className={styles.helpList}>
            <li>OTC purchase of NFTs or tokens</li>
            <li>Freelance payment released on delivery</li>
            <li>Cross-chain atomic swap</li>
            <li>Any p2p deal requiring trustless guarantees</li>
          </ul>
        </div>
      )}
    </div>
  );
}

export default function Home() {
  const [provider, setProvider]   = useState(null);
  const [contract, setContract]   = useState(null);
  const [account, setAccount]     = useState("");
  const [walletType, setWalletType] = useState("");

  const [vaultState, setVaultState]       = useState(null);
  const [balance, setBalance]             = useState("0");
  const [quarantineEnd, setQuarantineEnd] = useState(0);
  const [lockTs, setLockTs]               = useState(0);
  const [lockDur, setLockDur]             = useState(0);
  const [refundDel, setRefundDel]         = useState(0);
  const [counterparty, setCounterparty]   = useState("");

  const [amount, setAmount]     = useState("0.01");
  const [secret, setSecret]     = useState("");
  const [txStatus, setTxStatus] = useState("");
  const [loading, setLoading]   = useState(false);

  const loadVaultData = useCallback(async (ctr, prov) => {
    try {
      const [s, q, lt, ld, rd, cp] = await Promise.all([
        ctr.currentState(),
        ctr.quarantineEndTime(),
        ctr.lockTimestamp(),
        ctr.lockDuration(),
        ctr.refundDelay(),
        ctr.counterparty(),
      ]);
      const bal = await prov.getBalance(CONTRACT_ADDRESS);
      setVaultState(Number(s));
      setQuarantineEnd(Number(q));
      setLockTs(Number(lt));
      setLockDur(Number(ld));
      setRefundDel(Number(rd));
      setCounterparty(cp);
      setBalance(ethers.formatEther(bal));
    } catch (e) {
      console.error(e);
    }
  }, []);

  async function afterConnect({ provider: prov, signer: sgn, walletType: wt }) {
    const ctr = new ethers.Contract(CONTRACT_ADDRESS, ABI, sgn);
    setProvider(prov);
    setContract(ctr);
    setWalletType(wt);
    setAccount(await sgn.getAddress());
    await loadVaultData(ctr, prov);
  }

  async function handleConnect(type) {
    setTxStatus("");
    try {
      const { connectCoinbase, connectInjected } = await import("../lib/wallet");
      const result = type === "coinbase" ? await connectCoinbase() : await connectInjected();
      await afterConnect(result);
    } catch (e) {
      setTxStatus("❌ " + (e?.message || "Connection error"));
    }
  }

  async function tx(fn) {
    setLoading(true);
    setTxStatus("Sending...");
    try {
      const t = await fn();
      setTxStatus("Waiting for confirmation...");
      await t.wait();
      setTxStatus("✅ Confirmed");
      await loadVaultData(contract, provider);
    } catch (e) {
      setTxStatus("❌ " + (e?.reason || e?.message || "Error").slice(0, 120));
    } finally {
      setLoading(false);
    }
  }

  const now = Math.floor(Date.now() / 1000);
  const isQuarantined = quarantineEnd > now;
  const lockExpired   = lockTs > 0 && now >= lockTs + lockDur;
  const refundAvail   = vaultState === 1 || (vaultState === 2 && now >= lockTs + lockDur + refundDel);
  const stateLabel    = vaultState !== null ? STATE_LABELS[vaultState] : "...";
  const stateColor    = vaultState !== null ? STATE_COLORS[vaultState] : "gray";

  return (
    <div className={styles.page}>
      <HelpPanel />

      <header className={styles.header}>
        <h1>SecureVault</h1>
        <p className={styles.addr}>
          <a href={`https://basescan.org/address/${CONTRACT_ADDRESS}`} target="_blank" rel="noreferrer">
            {CONTRACT_ADDRESS.slice(0,6)}…{CONTRACT_ADDRESS.slice(-4)} ↗
          </a>
          {" · "}Base mainnet
        </p>
      </header>

      {!account ? (
        <div className={styles.connectBox}>
          <button className={`${styles.btn} ${styles.primary}`} onClick={() => handleConnect("coinbase")}>
            Coinbase Smart Wallet
          </button>
          <button className={`${styles.btn} ${styles.secondary}`} onClick={() => handleConnect("injected")}>
            MetaMask / other wallet
          </button>
        </div>
      ) : (
        <div className={styles.accountRow}>
          <span className={styles.account}>{account.slice(0,6)}…{account.slice(-4)}</span>
          <span className={styles.walletBadge}>{walletType}</span>
        </div>
      )}

      {account && (
        <div className={styles.panel}>
          <div className={`${styles.stateBadge} ${styles["state_" + stateColor]}`}>
            {stateLabel}
          </div>
          <div className={styles.grid}>
            <div className={styles.stat}>
              <span className={styles.label}>Balance</span>
              <span className={styles.value}>{balance} ETH</span>
            </div>
            <div className={styles.stat}>
              <span className={styles.label}>Quarantine</span>
              <span className={`${styles.value} ${isQuarantined ? styles.warn : styles.ok}`}>
                {isQuarantined ? `until ${new Date(quarantineEnd*1000).toLocaleTimeString()}` : "none"}
              </span>
            </div>
            {lockTs > 0 && (
              <div className={styles.stat}>
                <span className={styles.label}>Lock expires</span>
                <span className={`${styles.value} ${lockExpired ? styles.ok : ""}`}>
                  {lockExpired ? "✅ expired" : new Date((lockTs+lockDur)*1000).toLocaleString()}
                </span>
              </div>
            )}
            {counterparty && (
              <div className={styles.stat}>
                <span className={styles.label}>Counterparty</span>
                <span className={styles.value}>{counterparty.slice(0,6)}…{counterparty.slice(-4)}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {account && (
        <div className={styles.actions}>
          {vaultState === 0 && (
            <div className={styles.card}>
              <h3>Deposit</h3>
              <input className={styles.input} value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.01" />
              <button className={`${styles.btn} ${styles.primary}`} disabled={loading || isQuarantined}
                onClick={() => tx(() => contract.deposit({ value: ethers.parseEther(amount) }))}>
                Deposit ETH
              </button>
            </div>
          )}
          {vaultState === 1 && (
            <div className={styles.card}>
              <h3>Lock funds</h3>
              <button className={`${styles.btn} ${styles.warning}`} disabled={loading || isQuarantined}
                onClick={() => tx(() => contract.lock())}>
                Lock
              </button>
            </div>
          )}
          {vaultState === 2 && (
            <div className={styles.card}>
              <h3>Reveal secret</h3>
              <input className={styles.input} value={secret} onChange={e => setSecret(e.target.value)}
                placeholder="secret phrase" type="password" />
              <button className={`${styles.btn} ${styles.primary}`} disabled={loading || isQuarantined || !lockExpired}
                onClick={() => tx(() => contract.initiateExecution(ethers.keccak256(ethers.toUtf8Bytes(secret))))}>
                {lockExpired ? "Reveal & Initiate" : "Waiting for lock to expire..."}
              </button>
            </div>
          )}
          {vaultState === 3 && (
            <div className={styles.card}>
              <h3>Execute</h3>
              <button className={`${styles.btn} ${styles.primary}`} disabled={loading || isQuarantined}
                onClick={() => tx(() => contract.execute())}>
                Execute
              </button>
            </div>
          )}
          {(vaultState === 1 || vaultState === 2) && (
            <div className={styles.card}>
              <h3>Refund</h3>
              <button className={`${styles.btn} ${styles.danger}`} disabled={loading || isQuarantined || !refundAvail}
                onClick={() => tx(() => contract.refund())}>
                {refundAvail ? "Refund" : "Not available yet"}
              </button>
            </div>
          )}
          {!isQuarantined && vaultState !== 4 && vaultState !== 5 && (
            <div className={styles.card}>
              <h3>Quarantine</h3>
              <p className={styles.hint}>Freeze the contract for 12h. Stake 0.01 ETH.</p>
              <button className={`${styles.btn} ${styles.danger}`} disabled={loading}
                onClick={() => tx(() => contract.initiateQuarantine({ value: ethers.parseEther("0.01") }))}>
                Quarantine (0.01 ETH)
              </button>
            </div>
          )}
        </div>
      )}

      {txStatus && (
        <div className={`${styles.status} ${txStatus.startsWith("❌") ? styles.err : ""}`}>
          {txStatus}
        </div>
      )}

      {account && (
        <button className={styles.refresh} onClick={() => loadVaultData(contract, provider)}>
          ↻ Refresh
        </button>
      )}
    </div>
  );
}
