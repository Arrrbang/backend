'use strict';
// KT ATLANTA 양식: 각 HBL을 별도 시트에 작성하고, 한 건이면 두 번째 시트를 제거합니다.
const fs=require('fs/promises');
const path=require('path');
const JSZip=require('jszip');
const esc=v=>String(v??'').replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g,'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const clean=v=>typeof v==='string'?v.trim().slice(0,500):'';
function cell(xml,ref,value,numeric=false){
 const re=new RegExp(`<c\\b(?=[^>]*\\br="${ref}")[^>]*?(?:\\/>|>[\\s\\S]*?<\\/c>)`);
 const match=xml.match(re);if(!match)throw Error(`KT ATLANTA 양식에 ${ref} 셀이 없습니다.`);
 const attrs=match[0].match(/^<c\b([^>]*?)(?:\/>|>)/)[1].replace(/\s+t="[^"]*"/g,'');
 return xml.replace(re,numeric?`<c${attrs}><v>${value}</v></c>`:`<c${attrs} t="inlineStr"><is><t xml:space="preserve">${esc(value)}</t></is></c>`);
}
function dateSerial(s){
 const m=clean(s).toUpperCase().match(/^(?:(\d{1,2})([A-Z]{3})(\d{4})|([A-Z]{3})\.\s*(\d{1,2}),\s*(\d{4}))$/);
 if(!m)throw Error('생년월일 또는 ETD 형식을 확인해 주세요.');
 const months=['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
 const d=Number(m[1]||m[5]),month=months.indexOf(m[2]||m[4]),y=Number(m[3]||m[6]),t=Date.UTC(y,month,d),dt=new Date(t);
 if(month<0||y<1900||dt.getUTCFullYear()!==y||dt.getUTCMonth()!==month||dt.getUTCDate()!==d)throw Error('생년월일 또는 ETD가 올바르지 않습니다.');
 return Math.round((t-Date.UTC(1899,11,30))/86400000);
}
function enableWrap(zip, xml, styles) {
 const xfBlock=styles.match(/<cellXfs\b[^>]*>[\s\S]*?<\/cellXfs>/);if(!xfBlock)throw Error('엑셀 셀 서식을 찾을 수 없습니다.');
 let block=xfBlock[0];const xfs=[...block.matchAll(/<xf\b[^>]*(?:\/>|>[\s\S]*?<\/xf>)/g)].map(m=>m[0]);const newStyles=new Map();
 for(const ref of ['B5','D5','B7','D7']){
  const re=new RegExp(`<c\\b(?=[^>]*\\br="${ref}")[^>]*>`);const start=xml.match(re)?.[0];if(!start)throw Error(`KT 양식에 ${ref} 셀이 없습니다.`);
  const original=Number(start.match(/\bs="(\d+)"/)?.[1]||0);if(!newStyles.has(original)){
   let xf=xfs[original];if(!xf)throw Error('엑셀 주소 서식을 찾을 수 없습니다.');
   if(/<alignment\b/.test(xf)){xf=xf.replace(/<alignment\b([^>]*?)(\/?>)/,(m,a,close)=>`<alignment${a.replace(/\s+wrapText="[^"]*"/g,'')} wrapText="1"${close}`);}
   else if(xf.endsWith('/>'))xf=xf.slice(0,-2)+' applyAlignment="1"><alignment wrapText="1"/></xf>';
   else xf=xf.replace('</xf>','<alignment wrapText="1"/></xf>');
   newStyles.set(original,xfs.length);xfs.push(xf);block=block.replace('</cellXfs>',xf+'</cellXfs>');
  }
  const style=newStyles.get(original);xml=xml.replace(re,start=>/\bs="\d+"/.test(start)?start.replace(/\bs="\d+"/,`s="${style}"`):start.replace('<c ',`<c s="${style}" `));
 }
 block=block.replace(/(<cellXfs\b[^>]*\bcount=")\d+("[^>]*>)/,`$1${xfs.length}$2`);styles=styles.replace(xfBlock[0],block);
 // 두 줄 주소가 셀에 표시될 수 있도록 병합된 행의 높이를 확보합니다.
 for(const row of [5,7])xml=xml.replace(new RegExp(`<row\\b(?=[^>]*\\br="${row}")[^>]*>`),v=>v.replace(/\s+ht="[^"]*"/g,'').replace(/\s+customHeight="[^"]*"/g,'').replace(/>$/,' ht="72" customHeight="1">'));
 return {xml,styles};
}
async function build(data,template){
 const scac={'주성':'JSSY','람세스':'RLCL','중앙':'CEPV','티엔케이':'GGBO','로지피아':'LCFF'}[data?.forwarder];
 if(!scac||!Array.isArray(data.people)||![1,2].includes(data.people.length))throw Error('포워딩과 HBL을 확인해 주세요.');
 if(!/^[A-Za-z]{4}/.test(clean(data.mbl)))throw Error('MBL 번호 앞에 선사 코드 영문 4자를 입력해 주세요.');
 if(['etd','eta','vessel','voyage'].some(k=>!clean(data[k])))throw Error('ETD, ETA, 선명과 항차를 확인해 주세요.');
 const required=['hbl','name','origin1','destination','quantity','weight'];
 if(data.people.some(p=>required.some(k=>!clean(p[k]))))throw Error('각 HBL의 주소와 수량·중량을 확인해 주세요.');
 const zip=await JSZip.loadAsync(template);let styles=await zip.file('xl/styles.xml').async('string');
 for(let i=0;i<data.people.length;i++){
  const p=data.people[i],file=`xl/worksheets/sheet${i+1}.xml`;let xml=await zip.file(file).async('string');
  const origin=[clean(p.origin1),clean(p.origin2),clean(p.origin3)].filter(Boolean).join('\n'),destination=[clean(p.destination),clean(p.destination2),clean(p.destination3)].filter(Boolean).join('\n');
  const kr=clean(p.name)+' // '+origin,us=clean(p.name)+' // '+destination,hbl=clean(p.hbl).replace(/-/g,'');
  const vals={B5:kr,D5:kr,B7:us,D7:us,C18:clean(data.mbl),C19:clean(data.mbl).slice(0,4).toUpperCase(),E18:hbl,E19:scac,C20:scac+' '+hbl,C21:clean(data.vessel),C22:clean(data.voyage),E21:clean(p.quantity)+' CT',E22:clean(p.weight)+' KG'};
  for(const [ref,val] of Object.entries(vals))xml=cell(xml,ref,val);
  for(const [ref,val] of [['E23',data.etd],['E24',data.eta],['E25',data.eta]])xml=cell(xml,ref,dateSerial(val),true);
  ({xml,styles}=enableWrap(zip,xml,styles));zip.file(file,xml);
 }
 zip.file('xl/styles.xml',styles);let book=await zip.file('xl/workbook.xml').async('string');let rel=await zip.file('xl/_rels/workbook.xml.rels').async('string');
 if(data.people.length===1){const sheets=[...book.matchAll(/<sheet\b[^>]*\/>/g)];const second=sheets[1]?.[0],id=second?.match(/\br:id="([^"]+)"/)?.[1];if(!id)throw Error('두 번째 화주 시트를 찾을 수 없습니다.');book=book.replace(second,'').replace(/<definedName\b(?=[^>]*\blocalSheetId="1")[^>]*>[\s\S]*?<\/definedName>/g,'');zip.remove('xl/worksheets/sheet2.xml');zip.remove('xl/worksheets/_rels/sheet2.xml.rels');rel=rel.replace(new RegExp(`<Relationship\\b(?=[^>]*\\bId="${id}")(?=[^>]*Type="[^\"]*\\/worksheet")[^>]*\\/>`),'');}
 zip.remove('xl/calcChain.xml');rel=rel.replace(/<Relationship\b(?=[^>]*Type="[^"]*\/calcChain")[^>]*\/>/g,'');zip.file('xl/_rels/workbook.xml.rels',rel);book=book.replace(/<calcPr\b[^>]*\/>/,'<calcPr calcMode="auto" fullCalcOnLoad="1" forceFullCalc="1"/>');zip.file('xl/workbook.xml',book);
 // 이전 화주 데이터가 남지 않도록 남은 모든 시트에서 실제 참조되는 문자열만 보존합니다.
 const shared=zip.file('xl/sharedStrings.xml');if(shared){const content=await shared.async('string'),entries=[...content.matchAll(/<si(?:\s[^>]*)?>[\s\S]*?<\/si>/g)].map(m=>m[0]);const files=['xl/worksheets/sheet1.xml',...(data.people.length===2?['xl/worksheets/sheet2.xml']:[]),'xl/worksheets/sheet3.xml','xl/worksheets/sheet4.xml'].filter(f=>zip.file(f));const used=new Set();for(const f of files){const xml=await zip.file(f).async('string');for(const m of xml.matchAll(/<c\b(?=[^>]*\bt="s")[^>]*>[\s\S]*?<v>(\d+)<\/v>[\s\S]*?<\/c>/g))used.add(+m[1]);}const indexes=[...used].sort((a,b)=>a-b),map=new Map(indexes.map((x,i)=>[x,i]));for(const f of files){let xml=await zip.file(f).async('string');xml=xml.replace(/(<c\b(?=[^>]*\bt="s")[^>]*>[\s\S]*?<v>)(\d+)(<\/v>[\s\S]*?<\/c>)/g,(m,a,n,b)=>a+map.get(+n)+b);zip.file(f,xml);}zip.file('xl/sharedStrings.xml',`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${indexes.length}" uniqueCount="${indexes.length}">${indexes.map(i=>entries[i]).join('')}</sst>`);}
 return zip.generateAsync({type:'nodebuffer',compression:'DEFLATE'});
}
module.exports=async(req,res)=>{try{const template=await fs.readFile(path.join(process.cwd(),'templates','1.KT(ATLANTA)_ISF.xlsx'));const output=await build(req.body,template);res.set('Cache-Control','no-store');res.set('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');res.set('Content-Disposition','attachment; filename="ISF.xlsx"');res.send(output);}catch(e){console.error('[ISF KT]',e.message);res.status(e.code==='ENOENT'?500:400).json({error:e.code==='ENOENT'?'KT 엑셀 양식 파일을 찾을 수 없습니다.':e.message});}};
module.exports.build=build;
