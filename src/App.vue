<template>
  <div class="app">
    <h1>Passkey Monacoin Wallet</h1>
    <p class="subtitle">Passkey を使ってモナコインのウォレットを生成するサンプルです</p>

    <section class="card">
      <h2>1. Passkey を登録する</h2>
      <p>ブラウザやデバイスに新しい Passkey を登録します</p>
      <button class="btn primary" @click="signUp">Create Passkey</button>
    </section>

    <section class="card">
      <h2>2. ウォレットを開く</h2>
      <p>登録済みの Passkey を使ってウォレットを復元します</p>
      <button class="btn primary" @click="signIn">Open Passkey Wallet</button>

      <div v-if="wallet" class="wallet">
        <div class="field">
          <span class="label">Monacoin Address</span>
          <code class="value monospace break">{{ wallet.address }}</code>
        </div>
        <div class="field">
          <span class="label">Derivation Path</span>
          <code class="value monospace">{{ wallet.derivationPath }}</code>
        </div>

        <div class="field">
          <span class="label">Balance</span>
          <span class="value monospace">
            <span v-if="!isBalanceLoading">
              {{ wallet.balance.toFixed(8) }} MONA
              <span v-if="wallet.unconfBalance > 0"> (+{{ wallet.unconfBalance.toFixed(8) }} MONA unconfirmed) </span>
            </span>
            <span v-else class="loading-inline">
              <span class="spinner"></span>
              Loading...
            </span>
          </span>
        </div>
        <div class="field">
          <button class="btn ghost" @click="refreshBalance" :disabled="isBalanceLoading">
            {{ isBalanceLoading ? 'Updating...' : 'Update Balance' }}
          </button>
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
import { MonaWallet } from '@/lib/monawallet'

const WEBAUTHN_RPID = location.hostname
const WEBAUTHN_RPNAME = 'Passkey Monacoin Wallet'
const WEBAUTHN_USERNAME = 'Passkey MONA User'
const WEBAUTHN_MESSAGETOHASH = 'wallet-seed:v1'

const isMnemonicOpen = ref(false)
const isBalanceLoading = ref(false)
const wallet = ref<MonaWallet | null>(null)
const mnemonicWords = computed(() => (wallet.value ? wallet.value.mnemonic.trim().split(/\s+/) : []))

const signUp = async () => {
  try {
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
    if (!webAuthnCredential) throw new Error('Passkey Registration Failed')
    if (!(webAuthnCredential instanceof PublicKeyCredential)) throw new Error(`Unexpected credential type: ${webAuthnCredential.type}`)
    const credExtensions = webAuthnCredential.getClientExtensionResults()
    if (!credExtensions.prf?.enabled) throw new Error('WebAuthn PRF extension not enabled')
    alert('Passkey registration successful!')
  } catch (error) {
    console.error('SignUp error:', error)
    alert(`Passkey registration failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}
const signIn = async () => {
  try {
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
    if (!webAuthnCredential) throw new Error('Passkey Sign Failed')
    if (!(webAuthnCredential instanceof PublicKeyCredential)) throw new Error(`Unexpected credential type: ${webAuthnCredential.type}`)
    const credExtensions = webAuthnCredential.getClientExtensionResults()
    const prfResults = credExtensions.prf?.results
    if (!prfResults || !prfResults.first) throw new Error('PRF result not available (passkey or platform may not support it)')
    const prfOutput = bufferSource2bytes(prfResults.first)
    wallet.value = new MonaWallet(prfOutput)
    await refreshBalance()
  } catch (error) {
    console.error('SignIn error:', error)
    alert(`Passkey sign-in failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}
const refreshBalance = async () => {
  const currentWallet = wallet.value
  if (!currentWallet) return
  isBalanceLoading.value = true
  try {
    await currentWallet.updateBalance()
  } catch (error) {
    console.error(error)
    alert('Failed to update balance')
  } finally {
    isBalanceLoading.value = false
  }
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
