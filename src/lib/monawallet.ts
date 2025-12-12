// Monacoin + Monaparty Wallet Module

import { HDKey } from '@scure/bip32'
import * as bip39 from '@scure/bip39'
import * as btcSigner from '@scure/btc-signer'
import { wordlist } from '@scure/bip39/wordlists/english.js'
import { hex } from '@scure/base'
import * as esplora from './esplora'
import * as monaparty from './monaparty'
import * as monapartyCached from './monaparty-cached'

const SATOSHI = 100_000_000
export type AddressType = 'P2PKH' | 'P2WPKH'
const DEFAULT_ADDRESS_PATH = {
  P2PKH: "m/44'/22'/0'/0/0", // BIP44 Monacoin
  P2WPKH: "m/84'/22'/0'/0/0", // BIP84 Monacoin
}
const MONA_NETWORK = {
  bech32: 'mona',
  pubKeyHash: 0x32, // 50
  scriptHash: 0x37, // 55
  wif: 0xb0, // 176
} as const

export class MonaWallet {
  readonly address: string
  readonly addressType: AddressType // 取引所の対応状況やMonaparty仕様の問題があるためP2PKH推奨
  readonly addressPath: string
  readonly entropy: Uint8Array // 256bit
  readonly mnemonic: string // BIP39 24words
  readonly privateKey: Uint8Array
  readonly script: Uint8Array
  // mona
  balance = 0
  unconfBalance = 0
  utxos: Utxo[] = []
  isUnconfUtxoAvailable = false
  useEsplora = true
  // monaparty
  assetBalances: AssetBalance[] = []

  constructor(entropy: Uint8Array, addressType: AddressType = 'P2PKH', addressPath: string = DEFAULT_ADDRESS_PATH[addressType]) {
    this.addressType = addressType
    this.addressPath = addressPath
    this.entropy = new Uint8Array(entropy)
    this.mnemonic = bip39.entropyToMnemonic(this.entropy, wordlist)

    const seed = bip39.mnemonicToSeedSync(this.mnemonic)
    const root = HDKey.fromMasterSeed(seed)
    const child = root.derive(this.addressPath)
    if (!child.publicKey || !child.privateKey) throw new Error('MonaWallet: Failed to derive key')
    this.privateKey = child.privateKey

    if (addressType === 'P2PKH') {
      const p2pkh = btcSigner.p2pkh(child.publicKey, MONA_NETWORK)
      if (!p2pkh.address) throw new Error('MonaWallet: Failed to generate address')
      this.address = p2pkh.address
      this.script = p2pkh.script
    } else {
      const p2wpkh = btcSigner.p2wpkh(child.publicKey, MONA_NETWORK)
      if (!p2wpkh.address) throw new Error('MonaWallet: Failed to generate address')
      this.address = p2wpkh.address
      this.script = p2wpkh.script
    }
  }

  // #region MonacoinMethods

  async updateBalance(): Promise<void> {
    const utxos = await this.getUtxos()
    const confirmedSat = utxos.filter((u) => u.confirmed).reduce((sum, u) => sum + u.value, 0)
    const unconfSat = utxos.filter((u) => !u.confirmed).reduce((sum, u) => sum + u.value, 0)
    this.utxos = utxos
    this.balance = confirmedSat / 100_000_000
    this.unconfBalance = unconfSat / 100_000_000
  }

  async sendMona(toAddress: string, amount: number, feeSatPerVByte: number = 200): Promise<string> {
    const amountSat = Math.floor(amount * SATOSHI)
    if (amountSat <= 0) throw new Error('Amount must be greater than 0')
    const availableUtxos = this.utxos.filter((u) => u.confirmed)
    if (availableUtxos.length === 0) throw new Error('No confirmed UTXOs available')
    // construct transaction
    const tx = new btcSigner.Transaction({ allowLegacyWitnessUtxo: true })
    let inputTotal = 0
    const usedUtxos: Utxo[] = []
    // add inputs
    for (const utxo of availableUtxos) {
      tx.addInput({
        txid: utxo.txid,
        index: utxo.vout,
        witnessUtxo: { script: this.script, amount: BigInt(utxo.value) },
      })
      inputTotal += utxo.value
      usedUtxos.push(utxo)
      if (inputTotal >= amountSat + SATOSHI / 1000) break
    }
    tx.addOutputAddress(toAddress, BigInt(amountSat), MONA_NETWORK) // add output
    // fee and change calculation
    // P2PKH input: ~148 vbytes, P2WPKH input: ~68 vbytes, output: ~31-34 vbytes
    const inputVSize = this.addressType === 'P2PKH' ? 148 : 68
    const outputVSize = 34
    const estimatedVSize = usedUtxos.length * inputVSize + outputVSize + outputVSize + 10 // inputs + output + change + overhead
    const feeSat = Math.ceil(estimatedVSize * feeSatPerVByte)
    const changeSat = inputTotal - amountSat - feeSat
    if (changeSat < 0)
      throw new Error(`Insufficient balance. Need ${(amountSat + feeSat) / SATOSHI} MONA, have ${inputTotal / SATOSHI} MONA`)
    if (changeSat > 546) tx.addOutputAddress(this.address, BigInt(changeSat), MONA_NETWORK) // ダストでなければお釣りを回収
    const txId = await this.signAndBroadcastTx(tx)
    return txId
  }

