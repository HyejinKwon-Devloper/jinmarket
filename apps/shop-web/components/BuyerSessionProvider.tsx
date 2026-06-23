"use client";

import { createContext, useContext, useEffect, useState } from "react";
import type { SessionUser } from "@jinmarket/shared";

import { fetchCurrentUser, subscribeBuyerProfileUpdated } from "../lib/api";

type BuyerSessionContextValue = {
  hasError: boolean;
  isResolved: boolean;
  refreshUser: () => Promise<void>;
  setUser: (user: SessionUser | null) => void;
  user: SessionUser | null;
};

const BuyerSessionContext = createContext<BuyerSessionContextValue | null>(null);

export function BuyerSessionProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [user, setUserState] = useState<SessionUser | null>(null);
  const [hasError, setHasError] = useState(false);
  const [isResolved, setIsResolved] = useState(false);

  function resolveUser(nextUser: SessionUser | null) {
    setUserState(nextUser);
    setHasError(false);
    setIsResolved(true);
  }

  function markSessionError() {
    setHasError(true);
    setIsResolved(true);
  }

  async function refreshUser() {
    setHasError(false);
    setIsResolved(false);

    try {
      const nextUser = await fetchCurrentUser();
      resolveUser(nextUser);
    } catch {
      markSessionError();
    }
  }

  useEffect(() => {
    let isMounted = true;

    void fetchCurrentUser()
      .then((nextUser) => {
        if (!isMounted) {
          return;
        }

        resolveUser(nextUser);
      })
      .catch(() => {
        if (!isMounted) {
          return;
        }

        markSessionError();
      });

    const unsubscribe = subscribeBuyerProfileUpdated((nextUser) => {
      if (!isMounted) {
        return;
      }

      resolveUser(nextUser);
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  return (
    <BuyerSessionContext.Provider
      value={{
        hasError,
        isResolved,
        refreshUser,
        setUser: resolveUser,
        user,
      }}
    >
      {children}
    </BuyerSessionContext.Provider>
  );
}

export function useBuyerSession() {
  const context = useContext(BuyerSessionContext);

  if (!context) {
    throw new Error("useBuyerSession must be used within BuyerSessionProvider.");
  }

  return context;
}
