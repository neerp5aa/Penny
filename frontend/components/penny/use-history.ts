"use client";

import { useEffect, useState } from "react";
import { historyApi, type History } from "@/lib/api";
import { describeError } from "./shared";

/**
 * Loads monthly history for [start, end]. The last successful result stays available while a
 * new range loads, so charts can hold their frame (dimmed) instead of flashing a skeleton.
 * `version` changes after any edit so history refetches.
 */
export function useHistory(start: string, end: string, version: number) {
  const key = `${start}|${end}|${version}`;
  const [data, setData] = useState<History | null>(null);
  const [outcome, setOutcome] = useState<{ key: string; error: string | null } | null>(null);

  useEffect(() => {
    let active = true;
    historyApi.load(start, end)
      .then((result) => { if (active) { setData(result); setOutcome({ key, error: null }); } })
      .catch((reason: unknown) => { if (active) setOutcome({ key, error: describeError(reason, "History couldn’t load").detail }); });
    return () => { active = false; };
  }, [start, end, key]);

  return { data, loading: outcome?.key !== key, error: outcome?.key === key ? outcome.error : null };
}
