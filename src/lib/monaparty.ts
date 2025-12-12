// Monaparty API Module

import jsonBigint from 'json-bigint'
const JSONbig = jsonBigint({ useNativeBigInt: true })

const DEFAULT_ENDPOINTS = ['https://monapa.electrum-mona.org/_api', 'https://wallet.monaparty.me/_api']
let endpoints = DEFAULT_ENDPOINTS
let bestEndpoint: string = ''

// #region SetupFunctions

// Monapartyサーバのリストを設定
export const setEndpoints = (newEndpoints: string[]) => {
  endpoints = newEndpoints
  bestEndpoint = ''
}

// 調子の良いサーバーを選択
export async function selectBestEndpoint(): Promise<string> {
  const promises = []
  for (const endpoint of endpoints) {
    promises.push(counterpartyRpc('get_assets', { limit: 1 }, endpoint).then(() => endpoint))
  }
  try {
    bestEndpoint = await Promise.any(promises)
    return bestEndpoint
  } catch {
    throw new Error('All Monaparty endpoints are unavailable')
  }
}

// #endregion

// CounterpartyAPI
/*
参考:
https://docs.counterparty.io/docs/advanced/api-v1/api-v1-spec/
https://github.com/monaparty/counterparty-lib/blob/monaparty-develop/counterpartylib/lib/api.py

必要に応じて個別のラップ関数を追加してください
検証にはこちらのツールが便利です https://monapalette.komikikaku.com/monaparty_api
*/

// #region GetTableAPI

export type TableName =
  | 'addresses'
  | 'assetgroups'
  | 'assets'
  | 'balances'
  //  | 'blocks' // このテーブルは他のAPIでアクセスする
  | 'credits'
  | 'debits'
  | 'bets'
  | 'bet_matches'
  | 'broadcasts'
  | 'btcpays'
  | 'burns'
  | 'cancels'
  | 'destructions'
  | 'dividends'
  | 'issuances'
  | 'messages'
  | 'orders'
  | 'order_matches'
  | 'sends'
  | 'bet_expirations'
  | 'order_expirations'
  | 'bet_match_expirations'
  | 'order_match_expirations'
  | 'bet_match_resolutions'
  | 'rps'
  | 'rpsresolves'
  | 'rps_matches'
  | 'rps_expirations'
  | 'rps_match_expirations'
  | 'mempool'
  | 'sweeps'
  | 'dispensers'
  | 'dispenses'
  | 'transactions'
  | 'pubkeys'

// input

export type GetTableParams = {
  filters?: {
    field: string
    op: '==' | '!=' | '>' | '<' | '>=' | '<=' | 'IN' | 'LIKE' | 'NOT IN' | 'NOT LIKE' // LIKEは前方一致のみ
    value: string | number | boolean | null | (string | number)[]
  }[]
  filterOp?: 'AND' | 'OR'
  orderBy?: string
  orderDir?: 'ASC' | 'DESC'
  startBlock?: number
  endBlock?: number
  status?: string | string[]
  limit?: number
  offset?: number
}

// output

export type Asset = {
  asset_id: string
  asset_longname: string | null
  asset_name: string
  asset_group: string | null
  block_index: number | null
}

export type Assetgroup = {
  status: string
  asset_group: string
  tx_index: number
  block_index: number
  tx_hash: string
  msg_index: number
  owner: string
}

export type Balance = {
  asset: string
  quantity: number | bigint
  address: string
}

export type Issuance = {
  asset_longname: string | null
  callable: number
  locked: number
  tx_index: number
  fungible: number
  transfer: number
  asset: string
  call_date: number
  listed: number
  source: string
  fee_paid: number
  divisible: number
  vendable: number
  status: string
  reassignable: number
  issuer: string
  quantity: number | bigint
  msg_index: number
  call_price: number
  block_index: number
  description: string
  tx_hash: string
}

export type Dispenser = {
  give_remaining: number | bigint
  asset: string
  tx_index: number
  give_quantity: number | bigint
  status: number
  satoshirate: number | bigint
  block_index: number
  source: string
  tx_hash: string
  escrow_quantity: number | bigint
}

