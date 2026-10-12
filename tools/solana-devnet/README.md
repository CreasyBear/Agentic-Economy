# Solana devnet x402 purchase

An aecon agent buys a paid Tool over x402 on Solana devnet. The agent pays from its own CDP-custodied Solana account. Before anything is signed, the agent's per-Call and daily caps are checked.

Scope: this is devnet only and the USDC has no value. Production aecon settles on Base; this code does not touch the Base rail, production configuration or Convex.

## What runs

- `seller.ts` is a local x402 Tool at `GET /gst?amount=<AUD inclusive>`. It returns the GST breakdown at the 10% rate and charges 0.01 devnet USDC. The payment goes to the CDP account `ae-devnet-seller`. Settlement runs through the keyless x402.org facilitator, which also pays the Solana fee.
- `buyer.ts` acts for one agent (`--agent`, default `demo`). It reads the 402 challenge, checks the price against the caps, signs with `CdpX402Client` on `solana-devnet` from the CDP account `ae-devnet-agent-<agent>`, and checks that `PAYMENT-RESPONSE` reports success, a transaction signature and the agent's address as payer. It then prints the Solana Explorer link and writes a JSON receipt to `output/solana-devnet/receipts/<agent>/`. That folder is gitignored.
- `setup.ts` creates or fetches both CDP accounts by name. If they are short of funds, it requests devnet USDC from the CDP faucet. The faucet drip also creates the seller's USDC token account, which the exact SVM scheme pays into. The buyer needs no SOL.

Caps default to 0.05 USDC per Call and 0.20 USDC per day. Today's spend is the sum of the agent's settled receipts on this machine for the current UTC day. If the price exceeds either cap, the buyer refuses, writes a `refused` receipt and never provisions the wallet or signs.

## Run it on camera

Run these from a checkout whose `.env.local` holds `CDP_API_KEY_ID`, `CDP_API_KEY_SECRET` and `CDP_WALLET_SECRET`.

```sh
npm run devnet:setup                          # once: accounts and faucet USDC
npm run devnet:seller                         # terminal 1: the paid Tool on :4021
npm run devnet:buy                            # terminal 2: within cap, pays 0.01 USDC
npm run devnet:buy -- --per-call 0.005        # over the per-Call cap, refused before signing
npm run devnet:buy -- --daily 0.015           # after one paid Call, over the daily cap
```

Other flags are `--agent <id>` and `--url <tool url>` on the buyer, and `--price`, `--port`, `--pay-to` and `--facilitator` on the seller.

If the CDP faucet refuses, `setup` prints the address to fund. Request devnet USDC for it at https://faucet.circle.com/ and choose Solana Devnet.

The test is `tests/unit/solana-devnet/purchase.test.ts`. It needs no network.

## Mainnet

`--network mainnet` (default `devnet`) switches the buyer to `solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp`, mainnet USDC `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`, the CDP network `solana` and receipts in `output/solana-mainnet/receipts/<agent>/`. The same CDP account name signs on both networks. This spends real USDC; there is no local seller, so pass `--url` to an independent Tool:

```sh
npm run devnet:buy -- --network mainnet --url '<tool url>' --per-call 0.005   # free: refused before signing
npm run devnet:buy -- --network mainnet --url '<tool url>' --per-call 0.01 --daily 0.02
```

Once a settlement succeeds, the buyer never throws before the receipt is written. A payer or network that disagrees with the request goes into the receipt's `discrepancies`.
