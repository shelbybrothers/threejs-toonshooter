'use strict';

/*
 * Optional treasury payout for committed match winners.
 *
 * SAFETY: OFF by default. If TREASURY_SECRET_KEY is not set, this NEVER moves
 * funds — it only logs the pending reward. To enable real SOL payouts, the
 * operator sets these env vars on their own server:
 *   TREASURY_SECRET_KEY = JSON array of the treasury Keypair secret (e.g. "[12,34,...]")
 *   RPC_URL             = a Solana RPC endpoint
 *   REWARD_SOL          = amount to pay each committed winner (default 0.01)
 * The treasury key lives only in the operator's environment; it is never in code.
 */

const REWARD_SOL = Number(process.env.REWARD_SOL || 0.01);

async function payoutWinner(walletId, amountSol) {
  const secret = process.env.TREASURY_SECRET_KEY;
  const rpc = process.env.RPC_URL || 'https://api.mainnet-beta.solana.com';

  if (!secret) {
    console.log(`[reward] (log-only) committed winner ${walletId} earned ${amountSol} SOL. ` +
      `Set TREASURY_SECRET_KEY to enable real payouts.`);
    return null;
  }

  let web3;
  try {
    web3 = require('@solana/web3.js');
  } catch {
    console.warn('[reward] @solana/web3.js not installed; run `npm i @solana/web3.js` to enable payouts. Logging only.');
    console.log(`[reward] (log-only) committed winner ${walletId} earned ${amountSol} SOL.`);
    return null;
  }

  try {
    const conn = new web3.Connection(rpc, 'confirmed');
    const treasury = web3.Keypair.fromSecretKey(Uint8Array.from(JSON.parse(secret)));
    const toPubkey = new web3.PublicKey(walletId);
    const lamports = Math.round(amountSol * web3.LAMPORTS_PER_SOL);
    const tx = new web3.Transaction().add(
      web3.SystemProgram.transfer({ fromPubkey: treasury.publicKey, toPubkey, lamports })
    );
    const sig = await web3.sendAndConfirmTransaction(conn, tx, [treasury]);
    console.log(`[reward] paid ${amountSol} SOL to ${walletId} — ${sig}`);
    return sig;
  } catch (err) {
    console.error('[reward] payout failed:', err && err.message);
    throw err;
  }
}

module.exports = { payoutWinner, REWARD_SOL };