export type Broadcast = {
  timestamp: number
  status: string
  locked: number
  tx_index: number
  value: number
  fee_fraction_int: number
  block_index: number
  source: string
  tx_hash: string
  text: string
}

export type Credit = {
  asset: string
  quantity: number | bigint
  event: string
  address: string
  block_index: number
  calling_function: string
}

export type Debit = {
  asset: string
  quantity: number | bigint
  event: string
  action: string
  block_index: number
  address: string
}

// functions

export async function getAssets(params: GetTableParams): Promise<Asset[]> {
  return await getTable<Asset>('assets', params)
}

export async function getAssetgroups(params: GetTableParams): Promise<Assetgroup[]> {
  return await getTable<Assetgroup>('assetgroups', params)
}

export async function getBalances(params: GetTableParams): Promise<Balance[]> {
  return await getTable<Balance>('balances', params)
}

export async function getIssuances(params: GetTableParams): Promise<Issuance[]> {
  return await getTable<Issuance>('issuances', params)
}

export async function getDispensers(params: GetTableParams): Promise<Dispenser[]> {
  return await getTable<Dispenser>('dispensers', params)
}

export async function getBroadcasts(params: GetTableParams): Promise<Broadcast[]> {
  return await getTable<Broadcast>('broadcasts', params)
}

export async function getCredits(params: GetTableParams): Promise<Credit[]> {
  return await getTable<Credit>('credits', params)
}

export async function getDebits(params: GetTableParams): Promise<Debit[]> {
  return await getTable<Debit>('debits', params)
}

// 汎用 get_{tableName}
export async function getTable<T = JsonValue>(tableName: TableName, params: GetTableParams): Promise<T[]> {
  const method = `get_${tableName}`
  return await counterpartyRpc<T[]>(method, camelKeysToSnakeKeys(params))
}

// #endregion

// #region CreateAPI

// input

export type CreateTxCommonParams = {
  encoding?: string
  pubkey?: string | string[]
  allowUnconfirmedInputs?: boolean
  fee?: number
  feePerKb?: number
  feeProvided?: number
  customInputs?: {
    txid: string
    vout: number
    amount: number
  }[]
  unspentTxHash?: string
  regularDustSize?: number
  multisigDustSize?: number
  dustReturnPubkey?: string
  disableUtxoLocks?: boolean
  opReturnValue?: number
  extendedTxInfo?: boolean
  p2shPretxTxid?: string
}

export type CreateSendParams = {
  source: string
  destination: string
  asset: string
  quantity: number | bigint
  memo?: string
  memoIsHex?: boolean
  useEnhancedSend?: boolean // デフォルトで true
} & CreateTxCommonParams

export type CreateIssuanceParams = {
  source: string
  asset: string
  quantity: number | bigint
  divisible: boolean
  description?: string
  transferDestination?: string
  lock?: boolean
  reset?: boolean
  listed?: boolean // monapartyオリジナル
  reassignable?: boolean // monapartyオリジナル
  vendable?: boolean // monapartyオリジナル
} & CreateTxCommonParams

export type CreateDividendParams = {
  source: string
  quantityPerUnit: number | bigint
  asset: string
  dividendAsset: string
} & CreateTxCommonParams

export type CreateDispenserParams = {
  source: string
  asset: string
  giveQuantity: number | bigint // close時は0でOK
  escrowQuantity: number | bigint // close時は0でOK
  mainchainrate: number | bigint // giveQuantityあたりの価格 (satoshi), close時は0でOK
  status: 0 | 1 | 10 // 0=open, 1=open_using_openaddress, 10=closed
  openAddress?: string
  oracleAddress?: string
} & CreateTxCommonParams

export type CreateSweepParams = {
  source: string
  destination: string
  flags: 1 | 2 | 3 | 4 | 5 | 6 | 7 // OR mask of  1=BALANCES, 2=OWNERSHIP, 4=BINARY_MEMO
  memo?: string
} & CreateTxCommonParams

export type CreateOrderParams = {
  source: string
  giveAsset: string
  giveQuantity: number | bigint
  getAsset: string
  getQuantity: number | bigint
  expiration: number // blocks, 1-65535 (~136 days), 1=即約定しなければキャンセル
  feeRequired: number // 0など
  feeProvided: number // ドキュメントにないけど必須, 0など
} & CreateTxCommonParams

