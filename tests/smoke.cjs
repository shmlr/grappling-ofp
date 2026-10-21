// Grappling OFP regression smoke tests. Run: node tests/smoke.cjs
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync('index.html','utf8');
const script=html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
assert.ok(script,'Inline application script exists');
assert.equal((html.match(/id="date"/g)||[]).length,1,'Exactly one visible date input');
assert.ok(!html.includes('function viz(kind)'),'Unused SVG exercise sketches removed');
const failures=[];
function boot(seed=[]){
  const defaults={mode:'home',date:'',matdate:'',day:'Пн',week:'1',minutes:'20',fatigue:'3',matmin:'80',rpe:'5',bouts:'0',replaceFeeling:'good',replaceGym:'no'};
  const elements=new Map(),alerts=[],store=new Map();
  if(seed!==null)store.set('grappling-ofp-v2',typeof seed==='string'?seed:JSON.stringify(seed));
  function el(id){
    if(elements.has(id))return elements.get(id);
    const x={id,value:defaults[id]??'',checked:false,disabled:false,textContent:'',className:'',title:'',files:[],onclick:null,addEventListener(type,fn){this['on'+type]=fn;}};
    let markup='';
    Object.defineProperty(x,'innerHTML',{get(){return markup;},set(value){
      markup=String(value);
      for(const match of markup.matchAll(/id="([^"]+)"([^>]*)>/g)){
        const item=el(match[1]),value=match[2].match(/\bvalue="([^"]*)"/);
        if(value)item.value=value[1];
        item.checked=false;
      }
    }});
    elements.set(id,x);return x;
  }
  for(const match of html.slice(0,html.indexOf('<script>')).matchAll(/id="([^"]+)"/g))el(match[1]);
  const document={getElementById:el,querySelectorAll:()=>[],body:{appendChild(){}},createElement(){return{click(){},remove(){}};}};
  const localStorage={getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v)};
  const context={document,localStorage,Date,Math,Number,String,Array,Set,Map,JSON,console,URL:{createObjectURL(){return'blob:test';},revokeObjectURL(){}},Blob,alert:m=>alerts.push(m),confirm:()=>true,setTimeout:()=>{}};
  vm.runInNewContext(script,context,{timeout:1500});
  return {el,store,alerts,logs:()=>JSON.parse(store.get('grappling-ofp-v2')||'[]')};
}
function check(title,fn){
  try{fn();console.log('PASS '+title);}
  catch(e){failures.push({title,error:e.stack||String(e)});console.error('FAIL '+title,e.message);}
}
function date(app,value){app.el('date').onchange({target:{value}});}
check('Initial render and valid date',()=>{
 const a=boot();assert.ok(a.el('schedule').innerHTML);assert.ok(a.el('weekday').textContent);
});
check('Mobile UI structure has one date and expandable help',()=>{
 const a=boot();
 assert.ok(a.el('todaySummary').innerHTML);
 assert.ok(html.includes('class="exercise-info"')===false || html.includes('function detail(name)'));
 assert.ok(a.el('exercises').innerHTML.includes('Техника и ошибки'));
 assert.ok(html.includes('id="historyDetails"'));
});
check('One date drives weekdays and all training modes',()=>{
 const a=boot();date(a,'2026-10-21');assert.equal(a.el('weekday').textContent,'Ср');assert.equal(a.el('day').value,'Ср');assert.equal(a.el('matdate').value,'2026-10-21');
});
check('Canceled grappling logs actual minutes and no mat session',()=>{
 const a=boot();date(a,'2026-10-21');a.el('makeReplacement').onclick();
 assert.ok(a.el('replacement').innerHTML.includes('repMinutes'));
 a.el('rep_c0_0').checked=true;a.el('repMinutes').value='23';a.el('repFatigue').value='4';a.el('saveReplacement').onclick();
 assert.equal(a.logs()[0].type,'replacement');assert.equal(a.logs()[0].minutes,23);assert.equal(a.logs()[0].fatigue,4);
 assert.equal(a.logs().filter(x=>x.type==='mat').length,0);
 assert.equal(a.el('matmin').value,0);assert.equal(a.el('savemat').disabled,true);
});
check('Missing actual minutes do not save a replacement',()=>{
 const a=boot();date(a,'2026-10-21');a.el('makeReplacement').onclick();a.el('rep_c0_0').checked=true;
 a.el('saveReplacement').onclick();assert.equal(a.logs().length,0);
});
check('Rest logs zero minutes and zero sets',()=>{
 const a=boot();date(a,'2026-10-21');a.el('replaceFeeling').value='tired';a.el('makeReplacement').onclick();a.el('saveReplacement').onclick();
 assert.equal(a.logs()[0].kind,'rest');assert.equal(a.logs()[0].minutes,0);assert.equal(a.logs()[0].sets.length,0);
});
check('Recovery rule: a prior OFP session prevents a second full workout',()=>{
 const a=boot();date(a,'2026-10-21');a.el('c0_0').checked=true;a.el('save').onclick();
 assert.equal(a.logs()[0]?.type,'ofp');a.el('makeReplacement').onclick();
 assert.ok(a.el('replacement').innerHTML.includes('Отдых вместо борьбы'));
});
check('Gym today triggers light mode on an otherwise rested day',()=>{
 const a=boot();date(a,'2026-10-22');a.el('replaceGym').value='yes';a.el('makeReplacement').onclick();
 assert.ok(a.el('replacement').innerHTML.includes('Лёгкая работа'));
});
check('Mat and replacement cannot both be recorded for one day',()=>{
 const a=boot();date(a,'2026-10-21');a.el('savemat').onclick();a.el('savemat').onclick();
 assert.equal(a.logs().length,1);assert.equal(a.logs()[0].type,'mat');
 a.el('makeReplacement').onclick();assert.equal(a.logs().length,1);
});
check('Changing date resets mat values and cancellation controls',()=>{
 const a=boot();date(a,'2026-10-21');a.el('replaceFeeling').value='tired';a.el('makeReplacement').onclick();a.el('saveReplacement').onclick();
 date(a,'2026-10-22');assert.equal(a.el('matmin').value,80);assert.equal(a.el('rpe').value,5);assert.equal(a.el('savemat').disabled,false);
});
check('Sunday offers no accidental mat, replacement or OFP',()=>{
 const a=boot();date(a,'2026-10-25');assert.equal(a.el('save').disabled,true);assert.equal(a.el('savemat').disabled,true);assert.equal(a.el('makeReplacement').disabled,true);
});
check('Legacy backups with mismatched day label are preserved',()=>{
 const old=[{id:'legacy-1',type:'ofp',date:'2026-10-21',mode:'home',day:'Пн',week:1,sets:[{exercise:'Dead bug',set:1,count:6,kg:0}],minutes:20,fatigue:3}];
 const a=boot(old);assert.ok(a.el('stats').innerHTML.includes('<strong>1</strong><span>ОФП</span>'));assert.equal(a.logs().length,1);
});
check('Malformed saved journal is not overwritten',()=>{
 const a=boot('{broken json');assert.ok(a.el('stats').textContent.includes('Ошибка чтения истории'));
 date(a,'2026-10-21');a.el('savemat').onclick();
 assert.equal(a.store.get('grappling-ofp-v2'),'{broken json');
});
check('Invalid duration does not write an OFP record',()=>{
 const a=boot();date(a,'2026-10-21');a.el('c0_0').checked=true;a.el('minutes').value='-3';a.el('save').onclick();assert.equal(a.logs().length,0);
});

