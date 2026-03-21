/* eslint-disable @typescript-eslint/no-explicit-any */

export type WalletGatewayId =
  | "metamask"
  | "trust_wallet"
  | "coinbase_wallet"
  | "okx_wallet"
  | "binance_web3"
  | "rabby"
  | "tokenpocket"
  | "brave_wallet"
  | "browser_wallet";

export const WALLET_OPTIONS: Array<{
  id: WalletGatewayId;
  name: string;
  description: string;
  installUrl?: string;
}> = [
  { id: "metamask", name: "MetaMask", description: "Extension & mobile", installUrl: "https://metamask.io/download/" },
  { id: "trust_wallet", name: "Trust Wallet", description: "Mobile & browser", installUrl: "https://trustwallet.com/download" },
  { id: "coinbase_wallet", name: "Coinbase Wallet", description: "Extension & app", installUrl: "https://www.coinbase.com/wallet" },
  { id: "okx_wallet", name: "OKX Wallet", description: "Multi-chain", installUrl: "https://www.okx.com/web3" },
  { id: "binance_web3", name: "Binance Web3", description: "Binance wallet", installUrl: "https://www.binance.com/en/web3wallet" },
  { id: "rabby", name: "Rabby", description: "Desktop browser", installUrl: "https://rabby.io/" },
  { id: "tokenpocket", name: "TokenPocket", description: "Multi-chain", installUrl: "https://www.tokenpocket.pro/" },
  { id: "brave_wallet", name: "Brave Wallet", description: "Built into Brave", installUrl: "https://brave.com/wallet/" },
  { id: "browser_wallet", name: "Other wallet", description: "Any injected Web3 wallet" }
];

export function isMobileDevice(): boolean {
  if (typeof navigator === "undefined") {
    return false;
  }
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

/** Opens this exact page inside the wallet app browser (where Web3 works on mobile). */
export function getOpenInWalletDeepLink(walletId: WalletGatewayId, pageHref?: string): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  const page = pageHref ?? window.location.href.split("#")[0];
  const enc = encodeURIComponent(page);

  switch (walletId) {
    case "metamask":
      return `https://metamask.app.link/dapp/${enc}`;
    case "trust_wallet":
      return `https://link.trustwallet.com/browser?url=${enc}`;
    case "coinbase_wallet":
      return `https://go.cb-w.com/dapp?cb_url=${enc}`;
    case "okx_wallet":
      return `okx://wallet/dapp/url?dappUrl=${enc}`;
    case "browser_wallet":
      return `https://metamask.app.link/dapp/${enc}`;
    default:
      return null;
  }
}

export function getEthereumProvider(id: WalletGatewayId): any | null {
  const w = window as any;
  const eth = w.ethereum;
  const list: any[] = eth?.providers?.length ? [...eth.providers] : eth ? [eth] : [];

  const find = (fn: (p: any) => boolean) => list.find(fn) ?? null;

  switch (id) {
    case "metamask":
      return (
        find((p) => p.isMetaMask === true && !p.isBraveWallet) ||
        (eth?.isMetaMask && !eth?.isBraveWallet ? eth : null)
      );
    case "trust_wallet":
      return find((p) => p.isTrust === true) || w.trustwallet || null;
    case "coinbase_wallet":
      return find((p) => p.isCoinbaseWallet === true) || null;
    case "okx_wallet":
      return find((p) => p.isOkxWallet || p.isOKExWallet) || w.okxwallet || null;
    case "binance_web3":
      return find((p) => p.isBinance === true) || w.BinanceChain || null;
    case "rabby":
      return find((p) => p.isRabby === true) || null;
    case "tokenpocket":
      return find((p) => p.isTokenPocket === true) || null;
    case "brave_wallet":
      return find((p) => p.isBraveWallet === true) || null;
    case "browser_wallet":
    default:
      return eth || w.okxwallet || w.trustwallet || null;
  }
}

const BSC_CHAIN = {
  chainId: "0x38",
  chainName: "BNB Smart Chain",
  nativeCurrency: { name: "BNB", symbol: "BNB", decimals: 18 },
  rpcUrls: ["https://bsc-dataseed.binance.org/"],
  blockExplorerUrls: ["https://bscscan.com"]
};

export async function ensureBscChain(provider: any): Promise<void> {
  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: BSC_CHAIN.chainId }]
    });
  } catch (e: any) {
    if (e?.code === 4902 || e?.code === -32603) {
      await provider.request({
        method: "wallet_addEthereumChain",
        params: [BSC_CHAIN]
      });
      return;
    }
    throw e;
  }
}
