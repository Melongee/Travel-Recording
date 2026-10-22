import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({ plugins: [react()], server: {host:'127.0.0.1',port:5173,strictPort:true,
  proxy: {'/api': {target:'http://127.0.0.1:8080',changeOrigin:true,configure(proxy) {
    // The development proxy remains loopback-only; production uses the JAR's same origin.
    proxy.on('proxyReq',(request) => { request.removeHeader('origin'); request.removeHeader('sec-fetch-site'); });
  }}}} });
