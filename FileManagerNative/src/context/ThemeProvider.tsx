import React, { useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ThemeContext, darkTheme, lightTheme } from '../theme';

export const ThemeProvider = ({ children }: { children: React.ReactNode }) => {
  const [theme, setThemeState] = useState(darkTheme);

  useEffect(() => {
    (async () => {
      const stored = await AsyncStorage.getItem('theme');
      if (stored === 'light') setThemeState(lightTheme);
      else setThemeState(darkTheme);
    })();
  }, []);

  const setTheme = async (newTheme: typeof darkTheme) => {
    setThemeState(newTheme);
    await AsyncStorage.setItem('theme', newTheme === lightTheme ? 'light' : 'dark');
  };

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};
