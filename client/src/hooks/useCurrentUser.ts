import { useEffect, useState } from 'react';
import type { AppUser } from '../api/auth';
import { me } from '../api/auth';

export type AuthState =
  | { status: 'loading'; user: null }
  | { status: 'anonymous'; user: null }
  | { status: 'authenticated'; user: AppUser };

export function useCurrentUser(): AuthState {
  const [state, setState] = useState<AuthState>({
    status: 'loading',
    user: null,
  });

  useEffect(() => {
    let cancelled = false;
    me()
      .then((user) => {
        if (!cancelled) {
          setState({ status: 'authenticated', user });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setState({ status: 'anonymous', user: null });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
