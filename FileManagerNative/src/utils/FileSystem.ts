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
    await writable.write(data);
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
      const arrayBuffer = await file.arrayBuffer();
      return btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
    } else {
      return await file.text();
    }
  } else {
    return await RNFS.readFile(pathOrName, encoding);
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
