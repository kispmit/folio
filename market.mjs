export const catalog = [
 ['AAPL','Apple','Technology',227.63,2.14],['MSFT','Microsoft','Technology',428.76,1.08],
 ['NVDA','NVIDIA','Technology',132.89,3.42],['AMZN','Amazon','Consumer discretionary',192.53,-0.68],
 ['GOOGL','Alphabet','Communication services',174.32,0.92],['META','Meta Platforms','Communication services',574.20,1.52],
 ['TSLA','Tesla','Consumer discretionary',248.50,-2.16],['JPM','JPMorgan Chase','Financials',211.48,0.74],
 ['V','Visa','Financials',289.34,0.36],['MA','Mastercard','Financials',498.15,0.58],
 ['WMT','Walmart','Consumer staples',81.25,0.42],['COST','Costco','Consumer staples',891.73,-0.31],
 ['KO','Coca-Cola','Consumer staples',68.12,-0.24],['PEP','PepsiCo','Consumer staples',172.43,0.16],
 ['DIS','Walt Disney','Communication services',96.42,1.21],['NFLX','Netflix','Communication services',112.30,2.08],
 ['AMD','Advanced Micro Devices','Technology',163.28,-1.36],['INTC','Intel','Technology',23.56,0.85],
 ['CRM','Salesforce','Technology',286.44,1.11],['ADBE','Adobe','Technology',506.78,-0.94],
 ['XOM','Exxon Mobil','Energy',118.32,0.64],['CVX','Chevron','Energy',151.22,-0.45],
 ['JNJ','Johnson & Johnson','Healthcare',162.48,0.28],['UNH','UnitedHealth Group','Healthcare',284.60,-0.72],
 ['LLY','Eli Lilly','Healthcare',912.75,1.84],['BRK.B','Berkshire Hathaway','Financials',459.12,0.31],
 ['AVGO','Broadcom','Technology',177.65,2.13],['PLTR','Palantir','Technology',141.86,3.12]
].map(([symbol,name,sector,price,change])=>({symbol,name,sector,price,change,currency:'USD'}));

