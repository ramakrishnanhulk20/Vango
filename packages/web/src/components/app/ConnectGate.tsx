"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import { ApiError, getMe, type Me } from "@/lib/api";
import {
  isInsidePay,
  isUserCancel,
  unwrap,
  waitForProvider,
  type NimiqProvider,
} from "@/lib/nimiq";
import { clearSession, ensureSession, getSession } from "@/lib/session";
import { Button } from "./Button";
import Notice from "./Notice";
import OpenInPay from "./OpenInPay";

type Status =
  | "boot"
  | "outside-pay"
  | "waiting-provider"
  | "syncing"
  | "signing-in"
  | "cancelled"
  | "failed"
  | "ready";

type Wallet = {
  status: Status;
  provider: NimiqProvider | null;
  me: Me | null;
  error: string | null;
  retry: () => void;
  reloadMe: () => Promise<Me | null>;
};

const WalletContext = createContext<Wallet | null>(null);

export function useWallet(): Wallet {
  const wallet = useContext(WalletContext);
  if (!wallet) throw new Error("useWallet is only available inside the app shell");
  return wallet;
}

const PROVIDER_TIMEOUT_MS = 10_000;
const CONSENSUS_RECHECK_MS = 2_000;
const INJECTION_GRACE_MS = 700;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function reason(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "Something went wrong.";
}

/**
 * A card page is a link a shop can print or send, so it opens for anyone. Paying still
 * needs the wallet and the pay panel asks for it there. Every other screen is somebody's
 * own wallet and waits for the sign-in.
 */
function isPublicPath(pathname: string): boolean {
  return pathname.startsWith("/app/c/") && !pathname.endsWith("/redeem");
}

export default function ConnectGate({ host, children }: { host: string; children: ReactNode }) {
  const pathname = usePathname();
  const [status, setStatus] = useState<Status>("boot");
  const [provider, setProvider] = useState<NimiqProvider | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  const retry = useCallback(() => {
    setError(null);
    setStatus("boot");
    setAttempt((count) => count + 1);
  }, []);

  useEffect(() => {
    let alive = true;

    const run = async () => {
      if (!window.nimiq) {
        if (isInsidePay()) {
          setStatus("waiting-provider");
        } else {
          await sleep(INJECTION_GRACE_MS);
          if (!alive) return;
          if (!window.nimiq && !isInsidePay()) {
            setStatus("outside-pay");
            return;
          }
          setStatus("waiting-provider");
        }
      }

      let wallet: NimiqProvider;
      try {
        wallet = await waitForProvider(PROVIDER_TIMEOUT_MS);
      } catch {
        if (!alive) return;
        if (!isInsidePay()) {
          setStatus("outside-pay");
          return;
        }
        setError("Nimiq Pay did not hand Vango your wallet. Close Vango and open it again.");
        setStatus("failed");
        return;
      }
      if (!alive) return;
      setProvider(wallet);

      // Nimiq Pay reads false here for a few seconds after launch. That is the wallet
      // catching up, never a failure, so this waits it out however long it takes.
      for (;;) {
        let established = false;
        try {
          established = unwrap(await wallet.isConsensusEstablished());
        } catch {
          established = false;
        }
        if (!alive) return;
        if (established) break;
        setStatus("syncing");
        await sleep(CONSENSUS_RECHECK_MS);
        if (!alive) return;
      }

      if (getSession()) {
        try {
          const mine = await getMe();
          if (!alive) return;
          setMe(mine);
          setStatus("ready");
          return;
        } catch (thrown) {
          if (!alive) return;
          if (!(thrown instanceof ApiError) || thrown.status !== 401) {
            setError(reason(thrown));
            setStatus("failed");
            return;
          }
          clearSession();
        }
      }

      setStatus("signing-in");
      try {
        await ensureSession(wallet);
      } catch (thrown) {
        if (!alive) return;
        if (isUserCancel(thrown)) {
          setStatus("cancelled");
          return;
        }
        setError(reason(thrown));
        setStatus("failed");
        return;
      }

      try {
        const mine = await getMe();
        if (!alive) return;
        setMe(mine);
        setStatus("ready");
      } catch (thrown) {
        if (!alive) return;
        setError(reason(thrown));
        setStatus("failed");
      }
    };

    void run();
    return () => {
      alive = false;
    };
  }, [attempt]);

  const reloadMe = useCallback(async () => {
    try {
      const mine = await getMe();
      setMe(mine);
      return mine;
    } catch (thrown) {
      if (thrown instanceof ApiError && thrown.status === 401) retry();
      return null;
    }
  }, [retry]);

  const value: Wallet = { status, provider, me, error, retry, reloadMe };
  const open = status === "ready" || isPublicPath(pathname);

  return (
    <WalletContext.Provider value={value}>
      {open ? children : <Gate status={status} error={error} host={host} onRetry={retry} />}
    </WalletContext.Provider>
  );
}

export function Pulse() {
  return (
    <span className="relative flex h-3 w-3 items-center justify-center">
      <span aria-hidden className="soft-pulse absolute h-3 w-3 rounded-full bg-stamp" />
      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-stamp" />
    </span>
  );
}

function Waiting({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3">
      <Pulse />
      <span className="label-type text-paper/45">{label}</span>
    </div>
  );
}

function Gate({
  status,
  error,
  host,
  onRetry,
}: {
  status: Status;
  error: string | null;
  host: string;
  onRetry: () => void;
}) {
  if (status === "boot") {
    return (
      <>
        <div className="outside-pay-only flex flex-1 flex-col">
          <OutsidePay host={host} />
        </div>
        <div className="in-pay-only flex flex-1 items-center">
          <Waiting label="Opening Vango" />
        </div>
      </>
    );
  }

  if (status === "outside-pay") return <OutsidePay host={host} />;

  if (status === "waiting-provider") {
    return (
      <Notice
        label="Your wallet"
        title="One moment"
        body="Vango is asking Nimiq Pay for your wallet."
        tone="stamp"
      >
        <Waiting label="Waiting for the wallet" />
      </Notice>
    );
  }

  if (status === "syncing") {
    return (
      <Notice
        label="Nimiq Pay"
        title="Your wallet is syncing"
        body="It is catching up with the chain, which takes a few seconds after you open it. Your cards appear on their own."
        tone="stamp"
      >
        <Waiting label="Catching up" />
      </Notice>
    );
  }

  if (status === "signing-in") {
    return (
      <Notice
        label="One signature"
        title="Signing you in"
        body="Vango asks your wallet to sign once so it knows which cards are yours. Nothing is sent."
        tone="stamp"
      >
        <Waiting label="Confirm in Nimiq Pay" />
      </Notice>
    );
  }

  if (status === "cancelled") {
    return (
      <Notice
        label="Cancelled"
        title="No harm done"
        body="You closed the signature, so Vango cannot see your cards yet. Nothing left your wallet."
      >
        <Button onClick={onRetry}>Try again</Button>
      </Notice>
    );
  }

  return (
    <Notice
      label="Not signed in"
      title="That did not work"
      body={error ?? "Vango could not reach your wallet."}
      tone="bad"
    >
      <Button onClick={onRetry}>Try again</Button>
    </Notice>
  );
}

function OutsidePay({ host }: { host: string }) {
  return (
    <Notice
      label="Nimiq Pay"
      title="Vango runs inside Nimiq Pay"
      body="Your cards live in your wallet, so Vango opens from Nimiq Pay. One tap and every card you hold is here."
    >
      <OpenInPay host={host} />
    </Notice>
  );
}
