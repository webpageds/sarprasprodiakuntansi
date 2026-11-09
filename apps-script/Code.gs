/**
 * SIM-SPA Prodi Akuntansi — Google Apps Script API
 * Deploy as Web App; execute as owner; restrict access to intended users.
 * This starter uses Google Sheets as a shared data store.
 */
const CONFIG = {
  SPREADSHEET_ID: '1Iw8dFUmF8S65vv8jaqeKcu26cvfh_bq23dk-aJ2Pj-c',
  APP_NAME: 'SIM-SPA Prodi Akuntansi',
  TOKEN_TTL_SECONDS: 21600,
  SHEETS: {
    Users: ['userId','name','email','username','nuptk','passwordHash','salt','role','active','mustChangePassword','createdAt','updatedAt'],
    LecturerRoster: ['name','nuptk','role','email'],
    Assets: ['id','assetCode','name','category','brand','roomId','condition','quantity','unit','purchaseDate','purchaseValue','source','notes','createdAt','updatedAt'],
    Rooms: ['id','name','building','floor','capacity','notes','createdAt','updatedAt'],
    StockItems: ['id','name','category','unit','minimumStock','currentStock','notes','createdAt','updatedAt'],
    StockTransactions: ['id','itemId','type','quantity','date','reference','notes','createdBy','createdAt'],
    Loans: ['id','assetId','borrowerId','borrowerName','purpose','startDate','endDate','status','approvedBy','returnedAt','notes','createdAt','updatedAt'],
    Repairs: ['id','assetId','reporterId','reporterName','description','priority','status','assignedTo','reportedAt','resolvedAt','notes','createdAt','updatedAt'],
    AssetMutations: ['id','assetId','type','quantity','date','reason','approvedBy','notes','createdAt'],
    AssetDisposals: ['id','assetId','quantity','date','reason','approvedBy','notes','createdAt'],
    CleaningRecords: ['id','roomId','roomName','officerId','officerName','date','shift','status','notes','createdAt'],
    ActivityLogs: ['id','userId','userName','action','module','recordId','details','createdAt'],
    AppData: ['module','id','payload','updatedAt','updatedBy'],
    ProcurementRequests: ['id','name','unit','quantity','requester','notes','semester','status','source']
  }
};

function initializeDatabase() { return bootstrap_(); }

function doGet(e) {
  const action = (e && e.parameter && e.parameter.action) || 'health';
  if (action === 'health') return json_({ok:true, app:CONFIG.APP_NAME, message:'API aktif'});
  return json_({ok:false,error:'Gunakan POST untuk operasi API.'});
}

function doPost(e) {
  let body = {};
  const formRequest = !!(e && e.parameter && e.parameter.payload);
  try {
    body = formRequest
      ? JSON.parse(e.parameter.payload)
      : JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const action = String(body.action || '');
    let result;
    if (action === 'bootstrap') result = bootstrap_();
    else if (action === 'login') result = login_(body);
    else if (action === 'setupAdmin') result = setupAdmin_(body);
    else if (action === 'changePassword') result = changePassword_(body);
    else if (action === 'adminListUsers') result = adminListUsers_(authenticate_(body.token));
    else if (action === 'adminResetPassword') result = adminResetPassword_(authenticate_(body.token),body);
    else if (action === 'adminAssignAssetOwner') result = adminAssignAssetOwner_(authenticate_(body.token),body);
    else if (action === 'infocusSetup') result = infocusSetup_(authenticate_(body.token));
    else if (action === 'infocusCheckout') result = infocusCheckout_(authenticate_(body.token),body);
    else if (action === 'infocusReturn') result = infocusReturn_(authenticate_(body.token),body);
    else if (action === 'infocusPhoto') result = infocusPhoto_(authenticate_(body.token),body);
    else {
      const user = authenticate_(body.token);
      if (action === 'logout') {
        CacheService.getScriptCache().remove('session:' + body.token);
        result = {ok:true};
      } else if (action === 'list') result = listRecords_(user, body.module);
      else if (action === 'listMany') result = listManyRecords_(user, body.modules);
      else if (action === 'sync') result = syncRecords_(user, body.module, body.records);
      else if (action === 'save') result = saveRecord_(user, body.module, body.record);
      else if (action === 'remove') result = removeRecord_(user, body.module, body.id);
      else result = {ok:false,error:'Action tidak dikenal.'};
    }
    return formRequest ? htmlPostMessage_(result, body._nonce) : json_(result);
  } catch (err) {
    const result = {ok:false,error:err.message || String(err)};
    return formRequest ? htmlPostMessage_(result, body._nonce) : json_(result);
  }
}

