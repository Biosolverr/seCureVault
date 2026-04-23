import { useState, useEffect, useCallback } from "react";
import { ethers } from "ethers";
import {
  CONTRACT_ADDRESS, BASE_CHAIN_ID, BASE_RPC,
  ABI, STATE_LABELS
} from "../lib/contract";
import styles from "../styles/Home.module.css";

const STATE_COLORS = ["gray", "blue", "purple", "amber", "teal", "red"];

export default function Home() {
  const [provider, setProvider] = useState(null);
  const [signer, setSigner] = useState(null);
  const [contract, setContract] = useState(null);
  const [account, setAccount] = useState("");

  const [state, setStateVal] = useState(null);
  const [balance, setBalance] = useState("0");
  const [quarantineEnd, setQuarantineEnd] = useState(0);
  const [lockTs, setLockTs] = useState(0);
  const [lockDur, setLockDur] = useState(0);
  const [refundDel, setRefundDel] = useState(0);
  const [counterparty, setCounterparty] = useState("");
  const [guardian, setGuardian] = useState("");

  const [amount, setAmount] = useState("0.01");
  const [secret, setSecret] = useState("");
  const [txStatus, setTxStatus] = useState("");
  const [loading, setLoading] = useState(false);

  const loadVaultData = useCallback(async (ctr, prov) => {
    try {
      const [s, q, lt, ld, rd, cp, gd] = await Promise.all([
        ctr.currentState(),
        ctr.quarantineEndTime(),
        ctr.lockTimestamp(),
        ctr.lockDuration(),
        ctr.refundDelay(),
        ctr.counterparty(),
        ctr.guardian(),
      ]);
      const bal = await prov.getBalance(CONTRACT_ADDRESS);
      setStateVal(Number(s));
      setQuarantineEnd(Number(q));
      setLockTs(Number(lt));
      setLockDur(Number(ld));
      setRefundDel(Number(rd));
      setCounterparty(cp);
      setGuardian(gd);
      setBalance(ethers.formatEther(bal));
    } catch (e) {
      console.error("loadVaultData:", e);
    }
  }, []);

  async function connect() {
    if (!window.ethereum) {
      setTxStatus("MetaMask не найден");
      return;
    }
    const prov = new ethers.BrowserProvider(window.ethereum);
    await prov.send("eth_requestAccounts", []);
    const net = await prov.getNetwork();
    if (net.chainId !== BigInt(BASE_CHAIN_ID)) {
      try {
        await prov.send("wallet_switchEthereumChain", [
          { chainId: "0x" + BASE_CHAIN_ID.toString(16) }
        ]);
      } catch {
        setTxStatus("Переключитесь на Base mainnet");
        return;
      }
    }
    const sgn = await prov.getSigner();
    const ctr = new ethers.Contract(CONTRACT_ADDRESS, ABI, sgn);
    setProvider(prov);
    setSigner(sgn);
    setContract(ctr);
    setAccount(await sgn.getAddress());
    await loadVaultData(ctr, prov);
  }

  async function tx(fn) {
    if (!contract) return;
    setLoading(true);
    setTxStatus("Отправка...");
    try {
      const t = await fn();
      setTxStatus("Ожидание подтверждения...");
      await t.wait();
      setTxStatus("✅ Подтверждено");
      await loadVaultData(contract, provider);
    } catch (e) {
      const msg = e?.reason || e?.message || "Ошибка";
      setTxStatus("❌ " + msg.slice(0, 120));
    } finally {
      setLoading(false);
    }
  }

  const now = Math.floor(Date.now() / 1000);
  const isQuarantined = quarantineEnd > now;
  const lockExpired = lockTs > 0 && now >= lockTs + lockDur;
  const refundAvail =
    state === 1 ||
    (state === 2 && now >= lockTs + lockDur + refundDel);

  const stateLabel = state !== null ? STATE_LABELS[state] : "...";
  const stateColor = state !== null ? STATE_COLORS[state] : "gray";

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1>SecureVault</h1>
        <p className={styles.addr}>
          <a href={`https://basescan.org/address/${CONTRACT_ADDRESS}`} target="_blank" rel="noreferrer">
            {CONTRACT_ADDRESS.slice(0, 6)}…{CONTRACT_ADDRESS.slice(-4)} ↗
          </a>
          &nbsp;· Base mainnet
        </p>
      </header>

      {!account ? (
        <button className={`${styles.btn} ${styles.primary}`} onClick={connect}>
          Подключить кошелёк
        </button>
      ) : (
        <p className={styles.account}>
          {account.slice(0, 6)}…{account.slice(-4)}
        </p>
      )}

      {/* ── Status panel ── */}
      {account && (
        <div className={styles.panel}>
          <div className={`${styles.stateBadge} ${styles["state_" + stateColor]}`}>
            {stateLabel}
          </div>

          <div className={styles.grid}>
            <div className={styles.stat}>
              <span className={styles.label}>Баланс</span>
              <span className={styles.value}>{balance} ETH</span>
            </div>
            <div className={styles.stat}>
              <span className={styles.label}>Карантин</span>
              <span className={`${styles.value} ${isQuarantined ? styles.warn : styles.ok}`}>
                {isQuarantined
                  ? `до ${new Date(quarantineEnd * 1000).toLocaleTimeString()}`
                  : "нет"}
              </span>
            </div>
            {lockTs > 0 && (
              <div className={styles.stat}>
                <span className={styles.label}>Lock истекает</span>
                <span className={`${styles.value} ${lockExpired ? styles.ok : ""}`}>
                  {lockExpired ? "✅ истёк" : new Date((lockTs + lockDur) * 1000).toLocaleString()}
                </span>
              </div>
            )}
            {counterparty && (
              <div className={styles.stat}>
                <span className={styles.label}>Counterparty</span>
                <span className={styles.value}>{counterparty.slice(0, 6)}…{counterparty.slice(-4)}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Actions ── */}
      {account && (
        <div className={styles.actions}>

          {/* Deposit */}
          {state === 0 && (
            <div className={styles.card}>
              <h3>Депозит</h3>
              <input
                className={styles.input}
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="0.01"
              />
              <button
                className={`${styles.btn} ${styles.primary}`}
                disabled={loading || isQuarantined}
                onClick={() => tx(() => contract.deposit({ value: ethers.parseEther(amount) }))}
              >
                Deposit ETH
              </button>
            </div>
          )}

          {/* Lock */}
          {state === 1 && (
            <div className={styles.card}>
              <h3>Заблокировать</h3>
              <button
                className={`${styles.btn} ${styles.warning}`}
                disabled={loading || isQuarantined}
                onClick={() => tx(() => contract.lock())}
              >
                Lock
              </button>
            </div>
          )}

          {/* Initiate Execution */}
          {state === 2 && (
            <div className={styles.card}>
              <h3>Раскрыть секрет</h3>
              <input
                className={styles.input}
                value={secret}
                onChange={e => setSecret(e.target.value)}
                placeholder="секретная фраза"
                type="password"
              />
              <button
                className={`${styles.btn} ${styles.primary}`}
                disabled={loading || isQuarantined || !lockExpired}
                onClick={() => {
                  const h = ethers.keccak256(ethers.toUtf8Bytes(secret));
                  tx(() => contract.initiateExecution(h));
                }}
              >
                {lockExpired ? "Reveal & Initiate" : "Ждём окончания lock..."}
              </button>
            </div>
          )}

          {/* Execute */}
          {state === 3 && (
            <div className={styles.card}>
              <h3>Исполнить</h3>
              <button
                className={`${styles.btn} ${styles.primary}`}
                disabled={loading || isQuarantined}
                onClick={() => tx(() => contract.execute())}
              >
                Execute
              </button>
            </div>
          )}

          {/* Refund */}
          {(state === 1 || state === 2) && (
            <div className={styles.card}>
              <h3>Возврат</h3>
              <button
                className={`${styles.btn} ${styles.danger}`}
                disabled={loading || isQuarantined || !refundAvail}
                onClick={() => tx(() => contract.refund())}
              >
                {refundAvail ? "Refund" : "Возврат недоступен пока"}
              </button>
            </div>
          )}

          {/* Quarantine */}
          {!isQuarantined && state !== 4 && state !== 5 && (
            <div className={styles.card}>
              <h3>Карантин</h3>
              <p className={styles.hint}>Заморозить контракт на 12ч. Стейк 0.01 ETH.</p>
              <button
                className={`${styles.btn} ${styles.danger}`}
                disabled={loading}
                onClick={() => tx(() => contract.initiateQuarantine({ value: ethers.parseEther("0.01") }))}
              >
                Quarantine (0.01 ETH)
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Tx status ── */}
      {txStatus && (
        <div className={`${styles.status} ${txStatus.startsWith("❌") ? styles.err : ""}`}>
          {txStatus}
        </div>
      )}

      {/* ── Refresh ── */}
      {account && (
        <button className={styles.refresh} onClick={() => loadVaultData(contract, provider)}>
          ↻ Обновить
        </button>
      )}
    </div>
  );
}
