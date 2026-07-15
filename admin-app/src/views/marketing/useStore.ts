/** React binding for the marketing store — re-renders on any store change. */
import { useEffect, useState } from "react";
import { subscribe, type MarketingState } from "./store";

export function useMarketing(): MarketingState {
  const [state, setState] = useState<MarketingState>(() => ({
    campaigns: [], coupons: [], abTests: [], referrals: [], promos: [], sendLog: [], suppress: [],
  }));
  useEffect(() => subscribe(setState), []);
  return state;
}