  async signAndBroadcastTx(tx: btcSigner.Transaction): Promise<string> {
    for (let i = 0; i < tx.inputsLength; i++) tx.signIdx(this.privateKey, i)
    tx.finalize()
    const signedTxHex = hex.encode(tx.extract())
    return await this.broadcastTx(signedTxHex)
  }

  async broadcastTx(txHex: string): Promise<string> {
    if (this.useEsplora) {
      try {
        return await esplora.postTx(txHex)
      } catch (error) {
        console.warn('Esplora API failed, falling back to Monaparty API:', error)
        this.useEsplora = false
      }
    }
    return await monaparty.broadcastTx(txHex)
  }

  async getUtxos(): Promise<Utxo[]> {
    if (this.useEsplora) {
      try {
        this.isUnconfUtxoAvailable = true
        return await getEsploraUtxo(this.address)
      } catch (error) {
        console.warn('Esplora API failed, falling back to Monaparty API:', error)
        this.useEsplora = false
      }
    }
    this.isUnconfUtxoAvailable = false // getChainAddressInfoはmempoolを反映しない
    return await getCounterblockUtxos(this.address)
  }

  // #endregion

  // #region MonapartyMethods

  async updateAssetBalances(): Promise<void> {
    const balanceFilter: monaparty.GetTableParams = { filters: [{ field: 'address', op: '==', value: this.address }] }
    const balances = await monaparty.getBalances(balanceFilter)
    await monapartyCached.getAssetInfo(balances.map((bal) => bal.asset))
    this.assetBalances = balances
      .map((bal) => {
        const assetInfo = monapartyCached.assetInfoCache.get(bal.asset)
        if (!assetInfo) throw new Error(`MonaWallet: Asset info not found for asset ${bal.asset}`)
        const assetMainName = assetInfo.asset_longname || assetInfo.asset
        const assetSubName = assetInfo.asset_longname ? assetInfo.asset : null
        return { assetMainName, assetSubName, ...bal, ...assetInfo }
      })
      .sort(sortAssetBalances)
  }

  async sendAsset(toAddress: string, asset: string, amount: number | string, feeSatPerByte: number = 200): Promise<string> {
    const balance = this.assetBalances.find((bal) => bal.asset === asset)
    if (!balance) throw new Error(`MonaWallet: No balance for asset ${asset}`)
    const quantity = amountToQuantity(amount, balance.divisible)
    const txHex = await monaparty.createSend({
      source: this.address,
      destination: toAddress,
      asset: asset,
      quantity: quantity,
      feePerKb: feeSatPerByte * 1000,
      allowUnconfirmedInputs: this.isUnconfUtxoAvailable,
    })
    inspectMonapartyTxHex(txHex, this.address)
    const txId = await this.signAndBroadcastMonapartyTxHex(txHex)
    return txId
  }

  async postBroadcast(text: string, value: number = -1, feeSatPerByte: number = 250): Promise<string> {
    const txHex = await monaparty.createBroadcast({
      source: this.address,
      text: text,
      value: value,
      timestamp: Math.floor(Date.now() / 1000),
      feeFraction: 0,
      feePerKb: feeSatPerByte * 1000,
      allowUnconfirmedInputs: this.isUnconfUtxoAvailable,
    })
    const txId = await this.signAndBroadcastMonapartyTxHex(txHex)
    return txId
  }

