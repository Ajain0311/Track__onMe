// store/authStore.js
// Global auth state using Zustand.
// Stores the Supabase user object and a loading flag.

import { create } from 'zustand';
import { useTimeStore } from './timeStore';

const useAuthStore = create((set) => ({
  user: null,
  loading: true,
  isAdmin: false,

  setUser: (user) => {
    if (user?.id) {
      useTimeStore.getState().setCurrentUser(user.id);
    }
    set({ user });
  },

  setLoading: (loading) => set({ loading }),

  setIsAdmin: (isAdmin) => set({ isAdmin }),

  clearUser: () => {
    useTimeStore.getState().setCurrentUser(null);
    set({ user: null, isAdmin: false });
  },
}));

export default useAuthStore;