function htmlPostMessage_(result, nonce) {
  const payload = JSON.stringify({type:'SIMSPA_API_RESPONSE',nonce:String(nonce || ''),payload:result})
    .replace(/</g,'\\u003c').replace(/>/g,'\\u003e').replace(/&/g,'\\u0026');
  const html = '<!doctype html><html><head><meta charset="utf-8"></head><body><script>' +
    'window.top.postMessage(' + payload + ', "*");' +
    '</script></body></html>';
  return HtmlService.createHtmlOutput(html).setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
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

function createInitialAdminFromScriptProperties() {
  const props = PropertiesService.getScriptProperties();
  const name = props.getProperty('SIMSPA_ADMIN_NAME') || '';
  const email = props.getProperty('SIMSPA_ADMIN_EMAIL') || '';
  const password = props.getProperty('SIMSPA_ADMIN_PASSWORD') || '';
  if (!name || !email || password.length < 12) {
    throw new Error('Isi Script Properties: SIMSPA_ADMIN_NAME, SIMSPA_ADMIN_EMAIL, SIMSPA_ADMIN_PASSWORD (minimal 12 karakter).');
  }
  const result = setupAdmin_({name,email,password});
  props.deleteProperty('SIMSPA_ADMIN_PASSWORD');
  console.log('Admin awal dibuat untuk '+email+'. Password setup telah dihapus dari Script Properties.');
  return result;
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
    appendObject_('Users',{userId:Utilities.getUuid(),name,email,username:email,nuptk:'',passwordHash:hash,salt,role:'admin',active:true,mustChangePassword:false,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()});
    return {ok:true,message:'Admin awal berhasil dibuat. Hapus/ubah password setup setelah ini.'};
  } finally { lock.releaseLock(); }
}

function migrateUsersSchema() {
  const sh = sheet_('Users');
  const expected = CONFIG.SHEETS.Users;
  const current = sh.getLastRow() ? sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0].map(String) : [];
  if (!current.length) { sh.appendRow(expected); return {ok:true,headers:expected}; }
  expected.forEach(header => {
    if (!current.includes(header)) sh.getRange(1,sh.getLastColumn()+1).setValue(header);
  });
  return {ok:true,headers:sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0]};
}

function appendObject_(sheetName, object) {
  const sh = sheet_(sheetName);
  const headers = sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0].map(String);
  sh.appendRow(headers.map(key => object[key] === undefined ? '' : object[key]));
}

function normalizeRosterRole_(value) {
  const raw = String(value || '').trim().toLowerCase().replace(/[_-]+/g,' ').replace(/\s+/g,' ');
  if (raw === 'dosen' || raw.startsWith('dosen ')) return 'dosen';
  if (raw === 'pimpinan' || raw.startsWith('pimpinan ')) return 'pimpinan';
  if (raw === 'petugas' || raw.startsWith('petugas ') || raw === 'petugas kebersihan' || raw.startsWith('petugas kebersihan ')) return 'petugas';
  return '';
}

