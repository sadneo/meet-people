import { useId, useState, type InputHTMLAttributes } from 'react'
import { Icon } from './common'

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & { label: string }

export function PasswordField({ label, id, ...input }: Props) {
  const generated = useId(), control = id ?? generated
  const [visible, setVisible] = useState(false)
  return <div className="password-field">
    <label htmlFor={control}>{label}</label>
    <div className="password-input-control">
      <input {...input} id={control} type={visible ? 'text' : 'password'} autoCapitalize="none" autoCorrect="off" spellCheck={false}/>
      <button className="password-visibility-toggle" type="button" aria-label={`${visible ? 'Hide' : 'Show'} ${label.toLowerCase()}`} aria-controls={control} disabled={input.disabled} onClick={() => setVisible(value => !value)}>
        <Icon name={visible ? 'EyeOff' : 'Eye'}/>
      </button>
    </div>
  </div>
}