export type CreateCancelParams = {
  source: string
  offerHash: string
} & CreateTxCommonParams

export type CreateBroadcastParams = {
  source: string
  text: string
  value: number // -1など
  timestamp: number // Math.floor(Date.now() / 1000) など
  feeFraction: number // 0など
} & CreateTxCommonParams

export type CreateDestroyParams = {
  source: string
  asset: string
  quantity: number | bigint
  tag?: string
} & CreateTxCommonParams

export type CreateBtcpayParams = {
  source: string
  orderMatchId: string
} & CreateTxCommonParams

export type CreateBurnParams = {
  source: string
  quantity: number | bigint
} & CreateTxCommonParams

export type CreateBetParams = {
  source: string
  feedAddress: string
  betType: number
  deadline: number
  wagerQuantity: number | bigint
  counterwagerQuantity: number | bigint
  expiration: number
  targetValue?: number
  leverage?: number
} & CreateTxCommonParams

// output

export type CreatedTxInfo = {
  tx_hex: string
  btc_in: number
  btc_out: number
  btc_change: number
  btc_fee: number
}

// functions

export async function createSend(params: CreateSendParams & { extendedTxInfo: true }): Promise<CreatedTxInfo>
export async function createSend(params: CreateSendParams): Promise<string>
export async function createSend(params: CreateSendParams): Promise<string | CreatedTxInfo> {
  return await counterpartyRpc<string | CreatedTxInfo>('create_send', camelKeysToSnakeKeys(params))
}

export async function createIssuance(params: CreateIssuanceParams & { extendedTxInfo: true }): Promise<CreatedTxInfo>
export async function createIssuance(params: CreateIssuanceParams): Promise<string>
export async function createIssuance(params: CreateIssuanceParams): Promise<string | CreatedTxInfo> {
  return await counterpartyRpc<string | CreatedTxInfo>('create_issuance', camelKeysToSnakeKeys(params))
}

export async function createDividend(params: CreateDividendParams & { extendedTxInfo: true }): Promise<CreatedTxInfo>
export async function createDividend(params: CreateDividendParams): Promise<string>
export async function createDividend(params: CreateDividendParams): Promise<string | CreatedTxInfo> {
  return await counterpartyRpc<string | CreatedTxInfo>('create_dividend', camelKeysToSnakeKeys(params))
}

export async function createDispenser(params: CreateDispenserParams & { extendedTxInfo: true }): Promise<CreatedTxInfo>
export async function createDispenser(params: CreateDispenserParams): Promise<string>
export async function createDispenser(params: CreateDispenserParams): Promise<string | CreatedTxInfo> {
  return await counterpartyRpc<string | CreatedTxInfo>('create_dispenser', camelKeysToSnakeKeys(params))
}

export async function createSweep(params: CreateSweepParams & { extendedTxInfo: true }): Promise<CreatedTxInfo>
export async function createSweep(params: CreateSweepParams): Promise<string>
export async function createSweep(params: CreateSweepParams): Promise<string | CreatedTxInfo> {
  return await counterpartyRpc<string | CreatedTxInfo>('create_sweep', camelKeysToSnakeKeys(params))
}

export async function createOrder(params: CreateOrderParams & { extendedTxInfo: true }): Promise<CreatedTxInfo>
export async function createOrder(params: CreateOrderParams): Promise<string>
export async function createOrder(params: CreateOrderParams): Promise<string | CreatedTxInfo> {
  return await counterpartyRpc<string | CreatedTxInfo>('create_order', camelKeysToSnakeKeys(params))
}

export async function createCancel(params: CreateCancelParams & { extendedTxInfo: true }): Promise<CreatedTxInfo>
export async function createCancel(params: CreateCancelParams): Promise<string>
export async function createCancel(params: CreateCancelParams): Promise<string | CreatedTxInfo> {
  return await counterpartyRpc<string | CreatedTxInfo>('create_cancel', camelKeysToSnakeKeys(params))
}