function importLecturersFromRosterSheet() {
  migrateUsersSchema();
  const roster = records_('LecturerRoster');
  if (!roster.length) throw new Error('Tab LecturerRoster masih kosong. Isi name, nuptk, role, dan email bila role petugas.');
  const existing = records_('Users');
  const prepared = [];
  const seen = new Set();
  // Validate the entire roster first, so a bad row cannot leave a half-imported batch.
  roster.forEach((person,index) => {
    const name = String(person.name || '').trim();
    const nuptk = String(person.nuptk || '').replace(/\D/g,'');
    const role = normalizeRosterRole_(person.role);
    const email = String(person.email || '').trim().toLowerCase();
    if (!name || !role) throw new Error('Nama atau role tidak valid pada baris '+(index+2)+': '+name+' (role: '+String(person.role||'kosong')+'). Gunakan dosen, pimpinan, atau petugas.');
    if (['dosen','pimpinan'].includes(role) && !/^\d{16}$/.test(nuptk)) throw new Error('NUPTK harus 16 digit pada baris '+(index+2)+' untuk '+name);
    if (role === 'petugas' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Email petugas belum valid pada baris '+(index+2)+': '+name);
    const key = role === 'petugas' ? 'email:'+email : 'nuptk:'+nuptk;
    if (seen.has(key)) throw new Error('Akun duplikat pada roster: '+name+' ('+key+')');
    seen.add(key);
    prepared.push({name,nuptk,role,email,key});
  });
  const issued = [];
  prepared.forEach(person => {
    if (existing.some(row => (person.nuptk && String(row.nuptk || '').replace(/\D/g,'') === person.nuptk) || (person.email && String(row.email || '').toLowerCase() === person.email))) return;
    const salt = Utilities.getUuid().replace(/-/g,'');
    const temporaryPassword = Utilities.getUuid().replace(/-/g,'').slice(0,16);
    appendObject_('Users',{
      userId:Utilities.getUuid(),name:person.name,email:person.role==='petugas'?person.email:'',username:person.role==='petugas'?person.email:person.nuptk,
      nuptk:person.role==='petugas'?'':person.nuptk,passwordHash:hashPassword_(temporaryPassword,salt),salt,role:person.role,active:true,
      mustChangePassword:true,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()
    });
    issued.push({name:person.name,loginId:person.role==='petugas'?person.email:person.nuptk,role:person.role,temporaryPassword});
  });
  console.log('SIM-SPA TEMPORARY CREDENTIALS — bagikan secara pribadi, jangan teruskan log ini: '+JSON.stringify(issued));
  return {ok:true,created:issued.length,notice:'Password sementara hanya tersedia pada Execution log. Bagikan secara pribadi.'};
}

function reissueTemporaryPasswordsForRoster() {
  migrateUsersSchema();
  const roster = records_('LecturerRoster');
  const users = records_('Users');
  const issued = [];
  roster.forEach((person,index) => {
    const role = normalizeRosterRole_(person.role);
    const nuptk = String(person.nuptk || '').replace(/\D/g,'');
    const email = String(person.email || '').trim().toLowerCase();
    const identifier = role === 'petugas' ? email : nuptk;
    const row = users.find(u => role === 'petugas'
      ? String(u.email || '').toLowerCase() === email
      : String(u.nuptk || '').replace(/\D/g,'') === nuptk);
    if (!row) return;
    const salt = Utilities.getUuid().replace(/-/g,'');
    const temporaryPassword = Utilities.getUuid().replace(/-/g,'').slice(0,16);
    const sh = sheet_('Users'), values = sh.getDataRange().getValues(), headers = values[0].map(String);
    const rowIndex = values.findIndex((r,i)=>i>0 && String(r[headers.indexOf('userId')])===String(row.userId));
    if (rowIndex < 1) return;
    sh.getRange(rowIndex+1,headers.indexOf('passwordHash')+1).setValue(hashPassword_(temporaryPassword,salt));
    sh.getRange(rowIndex+1,headers.indexOf('salt')+1).setValue(salt);
    if (headers.includes('mustChangePassword')) sh.getRange(rowIndex+1,headers.indexOf('mustChangePassword')+1).setValue(true);
    if (headers.includes('updatedAt')) sh.getRange(rowIndex+1,headers.indexOf('updatedAt')+1).setValue(new Date().toISOString());
    issued.push({name:row.name,loginId:identifier,role,temporaryPassword});
  });
  console.log('TEMPORARY PASSWORDS — bagikan secara pribadi dan jangan teruskan log ini: '+JSON.stringify(issued));
  return {ok:true,reissued:issued.length,notice:'Password sementara baru diterbitkan untuk akun yang cocok dengan roster.'};
}

function login_(body) {
  const identifier = String(body.identifier || body.email || '').trim().toLowerCase();
  const password = String(body.password || '');
  const rows = records_('Users');
  const row = rows.find(r => (String(r.email || '').toLowerCase() === identifier || String(r.username || '').toLowerCase() === identifier || String(r.nuptk || '').toLowerCase() === identifier) && String(r.active) !== 'false');
  if (!row || !constantTimeEquals_(hashPassword_(password,row.salt),row.passwordHash)) throw new Error('Email atau password tidak valid.');
  const token = Utilities.getUuid() + Utilities.getUuid();
  CacheService.getScriptCache().put('session:' + token, JSON.stringify({userId:row.userId,email:row.email,name:row.name,role:row.role}), CONFIG.TOKEN_TTL_SECONDS);
  return {ok:true,token,user:{id:row.userId,name:row.name,email:row.email||'',username:row.username||'',nuptk:row.nuptk||'',role:row.role,mustChangePassword:String(row.mustChangePassword)==='true'}};
}

function changePassword_(body) {
  const user = authenticate_(body.token);
  const password = String(body.newPassword || '');
  if (password.length < 12) throw new Error('Password baru minimal 12 karakter.');
  const sh = sheet_('Users'), values = sh.getDataRange().getValues(), headers = values[0].map(String);
  const idCol = headers.indexOf('userId'), hashCol = headers.indexOf('passwordHash'), saltCol = headers.indexOf('salt');
  const mustCol = headers.indexOf('mustChangePassword'), updatedCol = headers.indexOf('updatedAt');
  const idx = values.findIndex((r,i)=>i>0 && String(r[idCol])===String(user.userId));
  if (idx < 1) throw new Error('Akun tidak ditemukan.');
  const salt = Utilities.getUuid().replace(/-/g,'');
  sh.getRange(idx+1,hashCol+1).setValue(hashPassword_(password,salt));
  sh.getRange(idx+1,saltCol+1).setValue(salt);
  if (mustCol >= 0) sh.getRange(idx+1,mustCol+1).setValue(false);
  if (updatedCol >= 0) sh.getRange(idx+1,updatedCol+1).setValue(new Date().toISOString());
  return {ok:true,message:'Password berhasil diperbarui.'};
}

function importSarprasStagingData() {
  const ss = spreadsheet_();
  const source = ss.getSheetByName('SIMSPA_ImportData');
  if (!source) throw new Error('Tab SIMSPA_ImportData belum ada. Impor file SIMSPA_Paket_Import_Data.xlsx ke spreadsheet ini terlebih dahulu.');
  const rows = source.getDataRange().getValues();
  if (rows.length < 2) throw new Error('Tab SIMSPA_ImportData belum berisi baris data.');
  const headers = rows[0].map(String);
  const ix = key => headers.indexOf(key);
  if ([ix('module'),ix('id'),ix('payload')].some(n=>n<0)) throw new Error('Header SIMSPA_ImportData harus memuat module, id, payload.');
  const allowed = new Set(['rooms','assets','stock','repairs','proc']);
  const prepared = [];
  rows.slice(1).forEach((r,i)=>{
    const module = String(r[ix('module')]||'').trim();
    const id = String(r[ix('id')]||'').trim();
    const raw = String(r[ix('payload')]||'');
    if (!module && !id && !raw) return;
    if (!allowed.has(module)) throw new Error('Modul tidak diizinkan pada baris '+(i+2)+': '+module);
    if (!id || !raw) throw new Error('ID/payload kosong pada baris '+(i+2));
    let payload;
    try { payload = JSON.parse(raw); } catch(e) { throw new Error('JSON tidak valid pada baris '+(i+2)); }
    if (String(payload.id||'') !== id) throw new Error('ID payload tidak sama dengan kolom ID pada baris '+(i+2));
    prepared.push({module,id,payload});
  });
  if (!prepared.length) throw new Error('Tidak ada data valid untuk diimpor.');
  const appData = sheet_('AppData');
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const values = appData.getDataRange().getValues();
    const index = new Map();
    values.forEach((r,i)=>{ if(i>0) index.set(String(r[0])+'|'+String(r[1]),i+1); });
    const now = new Date().toISOString();
    let inserted=0,updated=0;
    prepared.forEach(item=>{
      const key=item.module+'|'+item.id;
      const row=[item.module,item.id,JSON.stringify(item.payload),now,'import-staging'];
      const rowNo=index.get(key);
      if(rowNo){appData.getRange(rowNo,1,1,5).setValues([row]);updated++;}
      else {appData.appendRow(row);inserted++;}
    });
    const summary = prepared.reduce((o,x)=>{o[x.module]=(o[x.module]||0)+1;return o;},{});
    console.log('SIM-SPA import selesai: '+JSON.stringify({inserted,updated,modules:summary}));
    return {ok:true,inserted,updated,modules:summary};
  } finally { lock.releaseLock(); }
}

