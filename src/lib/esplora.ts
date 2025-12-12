// Esplora API module

const ESPLORA_ENDPOINT = 'https://esplora.electrum-mona.org/api/'

// API functions

export async function getUtxos(address: string): Promise<EsploraUtxo[]> {
  return await getJson<EsploraUtxo[]>(`${ESPLORA_ENDPOINT}address/${address}/utxo`)
}

export async function getTxHex(txId: string): Promise<string> {
  return await getText(`${ESPLORA_ENDPOINT}tx/${txId}/hex`)
}

export async function postTx(txHex: string): Promise<string> {
  const res = await fetch(`${ESPLORA_ENDPOINT}tx`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: txHex,
  })
  if (!res.ok) throw new Error(`Esplora API error: HTTP ${res.status}`)
  const txId = await res.text()
  return txId
}

// Helper functions

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Esplora API error: HTTP ${res.status}`)
  return await res.json()
}

async function getText(url: string): Promise<string> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Esplora API error: HTTP ${res.status}`)
  return await res.text()
}

// Types

type EsploraUtxo = {
  txid: string
  vout: number
  value: number
  status: {
    confirmed: boolean
    block_height?: number
    block_hash?: string
    block_time?: number
  }
}
