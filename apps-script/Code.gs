/**
 * SIM-SPA Prodi Akuntansi — Google Apps Script API
 * Deploy as Web App; execute as owner; restrict access to intended users.
 * This starter uses Google Sheets as a shared data store.
 */
const CONFIG = {
  SPREADSHEET_ID: 'PASTE_SPREADSHEET_ID_HERE',
  APP_NAME: 'SIM-SPA Prodi Akuntansi',
  TOKEN_TTL_SECONDS: 21600,
  SHEETS: {
    Users: ['userId','name','email','passwordHash','salt','role','active','createdAt','updatedAt'],
    Assets: ['id','assetCode','name','category','brand','roomId','condition','quantity','unit','purchaseDate','purchaseValue','source','notes','createdAt','updatedAt'],
    Rooms: ['id','name','building','floor','capacity','notes','createdAt','updatedAt'],
    StockItems: ['id','name','category','unit','minimumStock','currentStock','notes','createdAt','updatedAt'],
    StockTransactions: ['id','itemId','type','quantity','date','reference','notes','createdBy','createdAt'],
    Loans: ['id','assetId','borrowerId','borrowerName','purpose','startDate','endDate','status','approvedBy','returnedAt','notes','createdAt','updatedAt'],
    Repairs: ['id','assetId','reporterId','reporterName','description','priority','status','assignedTo','reportedAt','resolvedAt','notes','createdAt','updatedAt'],
    AssetMutations: ['id','assetId','type','quantity','date','reason','approvedBy','notes','createdAt'],
    AssetDisposals: ['id','assetId','quantity','date','reason','approvedBy','notes','createdAt'],
    CleaningRecords: ['id','roomId','roomName','officerId','officerName','date','shift','status','notes','createdAt'],
    ActivityLogs: ['id','userId','userName','action','module','recordId','details','createdAt']
  }
};

function doGet(e) {
  const action = (e && e.parameter && e.parameter.action) || 'health';
  if (action === 'health') return json_({ok:true, app:CONFIG.APP_NAME, message:'API aktif'});
  return json_({ok:false,error:'Gunakan POST untuk operasi API.'});
}

function doPost(e) {
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const action = String(body.action || '');
    if (action === 'bootstrap') return json_(bootstrap_());
    if (action === 'login') return json_(login_(body));
    if (action === 'setupAdmin') return json_(setupAdmin_(body));
    const user = authenticate_(body.token);
    if (action === 'logout') {
      CacheService.getScriptCache().remove('session:' + body.token);
      return json_({ok:true});
    }
    if (action === 'list') return json_(listRecords_(user, body.module));
    if (action === 'save') return json_(saveRecord_(user, body.module, body.record));
    if (action === 'remove') return json_(removeRecord_(user, body.module, body.id));
    return json_({ok:false,error:'Action tidak dikenal.'});
  } catch (err) {
    return json_({ok:false,error:err.message || String(err)});
  }
}

function bootstrap_() {
  const ss = spreadsheet_();
  Object.keys(CONFIG.SHEETS).forEach(name => {
    let sh = ss.getSheetByName(name);
    if (!sh) sh = ss.insertSheet(name);
    if (sh.getLastRow() === 0) sh.appendRow(CONFIG.SHEETS[name]);
  });
  return {ok:true,spreadsheetId:ss.getId(),sheets:Object.keys(CONFIG.SHEETS)};
}

function setupAdmin_(body) {
  const lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    const sh = sheet_('Users');
    if (sh.getLastRow() > 1) throw new Error('Admin awal sudah dibuat. Gunakan pengelolaan akun secara manual oleh pemilik spreadsheet.');
    const name = String(body.name || '').trim();
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    if (!name || !email || password.length < 12) throw new Error('Nama, email, dan password minimal 12 karakter wajib diisi.');
    const salt = Utilities.getUuid().replace(/-/g,'');
    const hash = hashPassword_(password,salt);
    sh.appendRow([Utilities.getUuid(),name,email,hash,salt,'admin',true,new Date().toISOString(),new Date().toISOString()]);
    return {ok:true,message:'Admin awal berhasil dibuat. Hapus/ubah password setup setelah ini.'};
  } finally { lock.releaseLock(); }
}

function login_(body) {
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');
  const rows = records_('Users');
  const row = rows.find(r => String(r.email).toLowerCase() === email && String(r.active) !== 'false');
  if (!row || !constantTimeEquals_(hashPassword_(password,row.salt),row.passwordHash)) throw new Error('Email atau password tidak valid.');
  const token = Utilities.getUuid() + Utilities.getUuid();
  CacheService.getScriptCache().put('session:' + token, JSON.stringify({userId:row.userId,email:row.email,name:row.name,role:row.role}), CONFIG.TOKEN_TTL_SECONDS);
  return {ok:true,token,user:{id:row.userId,name:row.name,email:row.email,role:row.role}};
}

function authenticate_(token) {
  if (!token) throw new Error('Sesi tidak ditemukan. Silakan login kembali.');
  const raw = CacheService.getScriptCache().get('session:' + token);
  if (!raw) throw new Error('Sesi berakhir. Silakan login kembali.');
  const user = JSON.parse(raw);
  const current = records_('Users').find(r => r.userId === user.userId);
  if (!current || String(current.active) === 'false') throw new Error('Akun tidak aktif.');
  return user;
}