function adminListUsers_(admin) {
  if (String(admin.role) !== 'admin') throw new Error('Hanya Admin Prodi yang dapat mengelola akun.');
  const users = records_('Users').map(u => ({
    userId:String(u.userId||''),name:String(u.name||''),email:String(u.email||''),
    username:String(u.username||''),nuptk:String(u.nuptk||''),role:String(u.role||''),
    active:String(u.active)!=='false',mustChangePassword:String(u.mustChangePassword)==='true'
  }));
  return {ok:true,users};
}

function adminResetPassword_(admin,body) {
  if (String(admin.role) !== 'admin') throw new Error('Hanya Admin Prodi yang dapat mereset password.');
  const userId = String(body.userId||'').trim();
  const password = String(body.newPassword||'');
  if (!userId) throw new Error('Pengguna belum dipilih.');
  if (password.length < 12) throw new Error('Password minimal 12 karakter.');
  const sh = sheet_('Users'), values = sh.getDataRange().getValues();
  if (values.length < 2) throw new Error('Belum ada akun pengguna.');
  const headers = values[0].map(String);
  const idCol=headers.indexOf('userId'), hashCol=headers.indexOf('passwordHash'), saltCol=headers.indexOf('salt');
  const activeCol=headers.indexOf('active'), mustCol=headers.indexOf('mustChangePassword'), updatedCol=headers.indexOf('updatedAt');
  if ([idCol,hashCol,saltCol].some(i=>i<0)) throw new Error('Kolom akun belum lengkap. Jalankan migrateUsersSchema.');
  const idx=values.findIndex((r,i)=>i>0 && String(r[idCol])===userId);
  if(idx<1) throw new Error('Akun pengguna tidak ditemukan.');
  if(activeCol>=0 && String(values[idx][activeCol])==='false') throw new Error('Akun tidak aktif. Aktifkan akun terlebih dahulu.');
  const salt=Utilities.getUuid().replace(/-/g,'');
  sh.getRange(idx+1,hashCol+1).setValue(hashPassword_(password,salt));
  sh.getRange(idx+1,saltCol+1).setValue(salt);
  if(mustCol>=0) sh.getRange(idx+1,mustCol+1).setValue(true);
  if(updatedCol>=0) sh.getRange(idx+1,updatedCol+1).setValue(new Date().toISOString());
  const target={userId,name:String(values[idx][headers.indexOf('name')]||''),role:String(values[idx][headers.indexOf('role')]||'')};
  log_(admin,'Reset password','Users',userId,'Admin mengatur ulang password akun '+target.name+' ('+target.role+').');
  return {ok:true,message:'Password berhasil diatur ulang. Pengguna wajib menggantinya saat login berikutnya.'};
}

