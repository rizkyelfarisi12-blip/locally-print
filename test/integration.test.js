// Butuh: npm install. Jalankan: npm run test:int  (memakai MockPrinter, hanya untuk pengujian)
process.env.MOCK_PRINTER='1';process.env.PIN='';process.env.ADMIN_PIN='';
const test=require('node:test'),assert=require('node:assert'),fs=require('fs'),path=require('path');
const {app,mockLog}=require('../server');
let srv,base;
test.before(()=>new Promise(r=>{srv=app.listen(0,'127.0.0.1',()=>{base='http://127.0.0.1:'+srv.address().port;r()})}));
test.after(()=>srv.close());
const MIN='%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF';
async function upload(name,body){const fd=new FormData();fd.append('file',new Blob([body]),name);return fetch(base+'/api/upload',{method:'POST',body:fd})}
test('file tidak didukung ditolak',async()=>assert.equal((await upload('x.exe','MZ')).status,400));
test('upload PDF lalu print memakai opsi yang dipilih',async()=>{
  const u=await upload('a.pdf',MIN);assert.equal(u.status,200);const f=await u.json();
  const r=await fetch(base+'/api/print',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({fileId:f.id,name:'a.pdf',printer:'MockPrinter',copies:3,paper:'A4',orientation:'landscape',color:'gray',sides:'long',nup:2,pages:f.pages})});
  assert.equal(r.status,200);const j=await r.json();assert.equal(j.status,'submitted');
  const m=mockLog.at(-1);assert.equal(m.o.copies,3);assert.equal(m.o.orientation,'landscape');assert.equal(m.o.sides,'long');
});
test('printer tak dikenal & opsi driver ilegal ditolak',async()=>{
  const f=await (await upload('b.pdf',MIN)).json();
  const post=b=>fetch(base+'/api/print',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({fileId:f.id,name:'b',copies:1,...b})});
  assert.equal((await post({printer:'Nope'})).status,400);
  assert.equal((await post({printer:'MockPrinter',driverOpts:{InputSlot:'Tray9'}})).status,500);
});
