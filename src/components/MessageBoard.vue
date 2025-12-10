<!--

Monapartyのbroadcastを使った簡単なDAppのサンプルです

このサンプルでは単テキストをbase64URLエンコードしてbroadcastに保存しているだけですが
CBORなども組み合わせればfeeを抑えつつ複雑なデータ構造も扱えると思います

アプリのデータを絞り込むためにbroadcastのvalueフィールドを使っています

-->

<template>
  <div class="messageboard">
    <h3>Message Board</h3>
    <p class="subtitle-small">モナコインのブロックチェーン上にメッセージを投稿します</p>

    <div class="field">
      <label class="label">Your Message</label>
      <textarea v-model="message" class="textarea" placeholder="Enter your message..." rows="4"></textarea>
      <div class="char-count">{{ message.length }}</div>
    </div>

    <button class="btn primary" @click="postMessage" :disabled="isPosting || !message.trim() || !wallet">
      <span v-if="!isPosting">Post Message</span>
      <span v-else class="loading-inline">
        <span class="spinner"></span>
        Posting...
      </span>
    </button>

    <div class="divider"></div>

    <h4>Recent Messages</h4>
    <div class="field">
      <button class="btn secondary" @click="loadMessages" :disabled="isLoading">
        {{ isLoading ? 'Loading...' : 'Refresh Messages' }}
      </button>
    </div>

    <div v-if="messages.length > 0" class="message-list">
      <div v-for="msg in messages" :key="msg.tx_hash" class="message-item">
        <div class="message-header">
          <span class="message-address">{{ shortenAddress(msg.source) }}</span>
          <span class="message-time">{{ formatTime(msg.timestamp) }}</span>
        </div>
        <div class="message-text">{{ msg.decodedText }}</div>
        <div class="message-footer">
          <a :href="`https://mpchain.info/tx/${msg.tx_hash}`" target="_blank" class="message-link"> View TX </a>
        </div>
      </div>
    </div>

    <div v-else-if="!isLoading" class="coming-soon">
      <p>No messages found</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import '@/styles/message-board.css'
import { ref, onMounted } from 'vue'
import type { MonaWallet } from '@/lib/monawallet'
import * as monaparty from '@/lib/monaparty'

const BROADCAST_VALUE = 2512.11

const props = defineProps<{ wallet: MonaWallet | null }>()
const isPosting = ref(false)
const isLoading = ref(false)
const message = ref('')
const messages = ref<Message[]>([])

const postMessage = async () => {
  if (!props.wallet || !message.value.trim()) return
  if (!confirm(`メッセージを投稿しますか？\n\n"${message.value}"`)) return
  isPosting.value = true
  try {
    const encodedMessage = encode(message.value.trim())
    const txId = await props.wallet.postBroadcast(encodedMessage, BROADCAST_VALUE)
    alert(`メッセージを投稿しました\n反映には数分かかります\nTXID: ${txId}`)
    message.value = ''
  } catch (error) {
    console.error('Post message error:', error)
    alert(`投稿失敗: ${error instanceof Error ? error.message : 'Unknown error'}`)
  } finally {
    isPosting.value = false
  }
}

const loadMessages = async () => {
  isLoading.value = true
  try {
    const broadcasts = await monaparty.getBroadcasts({
      orderBy: 'block_index',
      orderDir: 'DESC',
      limit: 50,
      filters: [{ field: 'value', op: '==', value: BROADCAST_VALUE }],
    })
    messages.value = broadcasts
      .map((bro) => ({
        decodedText: decode(bro.text),
        ...bro,
      }))
      .filter((bro) => bro.decodedText)
  } catch (error) {
    console.error('Load messages error:', error)
    alert('メッセージの読み込みに失敗しました')
  } finally {
    isLoading.value = false
  }
}

const encode = (text: string): string => {
  // 文字列をbase64URLエンコードする
  const bytes = new TextEncoder().encode(text)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!)
  const base64 = btoa(binary)
  const base64url = base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  return base64url
}

const decode = (base64url: string): string | null => {
  // base64URLをデコードして文字列に戻す
  if (!base64url || base64url.trim() === '') return null
  try {
    const base64nopad = base64url.replace(/-/g, '+').replace(/_/g, '/')
    const base64 = base64nopad + '='.repeat((4 - (base64nopad.length % 4)) % 4)
    const binary = atob(base64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    const text = new TextDecoder().decode(bytes)
    return text
  } catch {
    return null
  }
}

const shortenAddress = (address: string): string => {
  return address.slice(0, 2) + '-' + address.slice(-6)
}

const formatTime = (timestamp: number): string => {
  const date = new Date(timestamp * 1000)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  if (diffMins < 60) return `${diffMins}min ago`
  const diffHours = Math.floor(diffMins / 60)
  if (diffHours < 24) return `${diffHours}hour ago`
  const diffDays = Math.floor(diffHours / 24)
  return `${diffDays}days ago`
}

onMounted(() => {
  loadMessages()
})

type Message = {
  decodedText: string | null
} & monaparty.Broadcast
</script>
