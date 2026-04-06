// store/authStore.js
// Global auth state using Zustand.
// Stores: user object and a loading flag.

import { create } from 'zustand';
import { useTimeStore } from './timeStore';

const useAuthStore = create((set) => ({
  user: null,         // Firebase user object
  loading: true,      // True while checking auth state on startup

  setUser: (user) => {
    // When user is set, also set the current user in timeStore for data isolation
    if (user?.uid) {
      useTimeStore.getState().setCurrentUser(user.uid);
    }
    set({ user });
  },
  setLoading: (loading) => set({ loading }),
  clearUser: () => {
    // Clear user data from timeStore when logging out
    useTimeStore.getState().setCurrentUser(null);
    set({ user: null });
  },
}));

export default useAuthStore;
