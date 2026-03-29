const { Connection, PublicKey } = require('@solana/web3.js');
const connection = new Connection('https://rpc.ankr.com/solana', 'confirmed');

async function test() {
  const address = 'vines1vzrYbzLMRdu58ou5XTby4qAqVRLmqo36NKPTg';
  const pubKey = new PublicKey(address);
  const sigs = await connection.getSignaturesForAddress(pubKey, { limit: 1 });
  if (sigs.length === 0) return console.log("No sigs for vines1");
  
  const tx = await connection.getParsedTransaction(sigs[0].signature, { maxSupportedTransactionVersion: 0 });
  
  console.log("AccountKeys:", tx.transaction.message.accountKeys.map(k => typeof k.pubkey === 'string' ? k.pubkey : k.pubkey.toBase58()));
  
  let totalSent = 0n;
  let accountIndex = -1;
  const accountKeys = tx.transaction.message.accountKeys;
  for (let i = 0; i < accountKeys.length; i++) {
    const pk = accountKeys[i].pubkey;
    const str = typeof pk === 'string' ? pk : pk.toBase58();
    if (str === address) {
      accountIndex = i;
      break;
    }
  }
  
  console.log("Account Index:", accountIndex);
  if (accountIndex !== -1) {
    const preBalance = BigInt(tx.meta.preBalances[accountIndex] || 0);
    const postBalance = BigInt(tx.meta.postBalances[accountIndex] || 0);
    const fee = (accountIndex === 0) ? BigInt(tx.meta.fee || 0) : 0n;

    console.log("Pre:", preBalance, "Post:", postBalance, "Fee:", fee);
    let netChange = postBalance - preBalance;
    if (accountIndex === 0) netChange += fee;
    console.log("Net Change:", netChange);
  }
}

test().catch(console.error);
