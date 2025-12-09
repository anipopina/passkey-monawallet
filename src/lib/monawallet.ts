// Monacoin + Monaparty Wallet Module

import { HDKey } from '@scure/bip32'
import * as bip39 from '@scure/bip39'
import * as btcSigner from '@scure/btc-signer'
import { wordlist } from '@scure/bip39/wordlists/english.js'
import { hex } from '@scure/base'
import * as monaparty from './monaparty'

const SATOSHI = 100_000_000
const DEFAULT_ADDRESS_PATH = "m/84'/22'/0'/0/0" // BIP84 Monacoin
const MONA_NETWORK = {
  bech32: 'mona',
  pubKeyHash: 0x32, // 50
  scriptHash: 0x37, // 55
  wif: 0xb0, // 176
} as const

export class MonaWallet {
  readonly entropy: Uint8Array // 256bit
  readonly mnemonic: string // BIP39 24words
  readonly address: string // P2WPKH
  readonly derivationPath: string
  private readonly hdKey: HDKey
  balance = 0
  unconfBalance = 0
  utxos: Utxo[] = []

  constructor(entropy: Uint8Array, derivationPath: string = DEFAULT_ADDRESS_PATH) {
    this.entropy = new Uint8Array(entropy)
    this.mnemonic = bip39.entropyToMnemonic(this.entropy, wordlist)
    this.derivationPath = derivationPath
    const seed = bip39.mnemonicToSeedSync(this.mnemonic)
    const root = HDKey.fromMasterSeed(seed)
    const child = root.derive(this.derivationPath)
    if (!child.publicKey) throw new Error('Failed to derive public key')
    this.hdKey = child
    const p2wpkh = btcSigner.p2wpkh(child.publicKey, MONA_NETWORK)
    if (!p2wpkh.address) throw new Error('Failed to generate address')
    this.address = p2wpkh.address
  }

  async updateBalance(): Promise<void> {
    const result = await monaparty.getChainAddressInfo([this.address], {
      withUtxos: true,
      withLastTxnHashes: false,
    })
    if (!Array.isArray(result) || result.length === 0 || !result[0]) throw new Error('MonaWallet: balance fetch failed')
    const info = result[0]
    const responseUtxos = info.uxtos ?? []
    const utxos = cbUtxosToUtxos(responseUtxos)
    const confirmedSat = utxos.filter((u) => u.confirmations >= 1).reduce((sum, u) => sum + u.value, 0)
    const unconfSat = utxos.filter((u) => u.confirmations < 1).reduce((sum, u) => sum + u.value, 0)
    this.utxos = utxos
    this.balance = confirmedSat / 100_000_000
    this.unconfBalance = unconfSat / 100_000_000
    // NOTE: monapartyから取得したUTXOにはmempoolが反映されない
  }

  async sendMona(toAddress: string, amount: number, feeRateSatPerVByte: number = 200): Promise<string> {
    const amountSat = Math.floor(amount * SATOSHI)
    if (amountSat <= 0) throw new Error('Amount must be greater than 0')
    const availableUtxos = this.utxos.filter((u) => u.confirmations >= 1)
    if (availableUtxos.length === 0) throw new Error('No confirmed UTXOs available')
    // construct transaction
    const tx = new btcSigner.Transaction()
    let inputTotal = 0
    const usedUtxos: Utxo[] = []
    for (const utxo of availableUtxos) {
      tx.addInput({
        txid: utxo.txid,
        index: utxo.vout,
        witnessUtxo: {
          script: btcSigner.p2wpkh(this.hdKey.publicKey!, MONA_NETWORK).script,
          amount: BigInt(utxo.value),
        },
      })
      inputTotal += utxo.value
      usedUtxos.push(utxo)
      if (inputTotal >= amountSat + SATOSHI / 1000) break // 手数料を考慮して多めに確保
    }
    tx.addOutputAddress(toAddress, BigInt(amountSat), MONA_NETWORK)
    // fee and change calculation, P2WPKH input: ~68 vbytes, output: ~31 vbytes
    const estimatedVSize = usedUtxos.length * 68 + 31 + 31 + 10 // inputs + output + change + overhead
    const feeSat = Math.ceil(estimatedVSize * feeRateSatPerVByte)
    const changeSat = inputTotal - amountSat - feeSat
    if (changeSat < 0) throw new Error(`Insufficient balance. Need ${amountSat + feeSat} sat, have ${inputTotal} sat`)
    if (changeSat > 546) tx.addOutputAddress(this.address, BigInt(changeSat), MONA_NETWORK) // ダストでなければお釣りを回収
    // sign and broadcast
    if (!this.hdKey.privateKey) throw new Error('Private key not available')
    for (let i = 0; i < usedUtxos.length; i++) tx.signIdx(this.hdKey.privateKey, i)
    tx.finalize()
    const txHex = hex.encode(tx.extract())
    const txid = await monaparty.broadcastTx(txHex)
    return txid
  }
}

type Utxo = {
  txid: string
  vout: number
  value: number
  amount: string // not number
  confirmations: number
}

function cbUtxosToUtxos(mUtxos: monaparty.CbUtxo[]): Utxo[] {
  return mUtxos.map((cbUtxo) => {
    return {
      txid: cbUtxo.txid,
      vout: cbUtxo.vout,
      value: Math.round(Number(cbUtxo.amount) * SATOSHI),
      amount: cbUtxo.amount,
      confirmations: cbUtxo.confirmations,
    }
  })
}

// function utxosToInputUtxos(utxos: Utxo[]): monaparty.InputUtxo[] {
//   return utxos.map((utxo) => {
//     return {
//       txid: utxo.txid,
//       vout: utxo.vout,
//       amount: Number(utxo.amount),
//     }
//   })
// }
