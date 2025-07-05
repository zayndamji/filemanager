'use client';

import { usePasswordContext } from '@/context/PasswordContext';

export default function PasswordInput() {
  const { password, setPassword } = usePasswordContext();
  return (
    <input
      type="password"
      placeholder="Enter password"
      value={password}
      onChange={e => setPassword(e.target.value)}
      className="border m-0 p-2 flex-grow"
      autoComplete="new-password"
    />
  );
}