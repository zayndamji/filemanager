'use client'

import { createContext, useContext, useState } from 'react';

const PasswordContext = createContext();

export function PasswordProvider({ children }) {
  const [password, setPassword] = useState('');
  
  return (
    <PasswordContext.Provider value={{ password, setPassword }}>
      {children}
    </PasswordContext.Provider>
  );
}

export function usePasswordContext() {
  return useContext(PasswordContext);
}