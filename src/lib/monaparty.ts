// Monaparty API Module

import jsonBigint from 'json-bigint'
const JSONbig = jsonBigint({ useNativeBigInt: true })

const MONAPARTY_ENDPOINTS = ['https://monapa.electrum-mona.org/_api', 'https://wallet.monaparty.me/_api']
let bestEndpoint: string = ''

// 最初にこれを呼んでおくと調子の良いサーバーを使ってくれます
export async function checkBestServer(): Promise<string> {
  const promises = []
  for (const endpoint of MONAPARTY_ENDPOINTS) {
    promises.push(counterpartyRpc('get_assets', { limit: 1 }, endpoint).then(() => endpoint))
  }
  try {
    bestEndpoint = await Promise.any(promises)
    return bestEndpoint
  } catch {
    throw new Error('All Monaparty endpoints are unavailable')
  }
}

// #region CounterpartyAPI
/*
参考:
https://docs.counterparty.io/docs/advanced/api-v1/api-v1-spec/
https://github.com/monaparty/counterparty-lib/blob/monaparty-develop/counterpartylib/lib/api.py

必要に応じて個別のラップ関数を追加してください
検証にはこちらのツールが便利です https://monapalette.komikikaku.com/monaparty_api
*/

//// #region GetTableAPI

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

export type GetTableParams = {
  filters?: Filter[]
  filterOp?: 'AND' | 'OR'
  orderBy?: string
  orderDir?: 'ASC' | 'DESC'
  startBlock?: number
  endBlock?: number
  status?: string | string[]
  limit?: number
  offset?: number
}
export type Filter = {
  field: string
  op: '==' | '!=' | '>' | '<' | '>=' | '<=' | 'IN' | 'LIKE' | 'NOT IN' | 'NOT LIKE' // LIKEは前方一致のみ
  value: string | number | boolean | null | (string | number)[]
}

export async function getAssets(params: GetTableParams): Promise<Asset[]> {
  return await counterpartyRpc<Asset[]>('get_assets', camelKeysToSnakeKeys(params))
}
export type Asset = {
  asset_id: string
  asset_longname: string | null
  asset_name: string
  asset_group: string | null
  block_index: number | null
}

