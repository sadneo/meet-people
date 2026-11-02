import markup from './boot-markup.html?raw'
import './boot-loading.css'

/** Static, reviewed markup is shared with the mobile HTML bootstrap. No user data. */
export function BootLoading() {
  return <div dangerouslySetInnerHTML={{ __html: markup }} />
}
