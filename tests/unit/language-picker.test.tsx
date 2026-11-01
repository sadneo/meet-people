import { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { LanguagePicker } from '../../src/ui/LanguagePicker';

afterEach(cleanup);
function Picker({ initial = [] }: { initial?: string[] }) {
  const [languages, setLanguages] = useState(initial);
  return <LanguagePicker value={languages} change={setLanguages}/>;
}
it('searches suggestions and supports keyboard selection without submitting the form', () => {
  const submit = vi.fn(event => event.preventDefault());
  render(<form onSubmit={submit}><Picker/></form>);
  const input = screen.getByRole('combobox', { name: 'Languages' });
  fireEvent.change(input, { target: { value: 'span' } });
  expect(screen.getByRole('option', { name: 'Spanish', exact: true })).toBeTruthy();
  fireEvent.keyDown(input, { key: 'Enter' });
  expect(screen.getByRole('button', { name: 'Remove Spanish' })).toBeTruthy();
  expect(submit).not.toHaveBeenCalled();
  expect(input.getAttribute('aria-expanded')).toBe('false');
});
it('supports custom labels and removal, without offering normalized duplicates', () => {
  render(<Picker initial={['English']}/>);
  const input = screen.getByRole('combobox', { name: 'Languages' });
  fireEvent.change(input, { target: { value: ' english ' } });
  expect(screen.queryByRole('option')).toBeNull();
  fireEvent.change(input, { target: { value: '  Lëtzebuergesch  ' } });
  fireEvent.click(screen.getByRole('option', { name: 'Add “Lëtzebuergesch”' }));
  expect(screen.getByRole('button', { name: 'Remove Lëtzebuergesch' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Remove English' }));
  expect(screen.queryByRole('button', { name: 'Remove English' })).toBeNull();
});
it('keeps custom labels within the existing profile text limit', () => {
  render(<Picker/>);
  const long = 'x'.repeat(61);
  fireEvent.change(screen.getByRole('combobox'), { target: { value: long } });
  fireEvent.click(screen.getByRole('option', { name: `Add “${long}”` }));
  expect(screen.getByRole('alert').textContent).toContain('at most 60');
  expect(screen.queryByRole('button', { name: `Remove ${long}` })).toBeNull();
});
it('enforces the twelve-language limit while allowing removal', () => {
  const languages = ['English', 'Spanish', 'French', 'German', 'Italian', 'Arabic', 'Hindi', 'Urdu', 'Korean', 'Japanese', 'Mandarin', 'Cantonese'];
  render(<Picker initial={languages}/>);
  expect((screen.getByRole('combobox') as HTMLInputElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Remove French' }));
  expect((screen.getByRole('combobox') as HTMLInputElement).disabled).toBe(false);
});
it('supports arrow navigation and Escape without changing saved selections', () => {
  render(<Picker/>);
  const input = screen.getByRole('combobox');
  fireEvent.change(input, { target: { value: 'a' } });
  fireEvent.focus(input);
  const first = input.getAttribute('aria-activedescendant');
  fireEvent.keyDown(input, { key: 'ArrowDown' });
  expect(input.getAttribute('aria-activedescendant')).not.toBe(first);
  fireEvent.keyDown(input, { key: 'Escape' });
  expect(screen.queryByRole('listbox')).toBeNull();
  expect(screen.queryByRole('list', { name: 'Selected languages' })).toBeNull();
});
