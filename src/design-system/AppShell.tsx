import { Outlet } from 'react-router'
import BottomNav from './BottomNav'

function AppShell() {
  return (
    <div className="min-h-dvh bg-page text-ink [padding-left:var(--safe-area-left)] [padding-right:var(--safe-area-right)] [padding-top:var(--safe-area-top)]">
      <div className="mx-auto min-h-[calc(100dvh-var(--safe-area-top))] w-full max-w-[42rem] bg-page sm:border-x sm:border-line">
        <main className="px-5 pt-6 pb-[calc(var(--navigation-height)+var(--safe-area-bottom)+1.5rem)] sm:px-8 sm:pt-8">
          <Outlet />
        </main>
        <BottomNav />
      </div>
    </div>
  )
}

export default AppShell
