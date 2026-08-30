import { ReactNode } from 'react';

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    // h-screen (100vh) is taller than the visible area on mobile browsers,
    // which pushed the composer under the address bar. overflow-x-hidden is a
    // backstop: if any single pane ever overflows again, it clips instead of
    // making the whole document pannable and forcing the user into desktop view.
    <div
      className="bg-[#000000] text-white font-sans selection:bg-gray-200 w-full max-w-full overflow-hidden overflow-x-hidden"
      style={{ height: '100dvh' }}
    >
      {children}
    </div>
  );
}