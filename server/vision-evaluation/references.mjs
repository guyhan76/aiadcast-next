// Parent materialized and visually inspected these exact originals, then computed
// SHA-256 from their bytes. No hash was inferred from filename or model output.
export const APPROVED_REFERENCES=Object.freeze([
 Object.freeze({name:'22932.jpg',libraryFileId:'libfile_5aca4b318fbc81918717e3bb2931f243',bytes:321791,sha256:'d24f9214030cf8482daca04981b3dc2ece16f2d12c3f3e8937420895550d71c3',dimensions:{width:'300',depth:'200',height:'100'},basis:'outer-body',label:'박스'}),
 Object.freeze({name:'22935.jpg',libraryFileId:'libfile_76fc0c91a4f481918f7d51f32dbd25d6',bytes:240662,sha256:'b878decae3ad8287330451da90e8f83b044b039407eda831bdd37248bee1054b',dimensions:{width:'350',depth:'130',height:'260'},basis:'body',label:'쇼핑백 · 손잡이 제외 본체'}),
]);
export const APPROVED_HASHES=Object.freeze(Object.fromEntries(APPROVED_REFERENCES.map(r=>[r.name,r.sha256])));
