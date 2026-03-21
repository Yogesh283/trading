import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ethers } from "ethers";
import { createDepositIntent, loadMyDeposits, submitDepositTx, type DepositRecord } from "./api";
import "./funds.css";
import { BrandLogo } from "./BrandLogo";
import {
  appendDepositAmountToPageUrl,
  clearAutoDepositLocal,
  consumeDepositAmountFromNavigation,
  DEPOSIT_AMOUNT_LOCAL_KEY,
  DEPOSIT_AMOUNT_SESSION_KEY,
  readAnySavedDepositAmount,
  readAutoDepositFromLocal,
  readAutoDepositFromLocation,
  readAutoDepositFromSession,
  setAutoDepositLocalPending,
  stripAutoDepositFromUrl
} from "./depositStorage";
import {
  ensureBscChain,
  getEthereumProvider,
  getOpenInWalletDeepLink,
  isMobileDevice,
  WALLET_OPTIONS,
  type WalletGatewayId
} from "./walletGateway";

type Props = {
  token: string;
  onSuccess?: () => void;
};

const ERC20_TRANSFER = "function transfer(address to, uint256 amount) returns (bool)";

function shortAddr(addr: string, left = 6, right = 4) {
  if (!addr || addr.length < left + right + 2) return addr;
  return `${addr.slice(0, left)}…${addr.slice(-right)}`;
}