  async signAndBroadcastMonapartyTxHex(txHex: string): Promise<string> {
    // createXXXで生成されたtxHexは形式が古いのでPSBTで再構築する
    await this.updateBalance() // UTXOを最新化
    const txBytes = hex.decode(txHex)
    const mpTx = btcSigner.Transaction.fromRaw(txBytes, {
      allowUnknownInputs: true,
      allowUnknownOutputs: true,
      disableScriptCheck: true,
    })
    const newTx = new btcSigner.Transaction({
      allowUnknownOutputs: true,
      disableScriptCheck: true,
      allowLegacyWitnessUtxo: true,
    })
    // inputsをコピー（witnessUtxoを追加）
    for (let i = 0; i < mpTx.inputsLength; i++) {
      const input = mpTx.getInput(i)
      const inputTxid = input.txid ? hex.encode(input.txid) : ''
      const utxo = this.utxos.find((u) => u.txid === inputTxid && u.vout === input.index)
      if (!utxo) throw new Error(`MonaWallet: UTXO not found for input ${i}: ${inputTxid}:${input.index}`)
      newTx.addInput({
        txid: inputTxid,
        index: input.index,
        sequence: input.sequence,
        witnessUtxo: { script: this.script, amount: BigInt(utxo.value) },
      })
    }
    // outputsをコピー
    for (let i = 0; i < mpTx.outputsLength; i++) {
      const output = mpTx.getOutput(i)
      if (output.script && output.amount !== undefined) {
        newTx.addOutput({ script: output.script, amount: output.amount })
      }
    }
    return await this.signAndBroadcastTx(newTx)
  }

  // #endregion
}

// #region Utilities

function inspectMonapartyTxHex(txHex: string, sourceAddress: string): void {
  // txHexの中身を解析してアドレスから出ていくMONAが多すぎたら例外を投げる
  const MAX_OUTSAT_PER_BYTE = 1000 // 1MB=10MONA
  const txBytes = hex.decode(txHex)
  const tx = btcSigner.Transaction.fromRaw(txBytes, { allowUnknownOutputs: true })
  const decodedAddress = btcSigner.Address(MONA_NETWORK).decode(sourceAddress)
  const p2wpkhScript = btcSigner.OutScript.encode(decodedAddress)
  let totalOutputSat = 0n
  let changeBackSat = 0n
  for (let i = 0; i < tx.outputsLength; i++) {
    const output = tx.getOutput(i)
    totalOutputSat += output.amount ?? 0n
    if (output.script && arraysEqual(output.script, p2wpkhScript)) {
      changeBackSat += output.amount ?? 0n
    }
  }
  const actualOutflowSat = totalOutputSat - changeBackSat
  if (actualOutflowSat > txBytes.length * MAX_OUTSAT_PER_BYTE)
    throw new Error(`Transaction sends too much MONA from your address.\nActual outflow: ${Number(actualOutflowSat) / SATOSHI} MONA`)
}

async function getEsploraUtxo(address: string): Promise<Utxo[]> {
  const esUtxos = await esplora.getUtxos(address)
  const utxos = esUtxos.map((u) => {
    return {
      txid: u.txid,
      vout: u.vout,
      value: u.value,
      confirmed: u.status.confirmed,
    }
  })
  return utxos
}

async function getCounterblockUtxos(address: string): Promise<Utxo[]> {
  const result = await monaparty.getChainAddressInfo({ addresses: [address], withUxtos: true, withLastTxnHashes: false })
  if (!result[0]) throw new Error('MonaWallet: balance fetch failed')
  const info = result[0]
  const cbUtxos = info.uxtos || []
  const utxos = cbUtxos.map((u) => {
    return {
      txid: u.txid,
      vout: u.vout,
      value: Math.round(Number(u.amount) * SATOSHI),
      confirmed: u.confirmations > 0,
    }
  })
  return utxos
}

function sortAssetBalances(a: AssetBalance, b: AssetBalance): number {
  // 1. XMP first
  if (a.asset === 'XMP') return -1
  if (b.asset === 'XMP') return 1
  // 2. Non-A____ assets before A____ assets
  const aIsAAsset = a.asset.startsWith('A')
  const bIsAAsset = b.asset.startsWith('A')
  if (aIsAAsset && !bIsAAsset) return 1
  if (!aIsAAsset && bIsAAsset) return -1
  // 3. Alphabetical order
  if (a.assetMainName < b.assetMainName) return -1
  if (a.assetMainName > b.assetMainName) return 1
  return 0
}

function amountToQuantity(amount: number | string, divisible: boolean): bigint {
  const amountStr = amount.toString()
  let quantity: bigint
  if (divisible) {
    const parts = amountStr.split('.')
    const integerPart = parts[0] || '0'
    const decimalPart = (parts[1] || '').padEnd(8, '0').slice(0, 8)
    quantity = BigInt(integerPart + decimalPart)
  } else {
    quantity = BigInt(amountStr)
  }
  return quantity
}

function arraysEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false
  }
  return true
}

// #endregion

// #region Types

export type Utxo = {
  txid: string
  vout: number
  value: number
  confirmed: boolean
}

export type AssetBalance = {
  assetMainName: string
  assetSubName: string | null
} & monaparty.Balance &
  monaparty.AssetInfo

// #endregion