export async function createBroadcast(params: CreateBroadcastParams & { extendedTxInfo: true }): Promise<CreatedTxInfo>
export async function createBroadcast(params: CreateBroadcastParams): Promise<string>
export async function createBroadcast(params: CreateBroadcastParams): Promise<string | CreatedTxInfo> {
  return await counterpartyRpc<string | CreatedTxInfo>('create_broadcast', camelKeysToSnakeKeys(params))
}

export async function createDestroy(params: CreateDestroyParams & { extendedTxInfo: true }): Promise<CreatedTxInfo>
export async function createDestroy(params: CreateDestroyParams): Promise<string>
export async function createDestroy(params: CreateDestroyParams): Promise<string | CreatedTxInfo> {
  return await counterpartyRpc<string | CreatedTxInfo>('create_destroy', camelKeysToSnakeKeys(params))
}

export async function createBtcpay(params: CreateBtcpayParams & { extendedTxInfo: true }): Promise<CreatedTxInfo>
export async function createBtcpay(params: CreateBtcpayParams): Promise<string>
export async function createBtcpay(params: CreateBtcpayParams): Promise<string | CreatedTxInfo> {
  return await counterpartyRpc<string | CreatedTxInfo>('create_btcpay', camelKeysToSnakeKeys(params))
}

export async function createBurn(params: CreateBurnParams & { extendedTxInfo: true }): Promise<CreatedTxInfo>
export async function createBurn(params: CreateBurnParams): Promise<string>
export async function createBurn(params: CreateBurnParams): Promise<string | CreatedTxInfo> {
  return await counterpartyRpc<string | CreatedTxInfo>('create_burn', camelKeysToSnakeKeys(params))
}

export async function createBet(params: CreateBetParams & { extendedTxInfo: true }): Promise<CreatedTxInfo>
export async function createBet(params: CreateBetParams): Promise<string>
export async function createBet(params: CreateBetParams): Promise<string | CreatedTxInfo> {
  return await counterpartyRpc<string | CreatedTxInfo>('create_bet', camelKeysToSnakeKeys(params))
}

// #endregion

// #region OtherCounterpartyAPI
/*
他には以下のAPIがあるようです
  get_dispenser_info
  get_supply
  get_holder_count
  get_messages
  get_messages_by_index
  get_blocks
  get_running_info
  get_element_counts
  get_unspent_txouts
  getrawtransaction
  getrawtransaction_batch
  search_raw_transactions
  get_tx_info
  search_pubkey
  unpack
*/

// input

export type GetUnspentTxoutsParams = {
  address: string
  unconfirmed?: boolean // この値と無関係に未確認UTXOが返ってくるときと返ってこないときがある
  unspentTxHash?: string // ドキュメントではboolだが実際はstring  txidを指定するとそのtx由来のutxoだけ返ってくる
  orderBy?: string
}

export type GetRawTransactionParams = {
  txHash: string
  verbose?: boolean // trueにするとオブジェクトで追加の情報が返ってくる
  skipMissing?: boolean // 効かない
}

// output

export type AssetInfo = {
  asset: string
  asset_longname: string | null
  description: string
  divisible: boolean
  locked: boolean
  reassignable: boolean
  listed: boolean
  vendable: boolean
  supply: number
  issuer: string
  owner: string
}

export type Holder = {
  address: string
  address_quantity: number | bigint
  escrow: number | null
}

export type BlockInfo = {
  block_time: number
  messages_hash: string
  ledger_hash: string
  difficulty: number
  block_index: number
  previous_block_hash: string
  txlist_hash: string
  block_hash: string
}

export type UnspentTxout = {
  confirmations: number // 未確認の場合は0じゃなくて現在のブロック高が入ってくる
  amount: number
  vout: number
  value: number
  txid: string
  height: number // 未確認の場合は-1
  coinbase: number
}

// functions

export async function getAssetInfo(assets: string[]): Promise<AssetInfo[]> {
  const params = { assets }
  return await counterpartyRpc<AssetInfo[]>('get_asset_info', params)
}

export async function getHolders(asset: string): Promise<Holder[]> {
  const params = { asset }
  return await counterpartyRpc<Holder[]>('get_holders', params)
}

