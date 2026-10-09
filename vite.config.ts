import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({plugins:[react()],base:'./',build:{assetsInlineLimit:0},server:{port:5180,strictPort:true},preview:{port:4180,strictPort:true}});
