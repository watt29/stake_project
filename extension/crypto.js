/**
 * VaultCrypto: Web Crypto API helper for PBKDF2 key derivation and AES-256-GCM encryption
 */
const VaultCrypto = {
  // Convert ArrayBuffer to Base64
  bufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
  },

  // Convert Base64 to ArrayBuffer
  base64ToBuffer(base64) {
    const binary = window.atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  },

  // Generate random salt (16 bytes)
  generateSalt() {
    const salt = window.crypto.getRandomValues(new Uint8Array(16));
    return this.bufferToBase64(salt);
  },

  // Derive AES-GCM Key using PBKDF2
  async deriveKey(masterPassword, saltBase64) {
    const enc = new TextEncoder();
    const keyMaterial = await window.crypto.subtle.importKey(
      "raw",
      enc.encode(masterPassword),
      { name: "PBKDF2" },
      false,
      ["deriveBits", "deriveKey"]
    );

    const salt = this.base64ToBuffer(saltBase64);

    return window.crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt: salt,
        iterations: 100000,
        hash: "SHA-256"
      },
      keyMaterial,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"]
    );
  },

  // Hash password with salt to verify master password match
  async hashMasterPassword(masterPassword, saltBase64) {
    const enc = new TextEncoder();
    const salt = new Uint8Array(this.base64ToBuffer(saltBase64));
    const passBytes = enc.encode(masterPassword);
    
    // Combine salt + pass
    const combined = new Uint8Array(salt.length + passBytes.length);
    combined.set(salt, 0);
    combined.set(passBytes, salt.length);

    const hashBuffer = await window.crypto.subtle.digest("SHA-256", combined);
    return this.bufferToBase64(hashBuffer);
  },

  // Encrypt string with derived key
  async encrypt(plaintext, key) {
    const enc = new TextEncoder();
    const iv = window.crypto.getRandomValues(new Uint8Array(12)); // 96-bit IV for AES-GCM

    const cipherBuffer = await window.crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv: iv
      },
      key,
      enc.encode(plaintext)
    );

    return {
      ciphertext: this.bufferToBase64(cipherBuffer),
      iv: this.bufferToBase64(iv)
    };
  },

  // Decrypt ciphertext with derived key
  async decrypt(encryptedObj, key) {
    const dec = new TextDecoder();
    const cipherBuffer = this.base64ToBuffer(encryptedObj.ciphertext);
    const ivBuffer = this.base64ToBuffer(encryptedObj.iv);

    const decryptedBuffer = await window.crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: new Uint8Array(ivBuffer)
      },
      key,
      cipherBuffer
    );

    return dec.decode(decryptedBuffer);
  }
};
