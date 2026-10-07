import http from 'node:http';
import {readFileSync,existsSync,mkdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join,dirname} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {catalog,demoQuote,demoNews,rankNews,mergeNews,Finnhub} from './market.mjs';
const root=dirname(fileURLToPath(import.meta.url));
if(existsSync(join(root,'.env')))process.loadEnvFile(join(root,'.env'));
const port=Number(process.env.PORT||4317),dataDir=process.env.FOLIO_DATA_DIR||join(root,'data');
mkdirSync(dataDir,{recursive:true});
const db=new DatabaseSync(join(dataDir,'folio.sqlite'));
db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;
 CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS portfolios(id INTEGER PRIMARY KEY,name TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS holdings(portfolio_id INTEGER REFERENCES portfolios(id) ON DELETE CASCADE,symbol TEXT,name TEXT,sector TEXT,shares REAL,cost REAL,PRIMARY KEY(portfolio_id,symbol));`);
const getSetting=(key,fallback='')=>db.prepare('SELECT value FROM settings WHERE key=?').get(key)?.value??fallback;
const setSetting=(key,value)=>db.prepare('INSERT INTO settings VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key,String(value));
if(!getSetting('initialized')){
 const id=Number(db.prepare('INSERT INTO portfolios(name) VALUES(?)').run('My first portfolio').lastInsertRowid);
 for(const [symbol,shares,cost] of [['AAPL',20,195],['MSFT',12,385],['NVDA',35,108],['AMZN',18,175],['JPM',15,192]]){
  const s=catalog.find(s=>s.symbol===symbol);db.prepare('INSERT INTO holdings VALUES(?,?,?,?,?,?)').run(id,symbol,s.name,s.sector,shares,cost);
 }setSetting('initialized','1');setSetting('mode','demo');
}
const mode=()=>getSetting('mode','demo'),getKey=()=>getSetting('apiKey')||process.env.FINNHUB_API_KEY||'';
const provider=new Finnhub(getKey);
const holdings=id=>db.prepare('SELECT symbol,name,sector,shares,cost FROM holdings WHERE portfolio_id=? ORDER BY symbol').all(id);
const portfolio=id=>{const p=db.prepare('SELECT * FROM portfolios WHERE id=?').get(id);if(!p)throw Object.assign(new Error('Portfolio not found.'),{status:404});return p;};
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
const cleanName=value=>{if(typeof value!=='string'||!value.trim()||value.trim().length>60)fail('Enter a name between 1 and 60 characters.');return value.trim();};
const validSymbol=value=>{if(typeof value!=='string'||!/^[A-Z][A-Z0-9.-]{0,11}$/.test(value))fail('Choose a valid US stock.');return value;};
const json=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
async function body(req){let text='';for await(const c of req){text+=c;if(text.length>16384)fail('Request is too large.',413);}try{return JSON.parse(text||'{}');}catch{fail('Invalid JSON.');}}
async function api(req,res,url){
 const path=url.pathname,method=req.method;
 if(path==='/api/state'&&method==='GET')return json(res,200,{mode:mode(),hasKey:!!getKey(),portfolios:db.prepare('SELECT * FROM portfolios ORDER BY id').all(),catalog:mode()==='demo'?catalog:[],provider:'Finnhub'});
 if(path==='/api/search'&&method==='GET'){
  const q=(url.searchParams.get('q')||'').trim().toUpperCase().slice(0,60);
  const stocks=mode()==='demo'?catalog:await provider.stocks();
  const results=stocks.filter(s=>s.symbol.includes(q)||s.name.toUpperCase().includes(q)).sort((a,b)=>(a.symbol===q?-1:b.symbol===q?1:0));return json(res,200,results.slice(0,30));
 }
 if(path==='/api/stock'&&method==='GET'){const symbol=validSymbol(url.searchParams.get('symbol'));return json(res,200,mode()==='demo'?demoQuote(symbol):await provider.quote(symbol));}
 if(path==='/api/settings'&&method==='POST'){
  const b=await body(req);if(!['demo','live'].includes(b.mode))fail('Choose demo or live mode.');
  if(b.apiKey!==undefined&&b.apiKey!==''&&(typeof b.apiKey!=='string'||!/^[\w-]{10,200}$/.test(b.apiKey)))fail('Check the format of your Finnhub API key.');
  if(b.mode==='live'&&!b.apiKey&&!getKey())fail('Add a free Finnhub API key before enabling live mode.');
  if(b.apiKey)setSetting('apiKey',b.apiKey);if(b.removeKey){if(b.mode==='live')fail('Switch to demo mode before removing the key.');setSetting('apiKey','');}
  setSetting('mode',b.mode);provider.clear();return json(res,200,{ok:true});
 }
 if(path==='/api/portfolios'&&method==='POST'){const b=await body(req);if(db.prepare('SELECT COUNT(*) n FROM portfolios').get().n>=20)fail('You can create up to 20 portfolios.');const result=db.prepare('INSERT INTO portfolios(name) VALUES(?)').run(cleanName(b.name));return json(res,201,{id:Number(result.lastInsertRowid)});}
 const match=/^\/api\/portfolios\/(\d+)(?:\/(holdings|quotes|news)(?:\/([A-Z0-9.-]+))?)?$/.exec(path);
 if(!match)fail('Not found.',404);
 const id=Number(match[1]),part=match[2],symbol=match[3],p=portfolio(id);
 if(!part&&method==='GET')return json(res,200,{...p,holdings:holdings(id)});
 if(!part&&method==='PATCH'){const b=await body(req);db.prepare('UPDATE portfolios SET name=? WHERE id=?').run(cleanName(b.name),id);return json(res,200,{ok:true});}
 if(!part&&method==='DELETE'){if(db.prepare('SELECT COUNT(*) n FROM portfolios').get().n<=1)fail('Keep at least one portfolio.');db.prepare('DELETE FROM portfolios WHERE id=?').run(id);return json(res,200,{ok:true});}
 if(part==='holdings'&&method==='POST'){
  const b=await body(req);validSymbol(b.symbol);
  if(typeof b.shares!=='number'||!Number.isFinite(b.shares)||b.shares<=0||b.shares>1e9)fail('Enter a share quantity greater than zero.');
  if(b.cost!==null&&(typeof b.cost!=='number'||!Number.isFinite(b.cost)||b.cost<0||b.cost>1e9))fail('Enter a valid average purchase price, or leave it blank.');
  const existing=holdings(id).find(h=>h.symbol===b.symbol);if(!existing&&holdings(id).length>=30)fail('This free-tier template supports up to 30 stocks per portfolio.');
  const stocks=mode()==='demo'?catalog:await provider.stocks(),s=stocks.find(s=>s.symbol===b.symbol)||existing;
  if(!s)fail('Choose a stock from the US stock search results.');
  db.prepare('INSERT INTO holdings VALUES(?,?,?,?,?,?) ON CONFLICT(portfolio_id,symbol) DO UPDATE SET shares=excluded.shares,cost=excluded.cost').run(id,s.symbol,s.name,s.sector,b.shares,b.cost);
  return json(res,200,{ok:true});
 }
 if(part==='holdings'&&symbol&&method==='DELETE'){db.prepare('DELETE FROM holdings WHERE portfolio_id=? AND symbol=?').run(id,symbol);return json(res,200,{ok:true});}
 const held=holdings(id),symbols=held.map(h=>h.symbol),demo=mode()==='demo';
 if(part==='quotes'&&method==='GET'){
  const results=await Promise.all(held.map(async h=>{try{return {symbol:h.symbol,quote:demo?demoQuote(h.symbol):await provider.quote(h.symbol)};}catch(e){return {symbol:h.symbol,error:e.message};}}));return json(res,200,{mode:demo?'demo':'live',results,updatedAt:Date.now()});
 }
 if(part==='news'&&method==='GET'){
  if(demo)return json(res,200,{mode:'demo',items:rankNews(demoNews(symbols)),errors:[],updatedAt:Date.now()});
  const results=await Promise.all(symbols.map(async symbol=>{try{return {symbol,...await provider.news(symbol)};}catch(e){return {symbol,items:[],warning:e.message};}}));
  return json(res,200,{mode:'live',items:mergeNews(results.flatMap(r=>r.items),symbols),errors:results.filter(r=>r.warning).map(r=>`${r.symbol}: ${r.warning}`),updatedAt:Date.now()});
 }fail('Method not allowed.',405);
}
const staticFiles={'/':['index.html','text/html; charset=utf-8'],'/app.js':['app.js','text/javascript; charset=utf-8'],'/style.css':['style.css','text/css; charset=utf-8'],'/favicon.svg':['favicon.svg','image/svg+xml']};
const server=http.createServer(async(req,res)=>{
 res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Frame-Options','DENY');
 res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
 try{
  if(![`localhost:${port}`,`127.0.0.1:${port}`].includes(req.headers.host))fail('Invalid host.',403);
  if(req.headers.origin&&![`http://localhost:${port}`,`http://127.0.0.1:${port}`].includes(req.headers.origin))fail('Only local app requests are allowed.',403);
  const url=new URL(req.url,`http://localhost:${port}`);
  if(url.pathname.startsWith('/api/')){if(!['GET','HEAD'].includes(req.method)&&!req.headers['content-type']?.startsWith('application/json'))fail('Use JSON requests.',415);await api(req,res,url);return;}
  const file=staticFiles[url.pathname];if(!file||!['GET','HEAD'].includes(req.method))fail('Not found.',404);
  res.writeHead(200,{'Content-Type':file[1],'Cache-Control':'no-cache'});res.end(req.method==='HEAD'?undefined:readFileSync(join(root,'public',file[0])));
 }catch(error){if(!res.headersSent)json(res,error.status||502,{error:error.message});else res.end();}
});
server.listen(port,'localhost',()=>console.log(`Folio is ready at http://localhost:${port}`));
server.on('error',e=>{console.error(e.code==='EADDRINUSE'?`Port ${port} is in use. Set PORT to another number in .env.`:e.message);process.exitCode=1;});