export function demoQuote(symbol) {
 const s=catalog.find(s=>s.symbol===symbol);if(!s)throw new Error('No sample quote for this stock.');
 const previous=s.price/(1+s.change/100);
 return {symbol,price:s.price,previous,change:s.price-previous,changePercent:s.change,high:s.price*1.008,low:s.price*0.985,timestamp:null,demo:true,stale:false};
}
// Explicitly fictional examples, never attributed to a real news publisher.
export function demoNews(symbols) {
 return symbols.flatMap((symbol,i)=>{
  const s=catalog.find(s=>s.symbol===symbol);if(!s)return [];
  return [
   {id:`${symbol}-earnings`,headline:`${s.name} earnings: margins and guidance take center stage`,summary:`An illustrative earnings briefing for ${s.name}, covering the questions around revenue growth, profitability, and management's outlook.`,body:'This is a fictional sample story. It does not describe an actual event. In live mode, this card would show the news provider’s summary and a link to the original publisher. Earnings and changes to guidance receive extra weight in the importance ranking.',category:'Earnings',source:'Sample briefing',symbols:[symbol],ageHours:2+i*3,url:null,demo:true},
   {id:`${symbol}-business`,headline:`What to watch in ${s.name}'s next chapter`,summary:`A sample company update exploring ${s.name}'s business, competitive position, and longer-term investment plans.`,body:'This fictional story demonstrates company-specific news. Only articles tagged with a stock in your selected portfolio appear in the portfolio feed. Switch between the stock tabs to narrow your reading, or choose Latest to sort by illustrative age.',category:'Company update',source:'Sample briefing',symbols:[symbol],ageHours:1+i*4,url:null,demo:true}
  ];
 });
}
export function rankNews(items,now=Date.now()) {
 return items.map(item=>{
  const age=item.demo?item.ageHours:Math.max(0,(now-item.datetime*1000)/3600000);
  const event=/\b(earnings|guidance|acquisition|merger|regulatory|lawsuit|bankruptcy|recall|fda|dividend|buyback)\b/i.exec(`${item.headline} ${item.summary}`);
  return {...item,ageHours:age,score:Math.round(40+(event?35:0)+Math.max(0,25-age/3)),category:item.category||(event?'Key development':'Company update'),reason:event?`Company match · ${event[1].toLowerCase()} coverage · recency`:'Company match · recency'};
 });
}
export function mergeNews(items,allowed) {
 const rows=[],byUrl=new Map(),byTitle=new Map();
 for(const item of items) {
  const symbols=[...new Set(item.symbols.filter(s=>allowed.includes(s)))];if(!symbols.length||!item.headline)continue;
  let url=null;try{const u=new URL(item.url);if(['https:','http:'].includes(u.protocol)){u.hash='';for(const k of [...u.searchParams.keys()])if(/^(utm_|ref$|source$)/i.test(k))u.searchParams.delete(k);url=u.toString();}}catch{}
  const title=item.headline.toLowerCase().replace(/[^a-z0-9]/g,''),old=(url&&byUrl.get(url))||byTitle.get(title);
  if(old){old.symbols=[...new Set([...old.symbols,...symbols])];continue;}
  const row={...item,url,symbols};rows.push(row);if(url)byUrl.set(url,row);byTitle.set(title,row);
 }
 return rankNews(rows);
}
export class Finnhub {
 constructor(getKey){this.getKey=getKey;this.cache=new Map();this.pending=new Map();this.calls=[];}
 clear(){this.cache.clear();}
 async get(path,params={},ttl=60000) {
  const key=this.getKey();if(!key)throw new Error('Add a free Finnhub key in Settings to enable live data.');
  const query=new URLSearchParams(params),id=`${path}?${query}`,cached=this.cache.get(id);
  if(cached&&Date.now()-cached.at<ttl)return {...cached,stale:false};
  if(this.pending.has(id))return this.pending.get(id);
  const task=(async()=>{try{
   this.calls=this.calls.filter(t=>Date.now()-t<60000);if(this.calls.length>=45)throw new Error('Free request budget reached. Please wait a minute.');this.calls.push(Date.now());
   const response=await fetch(`https://finnhub.io/api/v1/${path}?${query}`,{headers:{'X-Finnhub-Token':key},signal:AbortSignal.timeout(12000)});
   if(!response.ok)throw new Error(response.status===429?'Finnhub rate limit reached. Try again shortly.':response.status===401?'Finnhub rejected the API key. Check it in Settings.':response.status===403?'This endpoint is unavailable on your Finnhub plan. No paid access will be purchased.':`Finnhub is unavailable (${response.status}).`);
   const data=await response.json();if(data?.error)throw new Error('Finnhub could not return this data. Check your key and free-plan access.');
   const entry={data,at:Date.now(),stale:false};if(this.getKey()===key)this.cache.set(id,entry);return entry;
  }catch(error){const warning=error.name==='TimeoutError'?'Finnhub timed out. Try again shortly.':error.message==='fetch failed'?'Could not reach Finnhub. Check your connection.':error.message;if(cached)return {...cached,stale:true,warning};throw new Error(warning);
  }finally{this.pending.delete(id);}})();this.pending.set(id,task);return task;
 }
 async stocks(){const r=await this.get('stock/symbol',{exchange:'US'},86400000);if(!Array.isArray(r.data))throw new Error('Unexpected stock catalog response.');return r.data.filter(s=>s.currency==='USD'&&['Common Stock','ADR'].includes(s.type)&&/^[A-Z][A-Z0-9.-]{0,11}$/.test(s.symbol)).map(s=>({symbol:s.symbol,name:s.description,sector:'US equity',currency:'USD'}));}
 async quote(symbol){const r=await this.get('quote',{symbol}),q=r.data;if(!(q.c>0)||!(q.t>0))throw new Error(`No quote available for ${symbol}.`);return {symbol,price:q.c,previous:q.pc,change:q.d,changePercent:q.dp,high:q.h,low:q.l,timestamp:q.t*1000,stale:r.stale,warning:r.warning,demo:false};}
 async news(symbol){const from=new Date(Date.now()-7*86400000).toISOString().slice(0,10),to=new Date().toISOString().slice(0,10);const r=await this.get('company-news',{symbol,from,to},300000);if(!Array.isArray(r.data))throw new Error('Unexpected news response.');return {stale:r.stale,warning:r.warning,items:r.data.filter(n=>String(n.related||'').split(',').map(s=>s.trim().toUpperCase()).includes(symbol)&&n.datetime*1000>=Date.now()-7*86400000&&n.datetime*1000<=Date.now()+300000).map(n=>({id:String(n.id),headline:n.headline,summary:n.summary||'',source:n.source||'Publisher',datetime:n.datetime,url:n.url,symbols:[symbol],demo:false}))};}
}