check('Deload week never proposes a heavy replacement',()=>{
 const a=boot();date(a,'2026-10-21');a.el('week').value='7';a.el('week').onchange();a.el('makeReplacement').onclick();
 assert.ok(a.el('replacement').innerHTML.includes('Лёгкая работа'));
});
check('Duplicate stored IDs block writes without losing old data',()=>{
 const entry={id:'repeat',type:'mat',date:'2026-10-21',minutes:80,rpe:5,bouts:0};
 const a=boot([entry,entry]);assert.ok(a.el('stats').textContent.includes('Ошибка чтения истории'));
});
check('Progress recommendation stops after a recent painful session',()=>{
 const dates=['2026-10-18','2026-10-19','2026-10-20','2026-10-21'];
 const old=dates.map((d,i)=>({id:'safe-'+i,type:'ofp',date:d,mode:'home',day:'Пн',week:1,minutes:15,fatigue:3,quality:true,pain:i===3,sets:[{exercise:'Dead bug',set:1,count:6,kg:0}]}));
 const a=boot(old);assert.ok(!a.el('progress').innerHTML.includes('Можно обсудить с тренером усложнение: Мёртвый жук'));
 const b=boot(old.slice(0,3));assert.ok(b.el('progress').innerHTML.includes('Можно обсудить с тренером усложнение: Мёртвый жук'));
});
if(failures.length){
  console.error(JSON.stringify(failures,null,2));
  process.exitCode=1;
} else console.log('All Grappling OFP smoke tests passed.');