export default function DepositPage({ token, onSuccess }: Props) {
  const [amount, setAmount] = useState("50");
  const [deposits, setDeposits] = useState<DepositRecord[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [yourWallet, setYourWallet] = useState<string | null>(null);
  /** Mobile in-wallet browser: run USDT transfer once after inject + amount ready. */
  const autoDepositStartedRef = useRef(false);
  const [showMobileContinue, setShowMobileContinue] = useState(false);

  const refreshDeposits = useCallback(async () => {
    try {
      const { deposits: rows } = await loadMyDeposits(token);
      setDeposits(rows);
    } catch {
      setDeposits([]);
    }
  }, [token]);

  useEffect(() => {
    void refreshDeposits();
  }, [refreshDeposits]);

  /** Injected wallet address (MetaMask in-app) — no prompt. */
  useEffect(() => {
    const eth = (window as unknown as { ethereum?: { request?: (a: { method: string }) => Promise<string[]> } })
      .ethereum;
    if (!eth?.request) return;
    void eth
      .request({ method: "eth_accounts" })
      .then((accs) => {
        if (accs?.[0]) setYourWallet(accs[0]);
        else setYourWallet(null);
      })
      .catch(() => setYourWallet(null));
  }, [token, busy, message]);

  /** MetaMask WebView ≠ Chrome: use query + hash + localStorage; retry for slow loads. */
  useLayoutEffect(() => {
    consumeDepositAmountFromNavigation(setAmount);
  }, []);

  useEffect(() => {
    const run = () => consumeDepositAmountFromNavigation(setAmount);
    run();
    const t1 = window.setTimeout(run, 350);
    const t2 = window.setTimeout(run, 1200);
    const onVis = () => {
      if (document.visibilityState === "visible") run();
    };
    const onShow = () => run();
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("pageshow", onShow);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pageshow", onShow);
    };
  }, [token]);

  const detectWalletIdFromInjected = useCallback((provider: { isMetaMask?: boolean; isBraveWallet?: boolean; isTrust?: boolean; isCoinbaseWallet?: boolean }): WalletGatewayId => {
    if (provider.isMetaMask && !provider.isBraveWallet) return "metamask";
    if (provider.isTrust) return "trust_wallet";
    if (provider.isCoinbaseWallet) return "coinbase_wallet";
    return "browser_wallet";
  }, []);

  const executeDepositTransfer = useCallback(
    async (walletId: WalletGatewayId, walletName: string, num: number) => {
      let provider = getEthereumProvider(walletId);
      if (!provider && walletId !== "browser_wallet") {
        provider = getEthereumProvider("browser_wallet");
      }
      if (!provider) {
        throw new Error("Wallet not available");
      }

      setBusy(walletName);
      try {
        const intentWalletId = walletId === "browser_wallet" ? detectWalletIdFromInjected(provider) : walletId;
        const intent = await createDepositIntent(token, num, intentWalletId);
        const { deposit, tokenAddress, toAddress, decimals } = intent;

        await ensureBscChain(provider);
        const accounts: string[] = await provider.request({
          method: "eth_requestAccounts"
        });
        const from = accounts[0];
        if (!from) {
          throw new Error("No wallet address");
        }

        const iface = new ethers.Interface([ERC20_TRANSFER]);
        const value = ethers.parseUnits(String(num), decimals);
        const to = ethers.getAddress(toAddress.toLowerCase());
        const usdtContract = ethers.getAddress(tokenAddress.toLowerCase());
        const data = iface.encodeFunctionData("transfer", [to, value]);

        const txHash: string = await provider.request({
          method: "eth_sendTransaction",
          params: [
            {
              from,
              to: usdtContract,
              data
            }
          ]
        });

        await submitDepositTx(token, deposit.id, txHash, from);
        try {
          sessionStorage.removeItem(DEPOSIT_AMOUNT_SESSION_KEY);
          localStorage.removeItem(DEPOSIT_AMOUNT_LOCAL_KEY);
          clearAutoDepositLocal();
        } catch {
          /* ignore */
        }
        stripAutoDepositFromUrl();
        setShowMobileContinue(false);
        setMessage(`Success: ${num} USDT sent. Tx: ${txHash.slice(0, 18)}… Balance will update on dashboard.`);
        await refreshDeposits();
        onSuccess?.();
      } finally {
        setBusy(null);
      }
    },
    [token, refreshDeposits, onSuccess, detectWalletIdFromInjected]
  );

  /**
   * Mobile flow: Amount enter → open wallet app → in-app browser loads this page →
   * auto connect + USDT transfer(tx) → user Confirm → submitDepositTx.
   */
  const tryAutoDepositInWalletBrowser = useCallback(
    async (opts?: { skipAutoIntentFlag?: boolean }) => {
      if (autoDepositStartedRef.current) return;

      const wantAuto =
        opts?.skipAutoIntentFlag === true
          ? true
          : readAutoDepositFromLocation() || readAutoDepositFromLocal() || readAutoDepositFromSession();
      if (!wantAuto) return;

      const raw = readAnySavedDepositAmount();
      const num = Number(raw ?? amount);
      if (!Number.isFinite(num) || num < 1) return;

      const provider =
        getEthereumProvider("metamask") ||
        getEthereumProvider("trust_wallet") ||
        getEthereumProvider("coinbase_wallet") ||
        getEthereumProvider("browser_wallet");
      if (!provider?.request) return;

      autoDepositStartedRef.current = true;
      setMessage("Step 3/4: Confirm in wallet — USDT to platform address (amount pre-filled).");

      const wid = detectWalletIdFromInjected(provider);
      try {
        await executeDepositTransfer(wid, "Wallet", num);
      } catch (err: unknown) {
        autoDepositStartedRef.current = false;
        stripAutoDepositFromUrl();
        clearAutoDepositLocal();
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("user rejected") || msg.includes("4001")) {
          setMessage("Cancelled. Tap a wallet below or “Continue USDT payment” to try again.");
        } else {
          setMessage(msg.slice(0, 220));
        }
      }
    },
    [amount, executeDepositTransfer, detectWalletIdFromInjected]
  );

  useEffect(() => {
    if (!token) return;

    const wantAuto =
      readAutoDepositFromLocation() || readAutoDepositFromLocal() || readAutoDepositFromSession();
    if (!wantAuto) {
      setShowMobileContinue(false);
      return;
    }

    setShowMobileContinue(true);
    const run = () => void tryAutoDepositInWalletBrowser();

    const timers = [250, 600, 1200, 2000, 3500, 5000, 7500, 10000].map((ms) =>
      window.setTimeout(run, ms)
    );
    const poll = window.setInterval(run, 900);
    const stopPoll = window.setTimeout(() => window.clearInterval(poll), 32000);

    const onVis = () => {
      if (document.visibilityState === "visible") run();
    };
    const onShow = () => run();
    const onFocus = () => run();

    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("pageshow", onShow);
    window.addEventListener("focus", onFocus);

    return () => {
      timers.forEach((t) => window.clearTimeout(t));
      window.clearInterval(poll);
      window.clearTimeout(stopPoll);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pageshow", onShow);
      window.removeEventListener("focus", onFocus);
    };
  }, [token, amount, tryAutoDepositInWalletBrowser]);

  const payWithWallet = async (walletId: WalletGatewayId, walletName: string) => {
    setMessage("");
    const num = Number(amount);
    if (!Number.isFinite(num) || num < 1) {
      setMessage("Minimum 1 USDT.");
      return;
    }

    let provider = getEthereumProvider(walletId);
    if (!provider && walletId !== "browser_wallet") {
      provider = getEthereumProvider("browser_wallet");
    }
    if (!provider) {
      if (isMobileDevice()) {
        const base = window.location.href.split("#")[0];
        const pageWithAmount = appendDepositAmountToPageUrl(base, String(num));
        try {
          sessionStorage.setItem(DEPOSIT_AMOUNT_SESSION_KEY, String(num));
          localStorage.setItem(DEPOSIT_AMOUNT_LOCAL_KEY, String(num));
          setAutoDepositLocalPending();
        } catch {
          /* ignore */
        }
        const deep =
          getOpenInWalletDeepLink(walletId, pageWithAmount) ??
          getOpenInWalletDeepLink("metamask", pageWithAmount);
        if (deep) {
          setMessage(
            "Opening wallet app… Page will load with your amount; then the USDT send screen should open automatically — confirm there."
          );
          window.setTimeout(() => {
            window.location.href = deep;
          }, 400);
          return;
        }
      }
      const opt = WALLET_OPTIONS.find((w) => w.id === walletId);
      setMessage(
        `${walletName} not detected. Install the app/extension, or on phone open this page inside MetaMask / Trust / Coinbase browser.`
      );
      if (opt?.installUrl) {
        window.open(opt.installUrl, "_blank", "noopener,noreferrer");
      }
      return;
    }

    try {
      await executeDepositTransfer(walletId, walletName, num);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("user rejected") || msg.includes("4001")) {
        setMessage("Transaction cancelled in wallet.");
      } else {
        setMessage(msg.slice(0, 200));
      }
    }
  };

  return (
    <div className="funds-page funds-gateway">
      <div className="funds-card">
        <div className="funds-title-row">
          <BrandLogo size={44} />
          <h1>Deposit gateway · USDT BEP20</h1>
        </div>
        <p className="funds-network">
          <span className="funds-badge">BSC</span> USDT BEP20 · Double-check the amount before you confirm
        </p>

        {isMobileDevice() ? (
          <ol className="deposit-flow-steps" aria-label="Mobile deposit steps">
            <li>
              <strong>Amount</strong> — enter USDT, then pick MetaMask / Trust / Coinbase.
            </li>
            <li>
              <strong>Open wallet</strong> — app opens; this page loads inside the wallet browser.
            </li>
            <li>
              <strong>Auto payment</strong> — wallet asks to send USDT (platform address + your amount). Tap{" "}
              <strong>Confirm</strong>.
            </li>
            <li>
              <strong>Done</strong> — we record the tx; balance updates on the dashboard.
            </li>
          </ol>
        ) : null}

        {yourWallet ? (
          <p className="deposit-your-wallet">
            Your wallet: <span className="deposit-your-wallet-addr">{shortAddr(yourWallet, 8, 6)}</span>
          </p>
        ) : null}

        <label className="funds-amount-label">
          Amount (USDT)
          <input
            type="number"
            min={1}
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            disabled={!!busy}
          />
        </label>

        <h2 className="funds-wallets-title">Choose wallet</h2>
        <p className="funds-wallets-hint">
          <strong>Phone:</strong> use <strong>HTTPS</strong> site link. After the wallet opens, wait a few seconds — the USDT transaction should pop up automatically.{" "}
          <strong>Desktop:</strong> extension opens the same confirm screen.
        </p>

        {isMobileDevice() && showMobileContinue ? (
          <button
            type="button"
            className="deposit-continue-wallet-btn"
            disabled={!!busy}
            onClick={() => void tryAutoDepositInWalletBrowser({ skipAutoIntentFlag: true })}
          >
            Continue USDT payment (if wallet did not open the send screen)
          </button>
        ) : null}

        <div className="wallet-grid">
          {WALLET_OPTIONS.map((w) => (
            <button
              key={w.id}
              type="button"
              className="wallet-tile"
              disabled={!!busy}
              onClick={() => void payWithWallet(w.id, w.name)}
            >
              <span className="wallet-tile-name">{w.name}</span>
              <span className="wallet-tile-desc">{w.description}</span>
              {busy === w.name ? <span className="wallet-tile-busy">Opening…</span> : null}
            </button>
          ))}
        </div>

        {message ? <p className="funds-message funds-message-wide">{message}</p> : null}

        <div className="funds-warn">
          <strong>Network</strong>
          <ul>
            <li>Only <strong>USDT on BNB Smart Chain (BEP20)</strong>. Wrong network = loss of funds.</li>
            <li>Your wallet will show the exact USDT amount before you sign.</li>
          </ul>
        </div>
      </div>

      <div className="funds-card funds-history">
        <h2>Your deposit records</h2>
        {deposits.length === 0 ? (
          <p className="muted">No deposits yet.</p>
        ) : (
          <div className="deposit-table-wrap">
            <table className="deposit-table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Amount</th>
                  <th>Wallet</th>
                  <th>Status</th>
                  <th>Tx</th>
                </tr>
              </thead>
              <tbody>
                {deposits.map((d) => (
                  <tr key={d.id}>
                    <td>{new Date(d.created_at).toLocaleString()}</td>
                    <td>{d.amount} USDT</td>
                    <td>{d.wallet_provider.replace(/_/g, " ")}</td>
                    <td>
                      <span className={`dep-status dep-${d.status}`}>{d.status}</span>
                    </td>
                    <td className="dep-tx">
                      {d.tx_hash ? (
                        <a
                          href={`https://bscscan.com/tx/${d.tx_hash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {d.tx_hash.slice(0, 10)}…
                        </a>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>


    </div>
  );
}
