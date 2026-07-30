import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface RecentDoctor {
  id: string;
  fullName: string;
  consultationFee: number;
  departments?: Array<{ department: { id: string; name: string; slug: string } }>;
  viewedAt: number;
}

interface UiState {
  sidebarOpen: boolean;
  toggleSidebar: () => void;
  recentDoctors: RecentDoctor[];
  addRecentDoctor: (doctor: RecentDoctor) => void;
  filterPage: Record<string, number>;
  setFilterPage: (key: string, page: number) => void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      sidebarOpen: true,
      toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),

      recentDoctors: [],
      addRecentDoctor: (doctor) =>
        set((s) => {
          const filtered = s.recentDoctors.filter((d) => d.id !== doctor.id);
          return { recentDoctors: [doctor, ...filtered].slice(0, 10) };
        }),

      filterPage: {},
      setFilterPage: (key, page) => set((s) => ({ filterPage: { ...s.filterPage, [key]: page } })),
    }),
    { name: "ui-store" },
  ),
);
