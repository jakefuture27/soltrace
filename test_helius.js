require('dotenv').config();
const HELIUS_API_KEY = process.env.HELIUS_API_KEY;

async function testHeliusREST() {
  const address = 'vines1vzrYbzLMRdu58ou5XTby4qAqVRLmqo36NKPTg';
  let hasMore = true;
  let before = null;
  let allTxs = [];
  
  while (hasMore) {
    let url = `https://api.helius.xyz/v0/addresses/${address}/transactions?api-key=${HELIUS_API_KEY}`;
    if (before) {
      url += `&before=${before}`;
    }
    
    // Using native fetch
    const response = await fetch(url);
    if (!response.ok) {
       console.log("Error fetching:", response.status);
       break;
    }
    const data = await response.json();
    if (data.length === 0) {
      hasMore = false;
      break;
    }
    
    allTxs = allTxs.concat(data);
    before = data[data.length - 1].signature;
    
    if (allTxs.length > 300) break; // limit for test
  }
  
  console.log("Fetched total txs:", allTxs.length);
  const firstTx = allTxs[0];
  console.log("Tx keys:", Object.keys(firstTx));
  console.log("Native transfers:", firstTx.nativeTransfers);
  
  let totalSent = 0n;
  for (const tx of allTxs) {
     if (tx.nativeTransfers) {
        for (const nft of tx.nativeTransfers) {
           if (nft.fromUserAccount === address) {
              totalSent += BigInt(nft.amount);
           }
        }
     }
  }
  console.log("Total Sent Lamports:", totalSent);
}

testHeliusREST().catch(console.error);
