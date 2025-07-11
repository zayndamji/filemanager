const saltLength = 16;
const ivLength = 12;
const iterations = 100000;

export const generateUUID = () =>
  ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c =>
    (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
  );

const deriveKey = (() => {
  const cache = new Map();
  return async (password, salt) => {
    const cacheKey = password + Array.from(salt).join(',');
    if (cache.has(cacheKey)) return cache.get(cacheKey);

    const encoder = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      "raw", encoder.encode(password), { name: "PBKDF2" }, false, ["deriveKey"]
    );

    const key = await crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt,
        iterations,
        hash: "SHA-256",
      },
      keyMaterial,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"]
    );

    cache.set(cacheKey, key);
    return key;
  };
})();

export const encryptData = async (data, password) => {
  const salt = crypto.getRandomValues(new Uint8Array(saltLength));
  const iv = crypto.getRandomValues(new Uint8Array(ivLength));
  const key = await deriveKey(password, salt);
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, data.buffer || data);

  const output = new Uint8Array(saltLength + ivLength + encrypted.byteLength);
  output.set(salt, 0);
  output.set(iv, saltLength);
  output.set(new Uint8Array(encrypted), saltLength + ivLength);

  return output;
};

export const decryptData = async (data, password) => {
  const salt = data.slice(0, saltLength);
  const iv = data.slice(saltLength, saltLength + ivLength);
  const encrypted = data.slice(saltLength + ivLength);
  const key = await deriveKey(password, salt);
  return crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, encrypted.buffer || encrypted);
};
