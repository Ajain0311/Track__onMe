// store/authStore.js
// Global auth state using Zustand.
// Stores the Supabase user object and a loading flag.

import { create } from 'zustand';
import { useTimeStore } from './timeStore';

const useAuthStore = create((set) => ({
  user: null,     // Supabase user object (user.id, user.email, ...)
  loading: true,  // True while checking auth state on startup

  setUser: (user) => {
    // When user is set, load their isolated time data
    if (user?.id) {
      useTimeStore.getState().setCurrentUser(user.id);
    }
    set({ user });
  },

  setLoading: (loading) => set({ loading }),

  clearUser: () => {
    useTimeStore.getState().setCurrentUser(null);
    set({ user: null });
  },
}));

export default useAuthStore;
