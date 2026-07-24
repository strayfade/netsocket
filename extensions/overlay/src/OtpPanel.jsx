import { useCallback, useEffect, useRef, useState } from "react";
import {
  formatOtpCode,
  millisRemaining,
  parseOtpAccounts,
  periodBucket,
  TOTP_PERIOD_MILLIS,
  withFreshCodes,
} from "./totp.js";
import { loadOtpAccounts, saveOtpAccounts } from "./otpStore.js";

function TimerRing({ millis }) {
  const radius = 7;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.max(0, Math.min(1, millis / TOTP_PERIOD_MILLIS));
  const offset = circumference * (1 - progress);

  return (
    <svg className="otp-timer" viewBox="0 0 18 18" aria-hidden="true">
      <circle className="otp-timer-track" cx="9" cy="9" r={radius} />
      <circle
        className="otp-timer-progress"
        cx="9"
        cy="9"
        r={radius}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
      />
    </svg>
  );
}

export default function OtpPanel({ api, connected, phase, onNotice, embedded = false }) {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [emptyMessage, setEmptyMessage] = useState("");
  const [millis, setMillis] = useState(millisRemaining());
  const [dragIndex, setDragIndex] = useState(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);

  const accountsRef = useRef([]);
  const lastBucketRef = useRef(periodBucket());
  const draggingRef = useRef(false);
  const orderDirtyRef = useRef(false);
  const reorderPendingRef = useRef(false);
  const loadingRef = useRef(false);
  const suppressClickRef = useRef(false);

  useEffect(() => {
    accountsRef.current = accounts;
  }, [accounts]);

  const applyAccounts = useCallback(async (next) => {
    const withCodes = await withFreshCodes(next);
    setAccounts(withCodes);
    lastBucketRef.current = periodBucket();
    setMillis(millisRemaining());
    setEmptyMessage(
      withCodes.length === 0
        ? connected
          ? "No OTP accounts yet. Add them in the netsocket dashboard or import from the Android app."
          : "No cached OTP accounts. Connect to the host to sync."
        : ""
    );
  }, [connected]);

  const persistOrder = useCallback(async () => {
    const current = accountsRef.current;
    saveOtpAccounts(current);
    if (!current.length) return;

    if (!connected) {
      orderDirtyRef.current = true;
      return;
    }
    if (reorderPendingRef.current) {
      orderDirtyRef.current = true;
      return;
    }

    reorderPendingRef.current = true;
    const result = await api.reorderOtpAccounts?.(current.map((account) => account.key));
    reorderPendingRef.current = false;

    if (result?.ok) {
      orderDirtyRef.current = false;
    } else {
      orderDirtyRef.current = true;
      onNotice?.(result?.error || "Failed to save OTP order.");
    }
  }, [api, connected, onNotice]);

  const refreshAccounts = useCallback(
    async ({ forceHost = false } = {}) => {
      const local = loadOtpAccounts();
      if (local.length) {
        await applyAccounts(local);
      }

      if (!connected) {
        if (!local.length) {
          setEmptyMessage("Connect to the host to load OTP accounts.");
          setAccounts([]);
        }
        setLoading(false);
        return;
      }

      if (orderDirtyRef.current) {
        const keys = accountsRef.current.map((account) => account.key);
        if (keys.length && !reorderPendingRef.current) {
          reorderPendingRef.current = true;
          const reorderResult = await api.reorderOtpAccounts?.(keys);
          reorderPendingRef.current = false;
          if (reorderResult?.ok) {
            orderDirtyRef.current = false;
          }
        } else if (!keys.length) {
          orderDirtyRef.current = false;
        }
      }

      loadingRef.current = true;
      if (!local.length || forceHost) setLoading(!local.length);

      const result = await api.getOtpAccounts?.();
      loadingRef.current = false;
      setLoading(false);

      if (!result?.ok) {
        if (!accountsRef.current.length) {
          setEmptyMessage(result?.error || "Failed to load OTP accounts.");
        }
        return;
      }

      const parsed = parseOtpAccounts(result.data);
      saveOtpAccounts(parsed);
      await applyAccounts(parsed);
      orderDirtyRef.current = false;
    },
    [api, applyAccounts, connected]
  );

  useEffect(() => {
    refreshAccounts({ forceHost: connected });
  }, [connected, refreshAccounts]);

  useEffect(() => {
    let alive = true;
    const id = window.setInterval(async () => {
      if (!alive || draggingRef.current) return;
      const remaining = millisRemaining();
      setMillis(remaining);
      const bucket = periodBucket();
      if (bucket !== lastBucketRef.current) {
        lastBucketRef.current = bucket;
        const refreshed = await withFreshCodes(accountsRef.current);
        if (alive) setAccounts(refreshed);
      }
    }, 50);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, []);

  const copyCode = async (account) => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    const code = String(account.code || "").replace(/\s+/g, "");
    if (!code || code === "------") return;
    const result = await api.writeClipboard?.(code);
    if (result?.ok === false) {
      onNotice?.(result.error || "Failed to copy code.");
      return;
    }
    onNotice?.("Copied");
  };

  const onDragStart = (index) => {
    draggingRef.current = true;
    setDragIndex(index);
  };

  const onDragOver = (event, index) => {
    event.preventDefault();
    if (dragOverIndex !== index) setDragOverIndex(index);
  };

  const onDrop = async (index) => {
    const from = dragIndex;
    setDragIndex(null);
    setDragOverIndex(null);
    draggingRef.current = false;
    if (from == null || from === index) return;

    suppressClickRef.current = true;
    setAccounts((prev) => {
      if (from < 0 || from >= prev.length || index < 0 || index >= prev.length) {
        return prev;
      }
      const next = [...prev];
      const [item] = next.splice(from, 1);
      next.splice(index, 0, item);
      accountsRef.current = next;
      return next;
    });

    await persistOrder();
  };

  const onDragEnd = () => {
    if (draggingRef.current) {
      suppressClickRef.current = true;
    }
    draggingRef.current = false;
    setDragIndex(null);
    setDragOverIndex(null);
  };

  const body = (
    <>
      {loading ? (
        <div className="otp-loading">
          <span className="command-loader" aria-hidden="true" />
        </div>
      ) : null}

      {accounts.length === 0 && !loading ? (
        <div className="otp-empty">{emptyMessage || "No OTP accounts."}</div>
      ) : (
        <ul className="otp-list modern-scrollbar">
          {accounts.map((account, index) => {
            const issuer = account.issuer || account.key;
            const label = account.account;
            return (
              <li
                key={account.key}
                className={[
                  "otp-row",
                  dragIndex === index ? "dragging" : "",
                  dragOverIndex === index ? "drag-over" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                draggable
                onDragStart={() => onDragStart(index)}
                onDragOver={(event) => onDragOver(event, index)}
                onDrop={() => onDrop(index)}
                onDragEnd={onDragEnd}
                onClick={() => copyCode(account)}
                title="Click to copy · Drag to reorder"
              >
                <div className="otp-row-top">
                  <span className="otp-issuer">{issuer}</span>
                  {label ? <span className="otp-account">{label}</span> : null}
                </div>
                <div className="otp-row-bottom">
                  <TimerRing millis={millis} />
                  <span className="otp-code">{formatOtpCode(account.code)}</span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );

  if (embedded) {
    return <div className="otp-embedded">{body}</div>;
  }

  return (
    <section className={`overlay-panel overlay-panel--elevated otp-card phase-${phase}`}>
      {body}
    </section>
  );
}
