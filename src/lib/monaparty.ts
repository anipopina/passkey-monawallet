// Monaparty API Module

const MONAPARTY_ENDPOINT = 'https://monapa.electrum-mona.org/_api'
//const MONAPARTY_ENDPOINT = 'https://wallet.monaparty.me/_api'

// #region Types

export type ChainAddressInfo = {
  addr: string
  uxtos: MonapartyUtxo[]
  // 必要になったら last_txns なども追加
}
export type MonapartyUtxo = {
  txid: string
  vout: number
  amount: string
  confirmations: number
}

// #endregion Types

// #region APIWrappers

export async function getChainAddressInfo(
  addresses: string[],
  { withUtxos = true, withLastTxnHashes = false } = {},
): Promise<ChainAddressInfo[]> {
  const params = {
    addresses,
    with_uxtos: withUtxos, // ← uxtos 注意
    with_last_txn_hashes: withLastTxnHashes,
  }
  return await monapartyRpc<ChainAddressInfo[]>('get_chain_address_info', params)
}

// #endregion APIWrappers

async function monapartyRpc<T>(method: string, params: unknown): Promise<T> {
  const body = { jsonrpc: '2.0', id: 0, method, params }
  const res = await fetch(MONAPARTY_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`Monaparty API error: HTTP ${res.status}`)
  const json = await res.json()
  if (json.error) throw new Error(`Monaparty RPC error: ${JSON.stringify(json.error)}`)
  return json.result as T
}
