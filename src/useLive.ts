// Subscribe a component to an async query and re-run it whenever the data
// changes (any mutation calls revalidate()) or the dependencies change. This
// replaces Dexie's liveQuery now that data comes from the server API.

import { useEffect, useState } from "react";
import { onRevalidate } from "./bus";

export function useLive<T>(query: () => Promise<T>, deps: unknown[], initial: T): T {
  const [value, setValue] = useState<T>(initial);

  useEffect(() => {
    let active = true;
    const run = () => {
      query()
        .then((v) => { if (active) setValue(v); })
        .catch((e) => { if (active) console.error("useLive query failed", e); });
    };
    run();
    const off = onRevalidate(run);
    return () => { active = false; off(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return value;
}
