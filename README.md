# Passkey Monacoin Wallet

Passkey を使ってモナコインのウォレットを生成するサンプルです

現在モナコインの Web3 アプリは Mpurse やモナパレットに接続する形が主流ですが、Passkey ウォレットであればユーザ側のセットアップやログインの手間が大幅に減るので、各サービスがウォレットを提供してもさほど煩わしくありません

Monaparty の利用を含めて1つのウォレットに用途が集中すると UI が複雑化しパフォーマンス面でも難があるため、各サービスが用途を絞ったウォレットを実装するのはかなりスジが良いと考えます

## memo

- WebAuthn の PRF extension を利用して Passkey から 256 bit 疑似乱数を生成し、その値を24単語 BIP39 ニーモニックに変換した上でウォレットシードとして使っています
- 2025年12月現在 PRF extension への対応状況は半端ですが、WebAuthn の正式仕様に入っているためいずれ広く使えるようになると考えられます
- Passkey はセキュアである代わりにユーザ自身でも管理ツールやサービスをまたいで同じ値を使用することができないので、必要に応じてユーザがウォレットをバックアップできた方が良いと考えて、このサンプルではいったんニーモニックを経由させています

## Project Setup

```sh
npm install
```

### Compile and Hot-Reload for Development

```sh
npm run dev
```

### Type-Check, Compile and Minify for Production

```sh
npm run build
```
