import { useCallback, useEffect, useState } from "react";
import { flushQueue, listFailed, listQueue } from "./queue";

export function useOnline(): boolean {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);
  return online;
}

export function useQueueStatus() {
  const [pending, setPending] = useState(0);
  const [failed, setFailed] = useState(0);
  const refresh = useCallback(async () => {
    setPending((await listQueue()).length);
    setFailed((await listFailed()).length);
  }, []);
  useEffect(() => {
    void refresh();
    window.addEventListener("queue-changed", refresh);
    return () => window.removeEventListener("queue-changed", refresh);
  }, [refresh]);
  return { pending, failed };
}

/** Sincroniza al abrir, al recuperar conexión y cada 30 s mientras haya algo pendiente. */
export function useAutoSync() {
  const online = useOnline();
  useEffect(() => {
    if (!online) return;
    const run = () => void flushQueue().catch(() => undefined);
    run();
    const t = setInterval(async () => {
      if ((await listQueue()).length > 0) run();
    }, 30_000);
    return () => clearInterval(t);
  }, [online]);
}