export async function getAssetgroups(params: GetTableParams): Promise<Assetgroup[]> {
  return await counterpartyRpc<Assetgroup[]>('get_assetgroups', camelKeysToSnakeKeys(params))
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

export async function getBalances(params: GetTableParams): Promise<Balance[]> {
  return await counterpartyRpc<Balance[]>('get_balances', camelKeysToSnakeKeys(params))
}
export type Balance = {
  asset: string
  quantity: number | bigint
  address: string
}

export async function getIssuances(params: GetTableParams): Promise<Issuance[]> {
  return await counterpartyRpc<Issuance[]>('get_issuances', camelKeysToSnakeKeys(params))
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

export async function getDispensers(params: GetTableParams): Promise<Dispenser[]> {
  return await counterpartyRpc<Dispenser[]>('get_dispensers', camelKeysToSnakeKeys(params))
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

export async function getBroadcasts(params: GetTableParams): Promise<Broadcast[]> {
  return await counterpartyRpc<Broadcast[]>('get_broadcasts', camelKeysToSnakeKeys(params))
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

export async function getCredits(params: GetTableParams): Promise<Credit[]> {
  return await counterpartyRpc<Credit[]>('get_credits', camelKeysToSnakeKeys(params))
}
export type Credit = {
  asset: string
  quantity: number | bigint
  event: string
  address: string
  block_index: number
  calling_function: string
}

export async function getDebits(params: GetTableParams): Promise<Debit[]> {
  return await counterpartyRpc<Debit[]>('get_debits', camelKeysToSnakeKeys(params))
}
export type Debit = {
  asset: string
  quantity: number | bigint
  event: string
  action: string
  block_index: number
  address: string
}

// 汎用 get_{tableName}
export async function getTable<T = JsonValue>(tableName: TableName, params: GetTableParams): Promise<T[]> {
  const method = `get_${tableName}`
  return await counterpartyRpc<T[]>(method, camelKeysToSnakeKeys(params))
}

//// #endregion GetTableAPI

//// #region CreateAPI

export type CreateTxCommonParams = {
  encoding?: string
  pubkey?: string | string[]
  allowUnconfirmedInputs?: boolean
  fee?: number
  feePerKb?: number
  feeProvided?: number
  customInputs?: InputUtxo[]
  unspentTxHash?: string
  regularDustSize?: number
  multisigDustSize?: number
  dustReturnPubkey?: string
  disableUtxoLocks?: boolean
  opReturnValue?: number
  extendedTxInfo?: boolean
  p2shPretxTxid?: string
}
export type InputUtxo = {
  txid: string
  vout: number
  amount: number
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
  status: DispenserStatus
  openAddress?: string
  oracleAddress?: string
} & CreateTxCommonParams
export enum DispenserStatus {
  OPEN = 0,
  OPEN_USING_OPENADDRESS = 1,
  CLOSED = 10,
}

export type CreateSweepParams = {
  source: string
  destination: string
  flags: SweepFlags // OR mask
  memo?: string
} & CreateTxCommonParams
export enum SweepFlags {
  BALANCES = 1,
  OWNERSHIP = 2,
  BALANCES_AND_OWNERSHIP = 3, // BALANCES + OWNERSHIP
  BINARY_MEMO = 4,
}

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

export async function createSend(params: CreateSendParams & { extendedTxInfo: true }): Promise<TxInfo>
export async function createSend(params: CreateSendParams & { extendedTxInfo?: false }): Promise<string>
export async function createSend(params: CreateSendParams): Promise<string>
export async function createSend(params: CreateSendParams): Promise<string | TxInfo> {
  return await counterpartyRpc<string | TxInfo>('create_send', camelKeysToSnakeKeys(params))
}

export async function createIssuance(params: CreateIssuanceParams & { extendedTxInfo: true }): Promise<TxInfo>
export async function createIssuance(params: CreateIssuanceParams & { extendedTxInfo?: false }): Promise<string>
export async function createIssuance(params: CreateIssuanceParams): Promise<string>
export async function createIssuance(params: CreateIssuanceParams): Promise<string | TxInfo> {
  return await counterpartyRpc<string | TxInfo>('create_issuance', camelKeysToSnakeKeys(params))
}

export async function createDividend(params: CreateDividendParams & { extendedTxInfo: true }): Promise<TxInfo>
export async function createDividend(params: CreateDividendParams & { extendedTxInfo?: false }): Promise<string>
export async function createDividend(params: CreateDividendParams): Promise<string>
export async function createDividend(params: CreateDividendParams): Promise<string | TxInfo> {
  return await counterpartyRpc<string | TxInfo>('create_dividend', camelKeysToSnakeKeys(params))
}

export async function createDispenser(params: CreateDispenserParams & { extendedTxInfo: true }): Promise<TxInfo>
export async function createDispenser(params: CreateDispenserParams & { extendedTxInfo?: false }): Promise<string>
export async function createDispenser(params: CreateDispenserParams): Promise<string>
export async function createDispenser(params: CreateDispenserParams): Promise<string | TxInfo> {
  return await counterpartyRpc<string | TxInfo>('create_dispenser', camelKeysToSnakeKeys(params))
}

export async function createSweep(params: CreateSweepParams & { extendedTxInfo: true }): Promise<TxInfo>
export async function createSweep(params: CreateSweepParams & { extendedTxInfo?: false }): Promise<string>
export async function createSweep(params: CreateSweepParams): Promise<string>
export async function createSweep(params: CreateSweepParams): Promise<string | TxInfo> {
  return await counterpartyRpc<string | TxInfo>('create_sweep', camelKeysToSnakeKeys(params))
}

export async function createOrder(params: CreateOrderParams & { extendedTxInfo: true }): Promise<TxInfo>
export async function createOrder(params: CreateOrderParams & { extendedTxInfo?: false }): Promise<string>
export async function createOrder(params: CreateOrderParams): Promise<string>
export async function createOrder(params: CreateOrderParams): Promise<string | TxInfo> {
  return await counterpartyRpc<string | TxInfo>('create_order', camelKeysToSnakeKeys(params))
}

export async function createCancel(params: CreateCancelParams & { extendedTxInfo: true }): Promise<TxInfo>
export async function createCancel(params: CreateCancelParams & { extendedTxInfo?: false }): Promise<string>
export async function createCancel(params: CreateCancelParams): Promise<string>
export async function createCancel(params: CreateCancelParams): Promise<string | TxInfo> {
  return await counterpartyRpc<string | TxInfo>('create_cancel', camelKeysToSnakeKeys(params))
}

export async function createBroadcast(params: CreateBroadcastParams & { extendedTxInfo: true }): Promise<TxInfo>
export async function createBroadcast(params: CreateBroadcastParams & { extendedTxInfo?: false }): Promise<string>
export async function createBroadcast(params: CreateBroadcastParams): Promise<string>
export async function createBroadcast(params: CreateBroadcastParams): Promise<string | TxInfo> {
  return await counterpartyRpc<string | TxInfo>('create_broadcast', camelKeysToSnakeKeys(params))
}

export async function createDestroy(params: CreateDestroyParams & { extendedTxInfo: true }): Promise<TxInfo>
export async function createDestroy(params: CreateDestroyParams & { extendedTxInfo?: false }): Promise<string>
export async function createDestroy(params: CreateDestroyParams): Promise<string>
export async function createDestroy(params: CreateDestroyParams): Promise<string | TxInfo> {
  return await counterpartyRpc<string | TxInfo>('create_destroy', camelKeysToSnakeKeys(params))
}

export async function createBtcpay(params: CreateBtcpayParams & { extendedTxInfo: true }): Promise<TxInfo>
export async function createBtcpay(params: CreateBtcpayParams & { extendedTxInfo?: false }): Promise<string>
export async function createBtcpay(params: CreateBtcpayParams): Promise<string>
export async function createBtcpay(params: CreateBtcpayParams): Promise<string | TxInfo> {
  return await counterpartyRpc<string | TxInfo>('create_btcpay', camelKeysToSnakeKeys(params))
}

export async function createBurn(params: CreateBurnParams & { extendedTxInfo: true }): Promise<TxInfo>
export async function createBurn(params: CreateBurnParams & { extendedTxInfo?: false }): Promise<string>
export async function createBurn(params: CreateBurnParams): Promise<string>
export async function createBurn(params: CreateBurnParams): Promise<string | TxInfo> {
  return await counterpartyRpc<string | TxInfo>('create_burn', camelKeysToSnakeKeys(params))
}

export async function createBet(params: CreateBetParams & { extendedTxInfo: true }): Promise<TxInfo>
export async function createBet(params: CreateBetParams & { extendedTxInfo?: false }): Promise<string>
export async function createBet(params: CreateBetParams): Promise<string>
export async function createBet(params: CreateBetParams): Promise<string | TxInfo> {
  return await counterpartyRpc<string | TxInfo>('create_bet', camelKeysToSnakeKeys(params))
}

export type TxInfo = {
  tx_hex: string
  btc_in: number
  btc_out: number
  btc_change: number
  btc_fee: number
}

//// #endregion CreateAPI

//// #region OtherAPI
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

export async function getAssetInfo(assets: string[]): Promise<AssetInfo[]> {
  const params = { assets }
  return await counterpartyRpc<AssetInfo[]>('get_asset_info', params)
}
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

export async function geHolders(asset: string): Promise<AssetInfo[]> {
  const params = { asset }
  return await counterpartyRpc<AssetInfo[]>('get_holders', params)
}
export type Holder = {
  address: string
  address_quantity: number | bigint
  escrow: number | null
}

export async function getBlockInfo(blockIndex: number): Promise<BlockInfo> {
  const params = { block_index: blockIndex }
  return await counterpartyRpc<BlockInfo>('get_block_info', params)
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

export async function getUnspentTxouts(
  address: string,
  { unconfirmed, unspentTxHash, orderBy }: { unconfirmed?: boolean; unspentTxHash?: string; orderBy?: string } = {},
): Promise<MpUtxo[]> {
  const params = {
    address,
    unconfirmed, // この値と無関係に未確認UTXOが返ってくるときと返ってこないときがある
    unspent_tx_hash: unspentTxHash, // ドキュメントではboolだが実際はstring  txidを指定するとそのtx由来のutxoだけ返ってくるらしい
    order_by: orderBy,
  }
  return await counterpartyRpc<MpUtxo[]>('get_unspent_txouts', params)
}
export type MpUtxo = {
  confirmations: number // 未確認の場合はなぜか現在のブロック高が入っている
  amount: number
  vout: number
  value: number
  txid: string
  height: number // 未確認の場合は-1
  coinbase: number
}

export async function getAssetNames(): Promise<string[]> {
  const params = {}
  return await counterpartyRpc<string[]>('get_asset_names', params)
}

//// #endregion OtherAPI

// #endregion CounterpartyAPI

// #region CounterblockAPI
/*
参考: https://github.com/monaparty/counterblock/blob/monaparty-develop/counterblock/lib/processor/api.py

必要に応じて個別のラップ関数を追加してください
検証にはこちらのツールが便利です https://monapalette.komikikaku.com/monaparty_api

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

export async function getChainBlockHeight(): Promise<number> {
  return await counterblockRpc<number>('get_chain_block_height', {})
}

export async function broadcastTx(signedTxHex: string): Promise<string> {
  const params = { signed_tx_hex: signedTxHex }
  return await counterblockRpc<string>('broadcast_tx', params)
}

export async function getChainAddressInfo(
  addresses: string[],
  { withUtxos, withLastTxnHashes }: { withUtxos?: boolean; withLastTxnHashes?: boolean } = {},
): Promise<CbChainAddressInfo[]> {
  const params = {
    addresses,
    with_uxtos: withUtxos,
    with_last_txn_hashes: withLastTxnHashes, // ドキュメントではintだが実際はtrue/false
  }
  return await counterblockRpc<CbChainAddressInfo[]>('get_chain_address_info', params)
}
export type CbChainAddressInfo = {
  info: CbAddressInfo
  addr: string
  block_height: number
  uxtos?: CbUtxo[]
  last_txns?: string[]
}
export type CbAddressInfo = {
  unconfirmedBalance: string
  balanceSat: string
  balance: number
  addrStr: string
  unconfirmedBalanceSat: string
}
export type CbUtxo = {
  ts: number
  confirmations: number
  amount: string
  address: string
  vout: number
  txid: string
  confirmationsFromCache: boolean
}

// #endregion CounterblockAPI

// #region RPC

export async function counterblockRpc<T = JsonValue>(
  method: string,
  params: JsonValue,
  endpoint = bestEndpoint || MONAPARTY_ENDPOINTS[0]!,
): Promise<T> {
  const body = { jsonrpc: '2.0', id: 0, method, params }
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

// #endregion RPC

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

// #endregion Utilities
