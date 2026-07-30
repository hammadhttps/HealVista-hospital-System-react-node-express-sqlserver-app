import { Outlet } from "react-router-dom";
import Sidebar from "./Layout/Sidebar";
import Header from "./Layout/Header";

export function AppShell() {
  return (
    <div className="min-h-screen flex bg-gray-100">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <Header />
        <main className="flex-1 p-6 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
