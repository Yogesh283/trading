import { useCallback, useEffect, useState } from "react";
import { ethers } from "ethers";
import { createDepositIntent, loadMyDeposits, submitDepositTx, type DepositRecord } from "./api";
import "./funds.css";
import { BrandLogo } from "./BrandLogo";
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
  onBack: () => void;
  onSuccess?: () => void;
};

const ERC20_TRANSFER = "function transfer(address to, uint256 amount) returns (bool)";

export default function DepositPage({ token, onBack, onSuccess }: Props) {
  const [amount, setAmount] = useState("50");
  const [deposits, setDeposits] = useState<DepositRecord[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");
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
        const deep =
          getOpenInWalletDeepLink(walletId) ??
          getOpenInWalletDeepLink("metamask");
        if (deep) {
          setMessage(
            "App khul rahi hai. Wahan Browser se yahi site kholen, login karein, phir amount set karke dubara isi wallet par tap karein (USDT BSC + thoda BNB gas)."
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

    setBusy(walletName);
    try {
      const intent = await createDepositIntent(token, num, walletId);
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
      setMessage(`Success: ${num} USDT sent. Tx: ${txHash.slice(0, 18)}… Balance will update on dashboard.`);
      await refreshDeposits();
      onSuccess?.();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("user rejected") || msg.includes("4001")) {
        setMessage("Transaction cancelled in wallet.");
      } else {
        setMessage(msg.slice(0, 200));
      }
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="funds-page funds-gateway">
      <button type="button" className="funds-back" onClick={onBack}>
        ← Dashboard
      </button>

      <div className="funds-card">
        <div className="funds-title-row">
          <BrandLogo size={44} />
          <h1>Deposit gateway · USDT BEP20</h1>
        </div>
        <p className="funds-network">
          <span className="funds-badge">BSC</span> Payment goes directly to admin wallet · Same amount shows in your
          wallet before you confirm
        </p>

        {isMobileDevice() ? (
          <div className="funds-mobile-tip">
            <strong>Mobile</strong>
            <p>
              Pehle amount set karein. Agar Chrome/Safari mein wallet dikhe na, wallet tile dabayein — MetaMask / Trust /
              Coinbase app khulegi; wahan <strong>Browser</strong> se yahi link kholen (same Wi‑Fi par PC ka IP use
              karein, jaise <code>http://192.168.x.x:5173</code>). Phir dubara deposit wallet chunein.
            </p>
          </div>
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
        <p className="funds-wallets-hint">Click a wallet — it opens so you can approve USDT transfer to the platform address.</p>

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

      <div className="funds-card funds-admin">
        <h2>Admin panel (React-Admin)</h2>
        <p className="funds-note">
          Deposits / withdrawals / users: <strong>React-Admin</strong>{" "}
          <a href="/admin.html" target="_blank" rel="noopener noreferrer">
            /admin.html
          </a>{" "}
          — <strong>email + password</strong> se login; user ka DB mein <code>role = admin</code> hona chahiye (
          <code>ADMIN_PROMOTE_EMAIL</code> se promote ya SQL <code>UPDATE users SET role=&apos;admin&apos;</code>).
        </p>
      </div>
    </div>
  );
}
