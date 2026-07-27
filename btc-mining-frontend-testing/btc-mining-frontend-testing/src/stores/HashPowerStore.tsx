import React, { createContext, useContext, useEffect, useState } from "react";
import { useAuth } from "../auth/AuthProvider";

type HashPowerContextType = {
  hashPower: number;
  setHashPower: (val: number) => void;
  addHashPower: (val: number) => void;
  resetHashPower: () => void;
  /** From API `mining_details.purchasedHashpower`; >0 means user may exceed free cap. */
  purchasedHashpowerGh: number;
  setPurchasedHashpowerGh: (val: number) => void;
  /** null = not yet known, true = mining is active, false = mining is not active */
  isMiningActive: boolean | null;
  setIsMiningActive: (val: boolean | null) => void;
};

const HashPowerContext = createContext<HashPowerContextType | undefined>(undefined);

export const HashPowerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [hashPower, setHashPowerState] = useState(0);
  const [purchasedHashpowerGh, setPurchasedHashpowerGhState] = useState(0);
  const [isMiningActive, setIsMiningActiveState] = useState<boolean | null>(null);
  const { user } = useAuth();

  // Reset hashpower on logout and whenever the account changes so we never show
  // the previous user's Gh/s until USERMININGDETAILS has loaded.
  useEffect(() => {
    if (!user) {
      setHashPowerState(0);
      setPurchasedHashpowerGhState(0);
      setIsMiningActiveState(null);
      return;
    }
    setHashPowerState(0);
    setPurchasedHashpowerGhState(0);
    setIsMiningActiveState(null);
  }, [user?.id]);

  const setHashPower = (val: number) => setHashPowerState(val);
  const addHashPower = (val: number) => setHashPowerState((prev) => prev + val);

  const resetHashPower = () => {
    setHashPowerState(0);
  };

  const setPurchasedHashpowerGh = (val: number) => {
    const n = typeof val === 'number' && Number.isFinite(val) ? val : 0;
    setPurchasedHashpowerGhState(Math.max(0, n));
  };

  const setIsMiningActive = (val: boolean | null) => setIsMiningActiveState(val);

  return (
    <HashPowerContext.Provider
      value={{
        hashPower,
        setHashPower,
        addHashPower,
        resetHashPower,
        purchasedHashpowerGh,
        setPurchasedHashpowerGh,
        isMiningActive,
        setIsMiningActive,
      }}
    >
      {children}
    </HashPowerContext.Provider>
  );
};

export const useHashPower = () => {
  const ctx = useContext(HashPowerContext);
  if (!ctx) throw new Error("useHashPower must be used inside HashPowerProvider");
  return ctx;
};