function listRecords_(user,module) {
  const name = moduleToSheet_(module);
  assertRead_(user,name);
  return {ok:true,records:records_(name)};
}

function saveRecord_(user,module,record) {
  const name = moduleToSheet_(module); assertWrite_(user,name,'save');
  if (!record || typeof record !== 'object') throw new Error('Data tidak valid.');
  const lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    const sh = sheet_(name), headers = CONFIG.SHEETS[name], values = sh.getDataRange().getValues();
    const id = String(record.id || Utilities.getUuid());
    const idx = values.findIndex((r,i)=>i>0 && String(r[headers.indexOf('id')])===id);
    const safe = headers.map(h => h==='id' ? id : (record[h] !== undefined ? record[h] : (h==='createdAt' ? new Date().toISOString() : '')));
    if (idx > 0) sh.getRange(idx+1,1,1,headers.length).setValues([safe]);
    else sh.appendRow(safe);
    log_(user,'Simpan',name,id,'Record disimpan');
    return {ok:true,id};
  } finally { lock.releaseLock(); }
}

function removeRecord_(user,module,id) {
  const name = moduleToSheet_(module); assertWrite_(user,name,'remove');
  if (name === 'Users' || name === 'ActivityLogs') throw new Error('Penghapusan data ini tidak diizinkan melalui API.');
  const sh = sheet_(name), values = sh.getDataRange().getValues(), idCol = CONFIG.SHEETS[name].indexOf('id');
  const idx = values.findIndex((r,i)=>i>0 && String(r[idCol])===String(id));
  if (idx < 1) throw new Error('Data tidak ditemukan.');
  sh.deleteRow(idx+1); log_(user,'Hapus',name,String(id),'Record dihapus');
  return {ok:true};
}

function assertRead_(user,sheetName) {
  const role = String(user.role);
  const all = ['admin','pimpinan'];
  const map = {
    Assets:['admin','pimpinan','dosen'], Rooms:['admin','pimpinan','dosen'],
    Loans:['admin','pimpinan','dosen'], Repairs:['admin','pimpinan','dosen','petugas'],
    CleaningRecords:['admin','pimpinan','dosen','petugas'],
    StockItems:['admin','pimpinan'], StockTransactions:['admin','pimpinan'],
    AssetMutations:['admin','pimpinan'], AssetDisposals:['admin','pimpinan'],
    ActivityLogs:['admin','pimpinan']
  };
  if (!(map[sheetName] || all).includes(role)) throw new Error('Akses baca ditolak.');
}
function assertWrite_(user,sheetName,operation) {
  const role = String(user.role);
  const adminOnly = ['Rooms','Assets','StockItems','StockTransactions','AssetMutations','AssetDisposals'];
  if (['admin','pimpinan'].includes(role)) {
    if (role === 'pimpinan' && ['remove'].includes(operation)) throw new Error('Pimpinan tidak dapat menghapus data.');
    return;
  }
  if (sheetName==='Loans' && role==='dosen' && operation==='save') return;
  if (sheetName==='Repairs' && ['dosen','petugas'].includes(role) && operation==='save') return;
  if (sheetName==='CleaningRecords' && role==='petugas' && operation==='save') return;
  if (adminOnly.includes(sheetName)) throw new Error('Hanya Admin/Pimpinan yang dapat mengubah modul ini.');
  throw new Error('Akses perubahan data ditolak.');
}

function moduleToSheet_(module) {
  const map={assets:'Assets',rooms:'Rooms',stockItems:'StockItems',stockTransactions:'StockTransactions',loans:'Loans',repairs:'Repairs',assetMutations:'AssetMutations',assetDisposals:'AssetDisposals',cleaningRecords:'CleaningRecords',activityLogs:'ActivityLogs'};
  const name=map[String(module||'')]; if(!name) throw new Error('Modul tidak valid.'); return name;
}
function records_(name) {
  const sh=sheet_(name), values=sh.getDataRange().getValues(); if(values.length<2) return [];
  const headers=values[0].map(String);
  return values.slice(1).filter(r=>r.some(v=>v!=='')).map(r=>headers.reduce((o,h,i)=>{let v=r[i];o[h]=v instanceof Date?v.toISOString():v;return o;},{}));
}
function log_(user,action,module,id,details) {
  const sh=sheet_('ActivityLogs'); sh.appendRow([Utilities.getUuid(),user.userId,user.name,action,module,id,details,new Date().toISOString()]);
}
function spreadsheet_() {
  if (!CONFIG.SPREADSHEET_ID || CONFIG.SPREADSHEET_ID.indexOf('PASTE_')===0) throw new Error('SPREADSHEET_ID belum diatur pada CONFIG.');
  return SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
}
function sheet_(name) { const sh=spreadsheet_().getSheetByName(name); if(!sh) throw new Error('Sheet '+name+' belum tersedia. Jalankan bootstrap.'); return sh; }
function hashPassword_(password,salt) {
  const bytes=Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,salt+'|'+password,Utilities.Charset.UTF_8);
  return bytes.map(b=>(b<0?b+256:b).toString(16).padStart(2,'0')).join('');
}
function constantTimeEquals_(a,b) { a=String(a);b=String(b);if(a.length!==b.length)return false;let x=0;for(let i=0;i<a.length;i++)x|=a.charCodeAt(i)^b.charCodeAt(i);return x===0; }
function json_(obj) { return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON); }
