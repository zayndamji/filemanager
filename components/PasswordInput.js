'use client';

import { usePasswordContext } from '@/context/PasswordContext';

export default function PasswordInput() {
  const { password, setPassword } = usePasswordContext();
  return (
    <div className="my-4 max-w-4xl mx-auto">
      <input
        type="password"
        placeholder="Enter password"
        value={password}
        onChange={e => setPassword(e.target.value)}
        className="block border p-2 w-full"
        autoComplete="new-password"
      />
    </div>
  );
}