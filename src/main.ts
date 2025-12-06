import { createApp } from 'vue'
import App from './App.vue'
import { Buffer } from 'buffer'
window.Buffer = Buffer // Polyfill Buffer for bitcoinjs-lib

createApp(App).mount('#app')
