import type { SVGProps } from 'react'
import { NavLink } from 'react-router'

type IconProps = SVGProps<SVGSVGElement>

function HomeIcon(props: IconProps) {
  return <svg aria-hidden="true" fill="none" viewBox="0 0 24 24" {...props}><path d="m4 11 8-7 8 7v9h-6v-6h-4v6H4z" stroke="currentColor" strokeLinejoin="round" strokeWidth="2" /></svg>
}

function EventsIcon(props: IconProps) {
  return <svg aria-hidden="true" fill="none" viewBox="0 0 24 24" {...props}><path d="M5 5h14v15H5zM8 3v4m8-4v4M5 10h14" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" /></svg>
}

function ChatsIcon(props: IconProps) {
  return <svg aria-hidden="true" fill="none" viewBox="0 0 24 24" {...props}><path d="M4 5h16v12H9l-5 4z" stroke="currentColor" strokeLinejoin="round" strokeWidth="2" /></svg>
}

function ProfileIcon(props: IconProps) {
  return <svg aria-hidden="true" fill="none" viewBox="0 0 24 24" {...props}><circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="2" /><path d="M5 21c0-4 3-7 7-7s7 3 7 7" stroke="currentColor" strokeLinecap="round" strokeWidth="2" /></svg>
}

const destinations = [
  { label: 'Home', path: '/', icon: HomeIcon },
  { label: 'Events', path: '/events', icon: EventsIcon },
  { label: 'Chats', path: '/chats', icon: ChatsIcon },
  { label: 'Profile', path: '/profile', icon: ProfileIcon },
]

function BottomNav() {
  return (
    <nav
      aria-label="Primary navigation"
      className="fixed bottom-0 left-1/2 z-10 w-full max-w-[42rem] -translate-x-1/2 border-x border-t border-line bg-surface [padding-bottom:var(--safe-area-bottom)] [padding-left:var(--safe-area-left)] [padding-right:var(--safe-area-right)]"
    >
      <div className="mx-auto grid h-(--navigation-height) max-w-[42rem] grid-cols-4">
        {destinations.map(({ icon: Icon, label, path }) => (
          <NavLink
            className={({ isActive }) => `relative flex min-h-11 flex-col items-center justify-center gap-1 px-1 text-navigation focus-visible:z-10 focus-visible:outline-3 focus-visible:outline-offset-[-3px] focus-visible:outline-focus ${isActive ? 'text-pine' : 'text-ink'}`}
            end={path === '/'}
            key={path}
            to={path}
          >
            {({ isActive }) => (
              <>
                {isActive && <span aria-hidden="true" className="absolute top-0 h-1 w-8 rounded-b-full bg-pine" />}
                <Icon className="size-6" />
                <span>{label}</span>
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}

export default BottomNav
