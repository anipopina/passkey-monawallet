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
      <div class="field">
        <div class="toggle-container">
          <span class="toggle-label">Address Type:</span>
          <label class="toggle-switch">
            <input type="checkbox" v-model="useSegWit" class="toggle-input" />
            <span class="toggle-slider"></span>
          </label>
          <span class="toggle-type">{{ useSegWit ? 'P2WPKH (mona1-prefix)' : 'P2PKH (M-prefix)' }}</span>
        </div>
        <p v-if="useSegWit" class="caution">
          P2WPKH (mona1-prefix) のアドレスは取引所の対応状況やMonapartyの仕様で不便があるので注意してください
        </p>
      </div>
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
        <button class="tab-btn" :class="{ active: activeTab === 'monacoin' }" @click="activeTab = 'monacoin'">Monacoin</button>
        <button class="tab-btn" :class="{ active: activeTab === 'monaparty' }" @click="activeTab = 'monaparty'">Monaparty</button>
        <button class="tab-btn" :class="{ active: activeTab === 'messageboard' }" @click="activeTab = 'messageboard'">Message Board</button>
      </div>

      <!-- Monacoin Tab -->
      <div v-if="activeTab === 'monacoin'" class="tab-content">
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
      <div v-else-if="activeTab === 'monaparty'" class="tab-content">
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
              <span class="asset-name">{{ balance.assetMainName }}</span>
              <span class="asset-quantity monospace">
                {{ formatAssetQuantity(balance.quantity, balance.divisible) }}
              </span>
            </div>
            <div v-if="balance.assetSubName" class="asset-longname">
              {{ balance.assetSubName }}
            </div>

            <button v-if="selectedAssetToSend !== balance.asset" class="btn-small secondary send-btn" @click="startSendAsset(balance)">
              Send {{ balance.assetMainName }}
            </button>

            <!-- アセット送信フォーム（選択時のみ表示） -->
            <div v-else class="send-form">
              <div class="field-small">
                <label class="label-small">To Address</label>
                <input v-model="assetSendToAddress" type="text" class="input-small" placeholder="Monacoin Address" />
              </div>

              <div class="field-small">
                <label class="label-small">Amount</label>
                <div class="amount-input-group">
                  <input
                    v-model="assetSendAmount"
                    type="text"
                    class="input-small"
                    :placeholder="balance.divisible ? '0.0' : '0'"
                    @input="validateAssetAmount($event, balance.divisible)"
                  />
                  <button class="btn-max" @click="setMaxAmount(balance)">MAX</button>
                </div>
              </div>

              <div class="button-group-small">
                <button class="btn-small secondary" @click="cancelSendAsset">Cancel</button>
                <button
                  class="btn-small primary"
                  @click="sendAsset(balance)"
                  :disabled="isSendingAsset || !assetSendToAddress || !assetSendAmount"
                >
                  <span v-if="!isSendingAsset">Send</span>
                  <span v-else class="loading-inline">
                    <span class="spinner-small"></span>
                    Sending...
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>

        <div v-else-if="!isAssetBalanceLoading" class="coming-soon">
          <p>No Monaparty assets found</p>
          <p class="subtitle-small">Assets you own will appear here</p>
        </div>
      </div>

      <!-- MessageBoard Tab -->
      <div v-else-if="activeTab === 'messageboard'" class="tab-content">
        <MessageBoard :wallet="wallet" />
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import '@/styles/wallet.css'
import { ref, computed } from 'vue'
import { createPasskey, hashWithPasskey } from '@/lib/passkey'
import { MonaWallet, type AssetBalance } from '@/lib/monawallet'
import MessageBoard from '@/components/MessageBoard.vue'

const WEBAUTHN_RPID = location.hostname
const WEBAUTHN_RPNAME = 'Passkey Monacoin Wallet'
const WEBAUTHN_USERNAME = 'Passkey MONA User'
const WEBAUTHN_MESSAGETOHASH = 'wallet-seed:v1'

const activeTab = ref<'monacoin' | 'monaparty' | 'messageboard'>('monacoin')
const useSegWit = ref(false)
const isMnemonicOpen = ref(false)
const isBalanceLoading = ref(false)
const isAssetBalanceLoading = ref(false)
const isSending = ref(false)
const isSendingAsset = ref(false)
const selectedAssetToSend = ref<string | null>(null)
const mnemonicWords = computed(() => (wallet.value ? wallet.value.mnemonic.trim().split(/\s+/) : []))

const wallet = ref<MonaWallet | null>(null)
const sendToAddress = ref('')
const sendAmount = ref(0)
const assetSendToAddress = ref('')
const assetSendAmount = ref('')

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
    wallet.value = new MonaWallet(prfOutput, useSegWit.value ? 'P2WPKH' : 'P2PKH')
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
    const txId = await currentWallet.sendMona(sendToAddress.value, sendAmount.value)
    alert(`送金しました\n残高への反映には数分かかります\nTXID: ${txId}`)
    sendToAddress.value = ''
    sendAmount.value = 0
  } catch (error) {
    console.error('Send error:', error)
    alert(`送金失敗: ${error instanceof Error ? error.message : 'Unknown error'}`)
  } finally {
    isSending.value = false
  }
}

const startSendAsset = (balance: AssetBalance) => {
  selectedAssetToSend.value = balance.asset
  assetSendToAddress.value = ''
  assetSendAmount.value = ''
}

const cancelSendAsset = () => {
  selectedAssetToSend.value = null
  assetSendToAddress.value = ''
  assetSendAmount.value = ''
}

const setMaxAmount = (balance: AssetBalance) => {
  assetSendAmount.value = formatAssetQuantity(balance.quantity, balance.divisible)
}

const sendAsset = async (balance: AssetBalance) => {
  const currentWallet = wallet.value
  if (!currentWallet) return
  if (!confirm(`${assetSendAmount.value} ${balance.assetMainName} を ${assetSendToAddress.value} に送りますか？`)) return
  isSendingAsset.value = true
  try {
    const txid = await currentWallet.sendAsset(assetSendToAddress.value, balance.asset, assetSendAmount.value)
    alert(`${balance.assetMainName} を送りました\n残高への反映には数分かかります\nTXID: ${txid}`)
    cancelSendAsset()
  } catch (error) {
    console.error('Send asset error:', error)
    alert(`送信失敗: ${error instanceof Error ? error.message : 'Unknown error'}`)
  } finally {
    isSendingAsset.value = false
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

const validateAssetAmount = (event: Event, divisible: boolean) => {
  const input = event.target as HTMLInputElement
  let value = input.value
  if (divisible) {
    value = value.replace(/[^\d.]/g, '') // 数字と小数点のみ
    const parts = value.split('.')
    // 小数点が複数ある場合は最初の1つだけ残す
    if (parts.length > 2) {
      value = parts[0] + '.' + parts.slice(1).join('')
    }
    // 小数点以下8桁まで
    if (parts.length === 2 && parts[1] && parts[1].length > 8) {
      value = parts[0] + '.' + parts[1].slice(0, 8)
    }
  } else {
    value = value.replace(/[^\d]/g, '') // 数字のみ
  }
  assetSendAmount.value = value
  input.value = value
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
