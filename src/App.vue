<template>
  <div class="app">
    <h1>Passkey Monacoin Wallet</h1>
    <p class="subtitle">Passkey を使ってモナコインのウォレットを生成するサンプルです</p>

    <section class="card">
      <h2>Passkey を登録</h2>
      <p>ブラウザやデバイスに新しい Passkey を登録します</p>
      <button class="btn primary" @click="signUp">Create Passkey</button>
    </section>

    <section class="card">
      <h2>ウォレットを開く</h2>
      <p>登録済みの Passkey を使ってウォレットを復元します</p>
      <button class="btn secondary" @click="signIn">Open Passkey Wallet</button>

      <div v-if="isSignedIn" class="wallet">
        <div class="field">
          <span class="label">Monacoin Address</span>
          <code class="value monospace break">{{ address }}</code>
        </div>
        <div class="field">
          <span class="label">Derivation Path</span>
          <code class="value monospace">{{ ADDRESS_PATH }}</code>
        </div>
        <div class="mnemonic-box">
          <button class="btn ghost" @click="toggleMnemonic">
            {{ isMnemonicOpen ? 'Hide Mnemonic' : 'Show Mnemonic' }}
          </button>
          <div v-if="isMnemonicOpen" class="mnemonic-list">
            <div v-for="(word, idx) in mnemonicWords" :key="idx" class="mnemonic-item monospace">
              <span class="mnemonic-index">{{ idx + 1 }}.</span>
              <span class="mnemonic-word">{{ word }}</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import '@/styles/wallet.css'
import { ref, computed } from 'vue'
import { HDKey } from '@scure/bip32'
import * as bip39 from '@scure/bip39'
import * as btc from '@scure/btc-signer'
import { wordlist } from '@scure/bip39/wordlists/english.js'
const ADDRESS_PATH = "m/84'/22'/0'/0/0" // BIP84 Monacoin
const WEBAUTHN_RPID = location.hostname
const WEBAUTHN_RPNAME = 'RP_NAME'
const WEBAUTHN_USERNAME = 'Passkey MONA User'
const WEBAUTHN_MESSAGETOHASH = 'wallet-seed:v1'
const MONA_NETWORK = {
  bech32: 'mona',
  pubKeyHash: 0x32, // 50
  scriptHash: 0x37, // 55
  wif: 0xb0, // 176
} as const
const isSignedIn = ref(false)
const isMnemonicOpen = ref(false)
const address = ref('')
const mnemonic = ref('')
const mnemonicWords = computed(() => (mnemonic.value ? mnemonic.value.trim().split(/\s+/) : []))

const signUp = async () => {
  const pubkeyOptions: PublicKeyCredentialCreationOptions = {
    challenge: randomBytes(32),
    rp: { id: WEBAUTHN_RPID, name: WEBAUTHN_RPNAME },
    user: { id: randomBytes(32), name: WEBAUTHN_USERNAME, displayName: WEBAUTHN_USERNAME },
    pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
    authenticatorSelection: { residentKey: 'preferred', userVerification: 'required' },
    attestation: 'none',
    extensions: { prf: {} },
  }
  const webAuthnCredential = await navigator.credentials.create({ publicKey: pubkeyOptions })
  if (!webAuthnCredential) return alert('Passkey Registration Failed')
  if (!(webAuthnCredential instanceof PublicKeyCredential)) return alert(`Unexpected credential type: ${webAuthnCredential.type}`)
  const credExtensions = webAuthnCredential.getClientExtensionResults()
  if (!credExtensions.prf?.enabled) return alert('WebAuthn PRF extension not enabled')
}
const signIn = async () => {
  const salt = await message2salt(WEBAUTHN_MESSAGETOHASH)
  const pubkeyOptions: PublicKeyCredentialRequestOptions = {
    challenge: randomBytes(32), // ウォレットで認証するのでチャレンジは適当で良い
    rpId: WEBAUTHN_RPID,
    userVerification: 'required',
    extensions: {
      prf: {
        eval: { first: salt.buffer },
      },
    },
  }
  const webAuthnCredential = await navigator.credentials.get({ publicKey: pubkeyOptions })
  if (!webAuthnCredential) return alert('Passkey Sign Failed')
  if (!(webAuthnCredential instanceof PublicKeyCredential)) return alert(`Unexpected credential type: ${webAuthnCredential.type}`)
  const credExtensions = webAuthnCredential.getClientExtensionResults()
  const prfResults = credExtensions.prf?.results
  if (!prfResults || !prfResults.first) return alert('PRF result not available (passkey or platform may not support it)')
  const prfOutput = bufferSource2bytes(prfResults.first)
  mnemonic.value = bip39.entropyToMnemonic(prfOutput, wordlist)
  address.value = addressFromMnemonic(mnemonic.value)
  isSignedIn.value = true
}
const addressFromMnemonic = (mnemonic: string): string => {
  const seed = bip39.mnemonicToSeedSync(mnemonic)
  const root = HDKey.fromMasterSeed(seed)
  const child = root.derive(ADDRESS_PATH)
  if (!child.publicKey) throw new Error('Failed to derive public key')
  const p2wpkh = btc.p2wpkh(child.publicKey, MONA_NETWORK)
  if (!p2wpkh.address) throw new Error('Failed to generate address')
  return p2wpkh.address
}
const toggleMnemonic = () => {
  isMnemonicOpen.value = !isMnemonicOpen.value
}
const message2salt = async (message: string) => {
  const data = new TextEncoder().encode(message)
  const digest = await crypto.subtle.digest('SHA-256', data) // 32byte
  return new Uint8Array(digest)
}
const randomBytes = (len = 32) => {
  const buf = new Uint8Array(len)
  crypto.getRandomValues(buf)
  return buf
}
const bufferSource2bytes = (source: BufferSource): Uint8Array => {
  if (source instanceof ArrayBuffer) return new Uint8Array(source)
  else return new Uint8Array(source.buffer, source.byteOffset, source.byteLength)
}
</script>
