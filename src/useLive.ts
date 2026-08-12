// Tiny hook that subscribes a component to a Dexie liveQuery so the UI updates
// automatically whenever the underlying data changes (e.g. an encounter is
// saved on another tab). Avoids pulling in the full dexie-react-hooks package.

import { useEffect, useState } from "react";
import { liveQuery } from "dexie";

export function useLive<T>(query: () => Promise<T>, deps: unknown[], initial: T): T {
  const [value, setValue] = useState<T>(initial);
  useEffect(() => {
    const sub = liveQuery(query).subscribe({
      next: (v) => setValue(v),
      error: (e) => console.error("liveQuery error", e),
    });
    return () => sub.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return value;
}