function adminAssignAssetOwner_(admin,body) {
  if (String(admin.role) !== 'admin') throw new Error('Hanya Admin Prodi yang dapat menautkan aset ke akun dosen.');
  const assetId=String(body.assetId||'').trim();
  const userId=String(body.userId||'').trim();
  if(!assetId) throw new Error('Aset belum dipilih.');
  let owner=null;
  if(userId){
    owner=records_('Users').find(u=>String(u.userId)===userId && String(u.active)!=='false');
    if(!owner) throw new Error('Akun pengguna tidak ditemukan atau tidak aktif.');
    if(!['dosen','pimpinan'].includes(String(owner.role))) throw new Error('Aset hanya dapat ditautkan ke akun Dosen atau Pimpinan.');
  }
  const sh=sheet_('AppData'), values=sh.getDataRange().getValues();
  const rowNo=values.findIndex((r,i)=>i>0 && String(r[0])==='assets' && String(r[1])===assetId);
  if(rowNo<1) throw new Error('Data aset tidak ditemukan di AppData.');
  let payload;
  try{payload=JSON.parse(values[rowNo][2]);}catch(e){throw new Error('Payload aset tidak valid.');}
  payload.assignedToUserId=owner?String(owner.userId):'';
  payload.assignedToName=owner?String(owner.name):'';
  sh.getRange(rowNo+1,3).setValue(JSON.stringify(payload));
  sh.getRange(rowNo+1,4).setValue(new Date().toISOString());
  sh.getRange(rowNo+1,5).setValue(admin.userId);
  log_(admin,'Tautkan aset ke dosen','Assets',assetId,owner?'Ditautkan ke '+owner.name+' ('+owner.username+').':'Tautan akun dosen dilepas.');
  return {ok:true,assetId,assignedToUserId:payload.assignedToUserId,assignedToName:payload.assignedToName};
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
  const sh = sheet_('AppData'), values = sh.getDataRange().getValues();
  let rows = values.length < 2 ? [] : values.slice(1).filter(r => String(r[0]) === String(module))
    .map(r => { try { return JSON.parse(r[2]); } catch(e) { return null; } }).filter(Boolean);
  if (module === 'assets') rows = (rows.length ? rows : records_('Assets')).map(adaptAssetRecord_).filter(a => a.nama);
  if (module === 'loans' && !['admin','pimpinan'].includes(String(user.role))) {
    rows = rows.filter(r => String(r.borrowerUserId || r.createdByUserId || r.borrowerId || '') === String(user.userId));
  }
  return {ok:true,records:rows};
}

