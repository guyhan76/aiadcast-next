export const batchCounts = [1, 2, 4, 6, 8, 10] as const;
export type BatchWallet = {available:number; credits?:{available:number}; unlimited?:boolean};
export function batchPrice(wallet:BatchWallet, count:number) {
 if (!batchCounts.some(value=>value===count)) throw Error('INVALID_IMAGE_COUNT');
 const tickets=wallet.available, credits=wallet.credits?.available;
 if (!Number.isSafeInteger(tickets)||tickets<0||credits===undefined||!Number.isSafeInteger(credits)||credits<0) throw Error('INVALID_WALLET');
 const admin=wallet.unlimited===true;
 const ticketsUsed=admin?0:Math.min(count,tickets);
 const creditsUsed=admin?0:(count-ticketsUsed)*10;
 return {version:1,count,admin,tickets,credits,ticketsUsed,creditsUsed,ticketsAfter:tickets-ticketsUsed,creditsAfter:credits-creditsUsed};
}
export type BatchPrice=ReturnType<typeof batchPrice>;
export type AdBatch={id:string;count:number};
export function validBatch(batch:AdBatch|undefined):batch is AdBatch {
 return !!batch && /^ads-[a-f0-9]{64}$/.test(batch.id) && batchCounts.some(n=>n===batch.count);
}
