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
      <p>登録済みの Passkey を使ってウォレットを生成します</p>
      <button class="btn primary" @click="signIn">Open Passkey Wallet</button>
    </section>

    <section v-if="wallet" class="card">
      <h2>Passkey Wallet Opened!</h2>
      <p>Passkey から モナコイン / Monaparty のウォレットを生成しました</p>

      <div class="field">
        <span class="label">Monacoin Address</span>
        <code class="value monospace break">{{ wallet.address }}</code>
      </div>

      <div class="field mnemonic-section">
        <button class="btn danger" @click="toggleMnemonic">
          {{ isMnemonicOpen ? 'Hide Mnemonic' : 'Show Mnemonic' }}
        </button>
        <div v-if="isMnemonicOpen" class="mnemonic-list">
          <div v-for="(word, idx) in mnemonicWords" :key="idx" class="mnemonic-item monospace">
            <span class="mnemonic-index">{{ idx + 1 }}.</span>
            <span class="mnemonic-word">{{ word }}</span>
          </div>
        </div>
      </div>

      <div class="tabs">
        <button class="tab-btn" :class="{ active: !isMonapartyMode }" @click="isMonapartyMode = false">Monacoin</button>
        <button class="tab-btn" :class="{ active: isMonapartyMode }" @click="isMonapartyMode = true">Monaparty</button>
      </div>

      <!-- Monacoin Tab -->
      <div v-if="!isMonapartyMode" class="tab-content">
        <div class="field">
          <span class="label">Balance</span>
          <span class="value-larger">
            <span v-if="!isBalanceLoading">
              <span class="monospace">{{ wallet.balance.toFixed(8) }}</span> MONA
              <span v-if="wallet.unconfBalance > 0" class="unconf-balance"> (+{{ wallet.unconfBalance.toFixed(8) }} unconfirmed) </span>
            </span>
            <span v-else class="loading-inline">
              <span class="spinner"></span>
              Loading...
            </span>
          </span>
        </div>

        <div class="field">
          <button class="btn secondary" @click="refreshBalance" :disabled="isBalanceLoading">
            {{ isBalanceLoading ? 'Updating...' : 'Update Balance' }}
          </button>
        </div>

        <div class="divider"></div>

        <h3>モナコインを送る</h3>

        <div class="field">
          <label class="label">Recipient Address</label>
          <input v-model="sendToAddress" type="text" class="input" placeholder="Monacoin Address" />
        </div>

        <div class="field">
          <label class="label">Amount (MONA)</label>
          <input v-model.number="sendAmount" type="number" class="input" step="0.01" min="0" placeholder="0.00000000" />
        </div>

        <button class="btn primary" @click="sendMona" :disabled="isSending || !sendToAddress || !sendAmount">
          <span v-if="!isSending">Send MONA</span>
          <span v-else class="loading-inline">
            <span class="spinner"></span>
            Sending...
          </span>
        </button>
      </div>

      <!-- Monaparty Tab -->
      <div v-else class="tab-content">
        <div class="field">
          <span class="label">Asset Balances</span>
          <span class="value-larger">
            <span v-if="!isAssetBalanceLoading && wallet.assetBalances.length > 0"> {{ wallet.assetBalances.length }} assets </span>
            <span v-else-if="!isAssetBalanceLoading && wallet.assetBalances.length === 0"> No assets </span>
            <span v-else class="loading-inline">
              <span class="spinner"></span>
              Loading...
            </span>
          </span>
        </div>

        <div class="field">
          <button class="btn secondary" @click="refreshAssetBalance" :disabled="isAssetBalanceLoading">
            {{ isAssetBalanceLoading ? 'Updating...' : 'Update Asset Balances' }}
          </button>
        </div>

        <div v-if="wallet.assetBalances.length > 0" class="asset-list">
          <div v-for="balance in wallet.assetBalances" :key="balance.asset" class="asset-item">
            <div class="asset-header">
              <span class="asset-name">{{ balance.asset }}</span>
              <span class="asset-quantity monospace">
                {{ formatAssetQuantity(balance.quantity, balance.divisible) }}
              </span>
            </div>
            <div v-if="balance.asset_longname" class="asset-longname">
              {{ balance.asset_longname }}
            </div>
          </div>
        </div>

        <div v-else-if="!isAssetBalanceLoading" class="coming-soon">
          <p>📭 No Monaparty assets found</p>
          <p class="subtitle-small">Assets you own will appear here</p>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import '@/styles/wallet.css'
import { ref, computed } from 'vue'
import { createPasskey, hashWithPasskey } from '@/lib/passkey'
import { MonaWallet } from '@/lib/monawallet'

const WEBAUTHN_RPID = location.hostname
const WEBAUTHN_RPNAME = 'Passkey Monacoin Wallet'
const WEBAUTHN_USERNAME = 'Passkey MONA User'
const WEBAUTHN_MESSAGETOHASH = 'wallet-seed:v1'

const isMnemonicOpen = ref(false)
const isBalanceLoading = ref(false)
const isAssetBalanceLoading = ref(false)
const isSending = ref(false)
const isMonapartyMode = ref(false)
const mnemonicWords = computed(() => (wallet.value ? wallet.value.mnemonic.trim().split(/\s+/) : []))

const wallet = ref<MonaWallet | null>(null)
const sendToAddress = ref('')
const sendAmount = ref(0)

const signUp = async () => {
  try {
    await createPasskey(WEBAUTHN_RPID, WEBAUTHN_RPNAME, WEBAUTHN_USERNAME)
    alert('Passkey の登録に成功しました！')
  } catch (error) {
    console.error('SignUp error:', error)
    alert(`Passkey の登録に失敗しました: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

const signIn = async () => {
  try {
    const { prfOutput } = await hashWithPasskey(WEBAUTHN_RPID, WEBAUTHN_MESSAGETOHASH)
    wallet.value = new MonaWallet(prfOutput)
    await refreshBalance()
    await refreshAssetBalance()
  } catch (error) {
    console.error('SignIn error:', error)
    alert(`Passkey でのサインインに失敗しました: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

const sendMona = async () => {
  const currentWallet = wallet.value
  if (!currentWallet) return
  if (!confirm(`${sendAmount.value} MONA を ${sendToAddress.value} に送りますか？`)) return
  isSending.value = true
  try {
    const txid = await currentWallet.sendMona(sendToAddress.value, sendAmount.value)
    alert(`送金しました\n残高への反映には数分かかります\nTXID: ${txid}`)
    sendToAddress.value = ''
    sendAmount.value = 0
  } catch (error) {
    console.error('Send error:', error)
    alert(`送金失敗: ${error instanceof Error ? error.message : 'Unknown error'}`)
  } finally {
    isSending.value = false
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
    alert('残高の更新に失敗しました')
  } finally {
    isBalanceLoading.value = false
  }
}

const refreshAssetBalance = async () => {
  const currentWallet = wallet.value
  if (!currentWallet) return
  isAssetBalanceLoading.value = true
  try {
    await currentWallet.updateAssetBalances()
  } catch (error) {
    console.error(error)
    alert('トークン残高の更新に失敗しました')
  } finally {
    isAssetBalanceLoading.value = false
  }
}

const toggleMnemonic = () => {
  isMnemonicOpen.value = !isMnemonicOpen.value
}

const formatAssetQuantity = (quantity: number | bigint, divisible: boolean): string => {
  let quantityStr = quantity.toString()
  if (divisible) {
    quantityStr = '000000000'.slice(quantityStr.length) + quantityStr
    quantityStr = quantityStr.slice(0, -8) + '.' + quantityStr.slice(-8)
  }
  return quantityStr
}
</script>