export async function getBlockInfo(blockIndex: number): Promise<BlockInfo> {
  const params = { block_index: blockIndex }
  return await counterpartyRpc<BlockInfo>('get_block_info', params)
}

export async function getUnspentTxouts(params: GetUnspentTxoutsParams): Promise<UnspentTxout[]> {
  return await counterpartyRpc<UnspentTxout[]>('get_unspent_txouts', camelKeysToSnakeKeys(params))
}

// verbose=true の戻り値が面倒なのでとりあえず verbose=false の場合だけ定義
export async function getRawTransaction(params: GetRawTransactionParams & { verbose?: false }): Promise<string> {
  return await counterpartyRpc<string>('getrawtransaction', camelKeysToSnakeKeys(params))
}

export async function getAssetNames(): Promise<string[]> {
  const params = {}
  return await counterpartyRpc<string[]>('get_asset_names', params)
}

// #endregion

// #region CounterblockAPI
/*
参考: https://github.com/monaparty/counterblock/blob/monaparty-develop/counterblock/lib/processor/api.py

他には以下のAPIがあるようです
  get_messagefeed_messages_by_index
  get_insight_block_info
  get_optimal_fee_per_kb
  get_chain_txns_status
  get_last_n_messages
  get_pubkey_for_address
  get_script_pub_key
  get_raw_transactions
*/

// input

export type CbGetAddressInfoParams = {
  addresses: string[]
  withUxtos?: boolean // "uxtos" API側のスペルミスをそのまま引き継ぎ
  withLastTxnHashes?: boolean
}

// output

export type CbChainAddressInfo = {
  info: {
    unconfirmedBalance: string
    balanceSat: string
    balance: number
    addrStr: string
    unconfirmedBalanceSat: string
  }
  addr: string
  block_height: number
  uxtos?: {
    // "uxtos" API側のスペルミスをそのまま引き継ぎ
    ts: number
    confirmations: number
    amount: string
    address: string
    vout: number
    txid: string
    confirmationsFromCache: boolean
  }[]
  last_txns?: string[]
}

// functions

export async function getChainBlockHeight(): Promise<number> {
  return await counterblockRpc<number>('get_chain_block_height', {})
}

export async function broadcastTx(signedTxHex: string): Promise<string> {
  const params = { signed_tx_hex: signedTxHex }
  return await counterblockRpc<string>('broadcast_tx', params)
}

export async function getChainAddressInfo(params: CbGetAddressInfoParams): Promise<CbChainAddressInfo[]> {
  return await counterblockRpc<CbChainAddressInfo[]>('get_chain_address_info', camelKeysToSnakeKeys(params))
}

// #endregion

// #region RPC

export async function counterblockRpc<T = JsonValue>(
  method: string,
  params: JsonValue,
  endpoint = bestEndpoint || endpoints[0],
): Promise<T> {
  const body = { jsonrpc: '2.0', id: 0, method, params }
  if (!endpoint) throw new Error('No Monaparty endpoint specified')
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSONbig.stringify(body),
  })
  if (!res.ok) throw new Error(`Monaparty API error: HTTP ${res.status}`)
  const json = await res.json()
  if (json.error) throw new Error(`Monaparty RPC error: ${JSONbig.stringify(json.error)}`)
  return json.result as T
}

export async function counterpartyRpc<T = JsonValue>(method: string, params: JsonValue, endpoint?: string): Promise<T> {
  const cbParams = { method, params }
  return await counterblockRpc<T>('proxy_to_counterpartyd', cbParams, endpoint)
}

// #endregion

// #region Utilities

type JsonValue = undefined | string | number | bigint | boolean | null | JsonValue[] | { [key: string]: JsonValue } // bigint拡張

function camelToSnake(str: string): string {
  return str.replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase()
}

function camelKeysToSnakeKeys(params: JsonValue): JsonValue {
  if (params === null || typeof params !== 'object') return params
  if (Array.isArray(params)) return params.map((item) => camelKeysToSnakeKeys(item))
  const result: { [key: string]: JsonValue } = {}
  for (const key in params) {
    const snakeKey = camelToSnake(key)
    if (params[key] !== undefined) result[snakeKey] = camelKeysToSnakeKeys(params[key])
  }
  return result
}

// #endregion