function adaptAssetRecord_(asset) {
  const a = asset || {};
  return {
    id:String(a.id || Utilities.getUuid()),
    kode:String(a.kode || a.assetCode || ''),
    nama:String(a.nama || a.name || ''),
    kat:String(a.kat || a.category || 'Lainnya'),
    ruang:String(a.ruang || a.roomId || ''),
    kondisi:String(a.kondisi || a.condition || 'Baik'),
    status:String(a.status || 'Aktif'),
    thn:String(a.thn || a.purchaseDate || '').slice(0,4),
    nilai:Number(a.nilai !== undefined ? a.nilai : a.purchaseValue || 0),
    umur:Number(a.umur || 5),
    sumber:String(a.sumber || a.source || ''),
    sn:String(a.sn || a.brand || ''),
    pj:String(a.pj || a.responsiblePerson || ''),
    jumlah:Number(a.jumlah !== undefined ? a.jumlah : a.quantity || 1),
    satuan:String(a.satuan || a.unit || 'unit'),
    notes:String(a.notes || a.catatan || ''),
    ownerLabel:String(a.ownerLabel || a.pj || ''),
    assignedToUserId:String(a.assignedToUserId || ''),
    assignedToName:String(a.assignedToName || ''),
    loanable:a.loanable !== false
  };
}

function listManyRecords_(user, modules) {
  if (!Array.isArray(modules) || modules.length > 12) throw new Error('Daftar modul tidak valid.');
  const sh = sheet_('AppData');
  const values = sh.getDataRange().getValues();
  const out = {};
  modules.forEach(module => {
    const sheetName = moduleToSheet_(module);
    assertRead_(user,sheetName);
    let records = values.length < 2 ? [] : values.slice(1)
      .filter(row => String(row[0]) === String(module))
      .map(row => { try { return JSON.parse(row[2]); } catch(e) { return null; } })
      .filter(Boolean);
    if (module === 'assets') {
      records = (records.length ? records : records_('Assets')).map(adaptAssetRecord_).filter(a => a.nama);
    }
    if (module === 'loans' && !['admin','pimpinan'].includes(String(user.role))) {
      records = records.filter(r => String(r.borrowerUserId || r.createdByUserId || r.borrowerId || '') === String(user.userId));
    }
    out[module] = records;
  });
  return {ok:true,records:out};
}

function syncRecords_(user,module,records) {
  const name = moduleToSheet_(module);
  assertWrite_(user,name,'sync');
  if (!Array.isArray(records)) throw new Error('Daftar data tidak valid.');
  if (records.length > 2000) throw new Error('Maksimal 2.000 data per modul dalam satu sinkronisasi.');
  if (name === 'Loans' && String(user.role) === 'dosen') {
    records.forEach(record => {
      const owner = String(record.borrowerUserId || record.createdByUserId || '');
      if (owner !== String(user.userId)) throw new Error('Dosen hanya dapat menyimpan pengajuan peminjaman miliknya sendiri.');
    });
  }
  const sh = sheet_('AppData'), lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const values = sh.getDataRange().getValues();
    const now = new Date().toISOString();
    // Admin/Pimpinan may replace the full module snapshot. Other roles may only upsert,
    // so a lecturer or facilities user cannot erase records created by other users.
    if (['admin','pimpinan'].includes(String(user.role))) {
      // Preserve dedicated Infocus transactions when the legacy Loans module
      // replaces its normal snapshot from the frontend.
      const preservedInfocus = String(module)==='loans'
        ? values.slice(1).filter(row => String(row[0])==='loans' && (()=>{try{return JSON.parse(row[2]).type==='infocus';}catch(e){return false;}})())
        : [];
      for (let i=values.length-1;i>=1;i--) {
        if (String(values[i][0])===String(module) &&
            !(String(module)==='loans' && (()=>{try{return JSON.parse(values[i][2]).type==='infocus';}catch(e){return false;}})())) sh.deleteRow(i+1);
      }
      const rows = records.map(record => [String(module),String(record.id || Utilities.getUuid()),JSON.stringify(record),now,user.userId]);
      if (rows.length) sh.getRange(sh.getLastRow()+1,1,rows.length,5).setValues(rows);
      log_(user,'Sinkronisasi',name,'',rows.length+' data disinkronkan');
      return {ok:true,count:rows.length,mode:'replace',preservedInfocus:preservedInfocus.length};
    }
    const current = sh.getDataRange().getValues();
    const index = new Map();
    current.forEach((row,i)=>{ if(i>0 && String(row[0])===String(module)) index.set(String(row[1]),i+1); });
    records.forEach(record=>{
      const id=String(record.id || Utilities.getUuid());
      const row=[String(module),id,JSON.stringify(record),now,user.userId];
      const rowNo=index.get(id);
      if(rowNo) sh.getRange(rowNo,1,1,5).setValues([row]);
      else sh.appendRow(row);
    });
    log_(user,'Sinkronisasi',name,'',records.length+' data diperbarui');
    return {ok:true,count:records.length,mode:'upsert'};
  } finally { lock.releaseLock(); }
}

