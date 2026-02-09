import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Vite configuration for the Smartdash project. This configuration
// simply enables the React plugin. You can extend it with additional
// settings as needed (for example, to customize the build output).
export default defineConfig({
  plugins: [react()],

  server: {
    host: true,          // erlaubt externe Verbindungen (nicht nur localhost)
    port: 5173,          // dein Port
    allowedHosts: [
      'smartdash.dynv6.net',   // dein DynDNS Host erlauben
    ],
    strictPort: true,    // Vite bleibt auf diesem Port, kein Wechsel
  },

});
