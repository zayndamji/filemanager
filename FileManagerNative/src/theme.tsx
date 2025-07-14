// Global theme definitions
export const darkTheme = {
  background: '#181A20',
  surface: '#23262F',
  card: '#23262F',
  border: '#2C2F36',
  text: '#F5F6FA',
  textSecondary: '#A5A7B2',
  accent: '#007AFF',
  accentSecondary: '#34C759',
  error: '#FF4444',
  inputBackground: '#23262F',
  inputBorder: '#393C44',
  chipBackground: '#007AFF',
  chipText: '#F5F6FA',
  disabled: '#44474F',
  modalBackground: '#23262F',
  shadow: '#000',
};

export const lightTheme = {
  background: '#F5F6FA',
  surface: '#FFFFFF',
  card: '#FFFFFF',
  border: '#E0E0E0',
  text: '#181A20',
  textSecondary: '#44474F',
  accent: '#007AFF',
  accentSecondary: '#34C759',
  error: '#FF4444',
  inputBackground: '#FFFFFF',
  inputBorder: '#E0E0E0',
  chipBackground: '#007AFF',
  chipText: '#181A20',
  disabled: '#A5A7B2',
  modalBackground: '#FFFFFF',
  shadow: '#AAA',
};

import React, { useState } from 'react';
export const ThemeContext = React.createContext({
  theme: darkTheme,
  setTheme: (_theme: typeof darkTheme) => {},
});

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setTheme] = useState(darkTheme);
  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};
