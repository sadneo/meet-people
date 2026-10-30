import { useId, useRef, useState } from 'react';
import { ProfileFactsSchema, profileLanguageKey } from '../../shared/profile-details';
import { languageChoices } from '../features/account/language-choices';
import { ErrorMessage } from './common';

export function LanguagePicker({ value, change }: { value: string[]; change: (languages: string[]) => void }) {
  const id = useId(), input = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState(''), [open, setOpen] = useState(false), [active, setActive] = useState(0), [error, setError] = useState('');
  const key = profileLanguageKey(query), selected = new Set(value.map(profileLanguageKey));
  const suggestions: { label: string; custom: boolean }[] = languageChoices
    .filter(language => !selected.has(profileLanguageKey(language)) && profileLanguageKey(language).includes(key))
    .sort((a, b) => Number(!profileLanguageKey(a).startsWith(key)) - Number(!profileLanguageKey(b).startsWith(key)))
    .slice(0, 8).map(label => ({ label, custom: false }));
  if (key && !selected.has(key) && !languageChoices.some(language => profileLanguageKey(language) === key))
    suggestions.push({ label: query.trim(), custom: true });
  const expanded = open && key.length > 0 && value.length < 12 && suggestions.length > 0;
  function add(language: string) {
    const next = [...value, language];
    const parsed = ProfileFactsSchema.shape.languages.safeParse(next);
    if (!parsed.success) { setError(parsed.error.issues[0].message); return; }
    change(parsed.data);
    setQuery(''); setActive(0); setError('');
    input.current?.focus();
    setOpen(false);
  }
  return <div className="language-picker" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
    <label htmlFor={id}>Languages</label>
    {value.length > 0 && <ul className="language-chips" aria-label="Selected languages">{value.map((language, index) => <li key={language}>
      <span>{language}</span><button type="button" aria-label={`Remove ${language}`} onClick={() => { change(value.filter((_, i) => i !== index)); setError(''); input.current?.focus(); setOpen(false); }}>×</button>
    </li>)}</ul>}
    <div className="language-search">
      <input id={id} ref={input} role="combobox" aria-autocomplete="list" aria-expanded={expanded} aria-controls={`${id}-options`} aria-activedescendant={expanded ? `${id}-option-${active}` : undefined}
        aria-describedby={`${id}-hint`} autoComplete="off" placeholder={value.length >= 12 ? 'Language limit reached' : 'Search or add a language'} maxLength={120} disabled={value.length >= 12}
        value={query} onFocus={() => setOpen(true)} onChange={event => { setQuery(event.target.value); setOpen(true); setActive(0); setError(''); }}
        onKeyDown={event => {
          if (event.nativeEvent.isComposing) return;
          if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setOpen(false); }
          else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setOpen(true); setActive(index => !expanded ? 0 : (index + (event.key === 'ArrowDown' ? 1 : -1) + suggestions.length) % suggestions.length); }
          else if (event.key === 'Enter') { event.preventDefault(); if (expanded && suggestions[active]) add(suggestions[active].label); }
        }}/>
      {expanded && <ul id={`${id}-options`} role="listbox" aria-label="Language suggestions" className="language-options">{suggestions.map((option, index) => <li key={option.label} role="presentation">
        <button type="button" role="option" id={`${id}-option-${index}`} aria-selected={active === index} tabIndex={-1} onMouseDown={event => event.preventDefault()} onMouseMove={() => setActive(index)} onClick={() => add(option.label)}>
          {option.custom ? <>Add “{option.label}”</> : option.label}
        </button>
      </li>)}</ul>}
    </div>
    <p className="account-note" id={`${id}-hint`}>Choose up to 12 languages. Can’t find yours? Type its name to add it.</p>
    <span className="sr-only" role="status">{value.length} {value.length === 1 ? 'language' : 'languages'} selected.</span>
    <ErrorMessage>{error}</ErrorMessage>
  </div>;
}