function saveRecord_(user,module,record) {
  const name = moduleToSheet_(module); assertWrite_(user,name,'save');
  if (!record || typeof record !== 'object') throw new Error('Data tidak valid.');
  if (name === 'Loans' && String(user.role) === 'dosen' &&
      String(record.borrowerUserId || record.createdByUserId || '') !== String(user.userId)) {
    throw new Error('Dosen hanya dapat menyimpan pengajuan peminjaman miliknya sendiri.');
  }
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
    Assets:['admin','pimpinan','dosen'], Rooms:['admin','pimpinan','dosen','petugas'],
    Loans:['admin','pimpinan','dosen'], Repairs:['admin','pimpinan','dosen','petugas'],
    CleaningRecords:['admin','pimpinan','dosen','petugas'],
    StockItems:['admin','pimpinan'], StockTransactions:['admin','pimpinan'],
    AssetMutations:['admin','pimpinan'], AssetDisposals:['admin','pimpinan'],
    ActivityLogs:['admin','pimpinan'], ProcurementRequests:['admin','pimpinan']
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
  if (sheetName==='Loans' && role==='dosen' && ['save','sync'].includes(operation)) return;
  if (sheetName==='Repairs' && ['dosen','petugas'].includes(role) && ['save','sync'].includes(operation)) return;
  if (sheetName==='CleaningRecords' && ['dosen','petugas'].includes(role) && ['save','sync'].includes(operation)) return;
  if (adminOnly.includes(sheetName)) throw new Error('Hanya Admin/Pimpinan yang dapat mengubah modul ini.');
  throw new Error('Akses perubahan data ditolak.');
}

