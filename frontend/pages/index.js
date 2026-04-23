import { useState, useCallback } from "react";
import { ethers } from "ethers";
import { CONTRACT_ADDRESS, ABI, STATE_LABELS } from "../lib/contract";
import styles from "../styles/Home.module.css";

const STATE_COLORS = ["gray", "blue", "purple", "amber", "teal", "red"];

function SidePanel() {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={`${styles.side} ${expanded ? styles.sideOpen : ""}`}>
      {/* Collapsed — thin strip */}
      {!expanded && (
        <button className={styles.sideStrip} onClick={() => setExpanded(true)}>
          <span className={styles.sideStripText}>What is this?</span>
        </button>
      )}

      {/* Expanded — full info */}
      {expanded && (
        <div className={styles.sideContent}>
          <button className={styles.sideClose} onClick={() => setExpanded(false)}>✕</button>

          <h3>SecureVault</h3>
          <p>Trustless escrow on Base — no middleman, no lawyers. Just code.</p>

          <h4>How it works</h4>
          <div className={styles.steps}>
            <div className={styles.step}><span>1</span>Owner deposits ETH → <b>FUNDED</b></div>
            <div className={styles.step}><span>2</span>Owner locks funds → <b>LOCKED</b></div>
            <div className={styles.step}><span>3</span>Counterparty fulfills deal off-chain</div>
            <div className={styles.step}><span>4</span>Counterparty reveals secret → <b>PENDING</b></div>
            <div className={styles.step}><span>5</span>Funds released → <b>EXECUTED</b></div>
          </div>

          <p className={styles.refundNote}>Deal fell through? Owner refunds after timer expires.</p>

          <h4>Protections</h4>
          <ul className={styles.infoList}>
            <li><b>Secret</b> — funds locked without the correct code</li>
            <li><b>Quarantine</b> — freeze contract 12h on suspicious activity</li>
            <li><b>Refund delay</b> — lockDuration + 24h from LOCKED state</li>
            <li><b>Upgrade timelock</b> — 48h notice before any contract change</li>
          </ul>

          <h4>Use cases</h4>
          <ul className={styles.infoList}>
            <li>OTC purchase of NFTs or tokens</li>
            <li>Freelance payment on delivery</li>
            <li>Cross-chain atomic swap</li>
            <li>Any trustless p2p deal</li>
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
    } catch (e) { console.error(e); }
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
    <div className={styles.layout}>
      <SidePanel />

      <div className={styles.page}>
        <header className={styles.header}>
          <h1>SecureVault</h1>
          <p className={styles.tagline}>Lock. Prove. Execute.</p>
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
    </div>
  );
}
