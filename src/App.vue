<template>
  <h1>Passkey Monacoin Wallet</h1>
  <p>Passkey を使ってモナコインのウォレットを生成するサンプルです</p>
  <hr />
  <p>
    <input v-model="usernameInput" type="text" placeholder="username" />
    <button @click="signUp">Sign up</button>
  </p>
  <hr />
  <p>
    <button @click="signIn">Sign in</button>
  </p>
  <div v-if="isSignedIn">
    <p>{{ ADDRESS_PATH }}</p>
    <p>{{ address }}</p>
  </div>
  <hr />
  <div v-if="isSignedIn">
    <p>
      <button @click="toggleMnemonic">{{ isMnemonicOpen ? 'Hide Mnemonic' : 'Show Mnemonic' }}</button>
    </p>
    <p v-if="isMnemonicOpen">{{ mnemonic }}</p>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { HDKey } from '@scure/bip32'
import * as bip39 from '@scure/bip39'
import * as bitcoinlib from 'bitcoinjs-lib'
import * as coininfo from 'coininfo'
import { wordlist } from '@scure/bip39/wordlists/english.js'
const ADDRESS_PATH = "m/84'/22'/0'/0/0"
const WEBAUTHN_RPID = location.hostname
const WEBAUTHN_RPNAME = 'RP_NAME'
const WEBAUTHN_MESSAGETOHASH = 'wallet-seed:v1'
const MONA_NETWORK: bitcoinlib.Network = coininfo.monacoin.main.toBitcoinJS()
const usernameInput = ref()
const isSignedIn = ref(false)
const isMnemonicOpen = ref(false)
const address = ref('')
const mnemonic = ref('')

const signUp = async () => {
  const username = usernameInput.value || 'test-user'
  const pubkeyOptions: PublicKeyCredentialCreationOptions = {
    challenge: randomBytes(32),
    rp: { id: WEBAUTHN_RPID, name: WEBAUTHN_RPNAME },
    user: { id: randomBytes(32), name: username, displayName: username },
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
    challenge: randomBytes(32),
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
  const payment = bitcoinlib.payments.p2wpkh({ pubkey: Buffer.from(child.publicKey), network: MONA_NETWORK })
  if (!payment.address) throw new Error('Failed to generate address')
  return payment.address
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

<style scoped></style>