function moduleToSheet_(module) {
  const map={assets:'Assets',rooms:'Rooms',stockItems:'StockItems',stockTransactions:'StockTransactions',loans:'Loans',repairs:'Repairs',assetMutations:'AssetMutations',assetDisposals:'AssetDisposals',cleaningRecords:'CleaningRecords',activityLogs:'ActivityLogs',proc:'ProcurementRequests',stock:'StockItems',tx:'StockTransactions',mutasi:'AssetMutations',hapus:'AssetDisposals',clean:'CleaningRecords',log:'ActivityLogs'};
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


const INFOCUS_DRIVE_FOLDER_ID = '19mKbMROWNqNILJaMXEAcHQ7OG1u63dOR';
function infocusRows_(){
 const v=sheet_('AppData').getDataRange().getValues();
 return v.length<2?[]:v.slice(1).map((r,i)=>{let rec=null;try{rec=JSON.parse(r[2])}catch(e){}return {row:i+2,module:String(r[0]),id:String(r[1]),record:rec}}).filter(x=>x.module==='loans'&&x.record&&x.record.type==='infocus');
}
function infocusSave_(user,record){
 const sh=sheet_('AppData'),v=sh.getDataRange().getValues(),id=String(record.id);
 const i=v.findIndex((r,n)=>n>0&&String(r[0])==='loans'&&String(r[1])===id);
 const row=['loans',id,JSON.stringify(record),new Date().toISOString(),user.userId];
 if(i>0)sh.getRange(i+1,1,1,5).setValues([row]);else sh.appendRow(row);
}
function infocusUnits_(user){
 if(!['admin','pimpinan','dosen'].includes(String(user.role)))throw new Error('Akses ditolak.');
 const assetResult=listRecords_(user,'assets');
 return (assetResult.records||[]).map(adaptAssetRecord_).filter(a=>/infocus|infokus|proyektor/i.test(a.nama)&&a.status!=='Dihapus').map(a=>({unitCode:a.kode||a.id,name:a.nama,qrValue:'SIMSPA-INFOCUS:'+String(a.kode||a.id)}));
}
function infocusSetup_(user){
 if(!['admin','pimpinan'].includes(String(user.role)))throw new Error('Hanya Admin/Pimpinan yang dapat menyiapkan QR.');
 const units=infocusUnits_(user);
 if(!units.length)throw new Error('Belum ada aset bernama Infocus atau Proyektor di inventaris.');
 return {ok:true,count:units.length,units};
}
function infocusCheckout_(user,body){
 if(String(user.role)!=='dosen')throw new Error('Peminjaman Infocus hanya dapat dilakukan melalui akun dosen.');
 const qr=String(body.qrValue||'').trim(),loc=String(body.usageLocation||'').trim();
 if(!qr||!loc)throw new Error('Kode QR dan ruang/kelas wajib diisi.');
 const unit=infocusUnits_(user).find(u=>u.qrValue===qr||u.unitCode===qr);
 if(!unit)throw new Error('QR Infocus tidak dikenal. Minta Admin menyiapkan QR dari inventaris.');
 const lock=LockService.getScriptLock();lock.waitLock(10000);
 try{
  if(infocusRows_().some(x=>x.record.unitCode===unit.unitCode&&!x.record.returnedAt))throw new Error('Infocus ini masih dipinjam.');
  const now=new Date(),due=new Date(now.getTime()+86400000);
  const record={id:Utilities.getUuid(),type:'infocus',unitCode:unit.unitCode,unitName:unit.name,borrowerUserId:user.userId,createdByUserId:user.userId,peminjam:user.name,usageLocation:loc,borrowedAt:now.toISOString(),dueAt:due.toISOString(),returnedAt:'',status:'Dipinjam',returnPhotoFileId:''};
  infocusSave_(user,record);log_(user,'Meminjam Infocus','Loans',record.id,unit.unitCode+' · '+loc);
  return {ok:true,loan:record};
 }finally{lock.releaseLock()}
}
function infocusReturn_(user,body){
 if(String(user.role)!=='dosen')throw new Error('Pengembalian harus melalui akun dosen peminjam.');
 const loanId=String(body.loanId||''),qr=String(body.qrValue||'').trim(),photo=String(body.photoData||'');
 if(!loanId||!qr||!photo)throw new Error('ID transaksi, scan QR, dan foto wajib tersedia.');
 if(!/^data:image\/(jpeg|jpg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(photo)||photo.length>1500000)throw new Error('Foto tidak valid atau terlalu besar (maksimal sekitar 1 MB).');
 const lock=LockService.getScriptLock();lock.waitLock(10000);
 try{
  const row=infocusRows_().find(x=>x.id===loanId);
  if(!row)throw new Error('Transaksi Infocus tidak ditemukan.');
  const loan=row.record;
  if(String(loan.borrowerUserId)!==String(user.userId))throw new Error('Kamu hanya dapat mengembalikan Infocus milikmu.');
  if(loan.returnedAt)throw new Error('Infocus sudah dikembalikan.');
  if(qr!=='SIMSPA-INFOCUS:'+String(loan.unitCode)&&qr!==String(loan.unitCode))throw new Error('QR tidak cocok dengan Infocus yang dipinjam.');
  const parts=photo.split(','),mime=photo.slice(5,photo.indexOf(';')),bytes=Utilities.base64Decode(parts[1]);
  const file=DriveApp.getFolderById(INFOCUS_DRIVE_FOLDER_ID).createFile(Utilities.newBlob(bytes,mime,'Infocus-'+loan.unitCode+'-'+Date.now()+'.jpg'));
  const now=new Date(),elapsed=Math.max(0,Math.round((now.getTime()-Date.parse(loan.borrowedAt))/60000));
  loan.returnedAt=now.toISOString();loan.durationMinutes=elapsed;loan.overdue=now.getTime()>Date.parse(loan.dueAt);loan.status=loan.overdue?'Terlambat - Dikembalikan':'Dikembalikan';loan.returnPhotoFileId=file.getId();
  infocusSave_(user,loan);log_(user,'Mengembalikan Infocus','Loans',loan.id,'Durasi '+elapsed+' menit; '+loan.status);
  return {ok:true,loan:loan};
 }finally{lock.releaseLock()}
}
function infocusPhoto_(user,body){
 const row=infocusRows_().find(x=>x.id===String(body.loanId||''));if(!row)throw new Error('Transaksi tidak ditemukan.');
 if(!['admin','pimpinan'].includes(String(user.role))&&String(row.record.borrowerUserId)!==String(user.userId))throw new Error('Akses foto ditolak.');
 if(!row.record.returnPhotoFileId)throw new Error('Foto pengembalian belum tersedia.');
 const blob=DriveApp.getFileById(row.record.returnPhotoFileId).getBlob();
 return {ok:true,dataUrl:'data:'+blob.getContentType()+';base64,'+Utilities.base64Encode(blob.getBytes())};
}
