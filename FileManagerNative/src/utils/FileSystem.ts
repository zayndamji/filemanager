export const deleteFile = async (pathOrName: string) => {
  if (Platform.OS === 'web') {
    if (!webDirectoryHandle) throw new Error('No directory handle set');
    await webDirectoryHandle.removeEntry(pathOrName);
  } else {
    await RNFS.unlink(pathOrName);
  }
};
// Cross-platform file system abstraction
// Native: uses react-native-fs
// Web: uses File System Access API
import { Platform } from 'react-native';

// Native imports
let RNFS: any;
if (Platform.OS !== 'web') {
  RNFS = require('react-native-fs');
}

// Web handle will be set at runtime

// Use 'any' for FileSystemDirectoryHandle to avoid TS errors on native
let webDirectoryHandle: any = null;

export const setWebDirectoryHandle = (handle: any) => {
  webDirectoryHandle = handle;
};

export const getWebDirectoryHandle = () => webDirectoryHandle;

export const pickDirectory = async () => {
  if (Platform.OS === 'web') {
    // @ts-ignore: web-only API
    const win: any = window;
    if (win && typeof win.showDirectoryPicker === 'function') {
      const handle = await win.showDirectoryPicker();
      setWebDirectoryHandle(handle);
      return handle;
    } else {
      throw new Error('File System Access API not supported in this browser.');
    }
  } else {
    // On native, return the app document directory
    return RNFS.DocumentDirectoryPath;
  }
};

export const writeFile = async (pathOrName: string, data: Uint8Array | string, encoding: 'utf8' | 'base64' = 'utf8') => {
  if (Platform.OS === 'web') {
    if (!webDirectoryHandle) throw new Error('No directory handle set');
    const fileHandle = await webDirectoryHandle.getFileHandle(pathOrName, { create: true });
    const writable = await fileHandle.createWritable();
    
    if (encoding === 'base64' && typeof data === 'string') {
      // For base64 data on web, decode to binary first, then write as binary
      const binaryString = atob(data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      await writable.write(bytes);
    } else {
      await writable.write(data);
    }
    await writable.close();
  } else {
    await RNFS.writeFile(pathOrName, data, encoding);
  }
};

export const readFile = async (pathOrName: string, encoding: 'utf8' | 'base64' = 'utf8') => {
  if (Platform.OS === 'web') {
    if (!webDirectoryHandle) throw new Error('No directory handle set');
    const fileHandle = await webDirectoryHandle.getFileHandle(pathOrName);
    const file = await fileHandle.getFile();
    if (encoding === 'base64') {
      // For base64 reading on web, read as binary and convert to base64
      const arrayBuffer = await file.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      const binaryString = Array.from(bytes, byte => String.fromCharCode(byte)).join('');
      return btoa(binaryString);
    } else {
      return await file.text();
    }
  } else {
    return await RNFS.readFile(pathOrName, encoding);
  }
};

export const exists = async (pathOrName: string): Promise<boolean> => {
  if (Platform.OS === 'web') {
    if (!webDirectoryHandle) return false;
    try {
      await webDirectoryHandle.getFileHandle(pathOrName);
      return true;
    } catch {
      return false;
    }
  } else {
    return await RNFS.exists(pathOrName);
  }
};

export const unlink = async (pathOrName: string): Promise<void> => {
  if (Platform.OS === 'web') {
    if (!webDirectoryHandle) throw new Error('No directory handle set');
    await webDirectoryHandle.removeEntry(pathOrName);
  } else {
    await RNFS.unlink(pathOrName);
  }
};

export const readDir = async (path?: string): Promise<any[]> => {
  if (Platform.OS === 'web') {
    if (!webDirectoryHandle) throw new Error('No directory handle set');
    const files: any[] = [];
    for await (const entry of webDirectoryHandle.values()) {
      files.push({
        name: entry.name,
        isFile: () => entry.kind === 'file',
        isDirectory: () => entry.kind === 'directory'
      });
    }
    return files;
  } else {
    return await RNFS.readDir(path || RNFS.DocumentDirectoryPath);
  }
};

export const listFiles = async () => {
  if (Platform.OS === 'web') {
    if (!webDirectoryHandle) throw new Error('No directory handle set');
    const files: string[] = [];
    for await (const entry of webDirectoryHandle.values()) {
      if (entry.kind === 'file') files.push(entry.name);
    }
    return files;
  } else {
    return await RNFS.readDir(RNFS.DocumentDirectoryPath);
  }
};
