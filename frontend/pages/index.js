import { useState, useCallback } from "react";
import { ethers } from "ethers";
import { OnchainKitProvider, ConnectWallet, Identity, Avatar, Name } from "@coinbase/onchainkit";
import { connectCoinbase, connectInjected } from "../lib/wallet";
import { CONTRACT_ADDRESS, ABI, STATE_LABELS } from "../lib/contract";
import styles from "../styles/Home.module.css";

const STATE_COLORS = ["gray", "blue", "purple", "amber", "teal", "red"];
const BASE_CHAIN = { id: 8453, name: "Base" };

export default function Home() {
  const [provider, setProvider]     = useState(null);
  const [signer, setSigner]         = useState(null);
  const [contract, setContract]     = useState(null);
  const [account, setAccount]       = useState("");
  const [walletType, setWalletType] = useState("");

  const [vaultState, setVaultState]   = useState(null);
  const [balance, setBalance]         = useState("0");
  const [quarantineEnd, setQuarantineEnd] = useState(0);
  const [lockTs, setLockTs]           = useState(0);
  const [lockDur, setLockDur]         = useState(0);
  const [refundDel, setRefundDel]     = useState(0);
  const [counterparty, setCounterparty] = useState("");

  const [amount, setAmount]   = useState("0.01");
  const [secret, setSecret]   = useState("");
  const [txStatus, setTxStatus] = useState("");
  const [loading, setLoading] = useState(false);

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
    setSigner(sgn);
    setContract(ctr);
    setWalletType(wt);
    setAccount(await sgn.getAddress());
    await loadVaultData(ctr, prov);
  }

  async function handleCoinbase() {
    try { afterConnect(await connectCoinbase()); }
    catch (e) { setTxStatus("❌ " + e.message); }
  }

  async function handleMetamask() {
    try { afterConnect(await connectInjected()); }
    catch (e) { setTxStatus("❌ " + e.message); }
  }

  async function tx(fn) {
    setLoading(true);
    setTxStatus("Отправка...");
    try {
      const t = await fn();
      setTxStatus("Ожидание подтверждения...");
      await t.wait();
      setTxStatus("✅ Подтверждено");
      await loadVaultData(contract, provider);
    } catch (e) {
      setTxStatus("❌ " + (e?.reason || e?.message || "Ошибка").slice(0, 120));
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
    <OnchainKitProvider chain={BASE_CHAIN}>
      <div className={styles.page}>
        <header className={styles.header}>
          <h1>SecureVault</h1>
          <p className={styles.addr}>
            <a href={`https://basescan.org/address/${CONTRACT_ADDRESS}`} target="_blank" rel="noreferrer">
              {CONTRACT_ADDRESS.slice(0,6)}…{CONTRACT_ADDRESS.slice(-4)} ↗
            </a>
            {" · "}Base mainnet
          </p>
        </header>

        {/* ── Connect ── */}
        {!account ? (
          <div className={styles.connectBox}>
            {/* OnchainKit — Coinbase Smart Wallet */}
            <ConnectWallet
              className={styles.btnOnchain}
              onConnect={async (addr) => {
                // OnchainKit manages its own provider — bridge to ethers via coinbase sdk
                await handleCoinbase();
              }}
            >
              Coinbase Smart Wallet
            </ConnectWallet>

            {/* Fallback — MetaMask / injected */}
            <button className={`${styles.btn} ${styles.secondary}`} onClick={handleMetamask}>
              MetaMask / другой кошелёк
            </button>
          </div>
        ) : (
          <div className={styles.accountRow}>
            {walletType === "coinbase" ? (
              <Identity address={account} className={styles.identity}>
                <Avatar className={styles.avatar} />
                <Name className={styles.name} />
              </Identity>
            ) : (
              <span className={styles.account}>
                {account.slice(0,6)}…{account.slice(-4)}
              </span>
            )}
            <span className={styles.walletBadge}>{walletType}</span>
          </div>
        )}

        {/* ── Vault status ── */}
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
                  {isQuarantined ? `до ${new Date(quarantineEnd*1000).toLocaleTimeString()}` : "нет"}
                </span>
              </div>
              {lockTs > 0 && (
                <div className={styles.stat}>
                  <span className={styles.label}>Lock истекает</span>
                  <span className={`${styles.value} ${lockExpired ? styles.ok : ""}`}>
                    {lockExpired ? "✅ истёк" : new Date((lockTs+lockDur)*1000).toLocaleString()}
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

        {/* ── Actions ── */}
        {account && (
          <div className={styles.actions}>
            {vaultState === 0 && (
              <div className={styles.card}>
                <h3>Депозит</h3>
                <input className={styles.input} value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.01" />
                <button className={`${styles.btn} ${styles.primary}`} disabled={loading || isQuarantined}
                  onClick={() => tx(() => contract.deposit({ value: ethers.parseEther(amount) }))}>
                  Deposit ETH
                </button>
              </div>
            )}
            {vaultState === 1 && (
              <div className={styles.card}>
                <h3>Заблокировать</h3>
                <button className={`${styles.btn} ${styles.warning}`} disabled={loading || isQuarantined}
                  onClick={() => tx(() => contract.lock())}>
                  Lock
                </button>
              </div>
            )}
            {vaultState === 2 && (
              <div className={styles.card}>
                <h3>Раскрыть секрет</h3>
                <input className={styles.input} value={secret} onChange={e => setSecret(e.target.value)}
                  placeholder="секретная фраза" type="password" />
                <button className={`${styles.btn} ${styles.primary}`} disabled={loading || isQuarantined || !lockExpired}
                  onClick={() => tx(() => contract.initiateExecution(ethers.keccak256(ethers.toUtf8Bytes(secret))))}>
                  {lockExpired ? "Reveal & Initiate" : "Ждём окончания lock..."}
                </button>
              </div>
            )}
            {vaultState === 3 && (
              <div className={styles.card}>
                <h3>Исполнить</h3>
                <button className={`${styles.btn} ${styles.primary}`} disabled={loading || isQuarantined}
                  onClick={() => tx(() => contract.execute())}>
                  Execute
                </button>
              </div>
            )}
            {(vaultState === 1 || vaultState === 2) && (
              <div className={styles.card}>
                <h3>Возврат</h3>
                <button className={`${styles.btn} ${styles.danger}`} disabled={loading || isQuarantined || !refundAvail}
                  onClick={() => tx(() => contract.refund())}>
                  {refundAvail ? "Refund" : "Недоступно пока"}
                </button>
              </div>
            )}
            {!isQuarantined && vaultState !== 4 && vaultState !== 5 && (
              <div className={styles.card}>
                <h3>Карантин</h3>
                <p className={styles.hint}>Заморозить контракт на 12ч. Стейк 0.01 ETH.</p>
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
            ↻ Обновить
          </button>
        )}
      </div>
    </OnchainKitProvider>
  );
}
