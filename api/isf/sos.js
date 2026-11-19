'use strict';
// SOS CHICAGO 양식: 각 HBL을 별도 시트에 작성하고, 한 건이면 두 번째 시트를 제거합니다.
const fs=require('fs/promises');
const path=require('path');
const JSZip=require('jszip');
const esc=v=>String(v??'').replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g,'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const clean=v=>typeof v==='string'?v.trim().slice(0,500):'';
function cell(xml,ref,value,numeric=false){
 const re=new RegExp(`<c\\b(?=[^>]*\\br="${ref}")[^>]*?(?:\\/>|>[\\s\\S]*?<\\/c>)`);
 const match=xml.match(re);if(!match)throw Error(`SOS CHICAGO 양식에 ${ref} 셀이 없습니다.`);
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
async function build(data,template,city){
 if(!({ '주성':'JSSY','람세스':'RLCL' }[data?.forwarder])||!Array.isArray(data.people)||![1,2].includes(data.people.length))throw Error('포워딩과 HBL을 확인해 주세요.');
 if(['mbl','etd','eta','vessel','voyage'].some(k=>!clean(data[k])))throw Error('MBL과 ETD를 입력해 주세요.');
 const required=['hbl','name','passport','birth','origin1','destination','container'];
 if(data.people.some(p=>required.some(k=>!clean(p[k]))))throw Error('각 HBL의 필수 항목을 확인해 주세요.');
 const zip=await JSZip.loadAsync(template);
 for(let i=0;i<data.people.length;i++){
  const p=data.people[i],file=`xl/worksheets/sheet${i+1}.xml`;let xml=await zip.file(file).async('string');
  const scac={ '주성':'JSSY', '람세스':'RLCL' }[data.forwarder];
  const number=clean(p.container).split('/')[0].trim();
  const vals={A10:clean(p.name),A11:clean(p.origin1),A12:clean(p.origin2),A13:'',E10:clean(p.name),E11:clean(p.origin1),E12:clean(p.origin2),A15:clean(p.name),A16:clean(p.destination),A17:clean(p.destination2),A18:'',E20:clean(p.passport),E22:'REPUBLIC OF KOREA',A24:scac+' '+clean(p.hbl).replace(/-/g,''),C24:clean(data.mbl),A26:clean(data.vessel)+' '+clean(data.voyage),E26:number};
  for(const [ref,val] of Object.entries(vals))xml=cell(xml,ref,val);
  xml=cell(xml,'A22',dateSerial(p.birth),true);xml=cell(xml,'F24',dateSerial(data.etd),true);xml=cell(xml,'G24',dateSerial(data.eta),true);
  zip.file(file,xml);
 }
 let book=await zip.file('xl/workbook.xml').async('string');
 // 두 양식 시트의 이름은 템플릿마다 다릅니다. 기존 이름은 유지하고 필요시 두 번째 시트만 제거합니다.
 const sheets=[...book.matchAll(/<sheet\b[^>]*\/>/g)];
 if(sheets.length<3)throw Error('SOS 양식의 시트 구성을 확인해 주세요.');
 if(data.people.length===1){const second=sheets[1][0], id=second.match(/\br:id="([^"]+)"/)?.[1];if(!id)throw Error('SOS 두 번째 시트 연결을 찾을 수 없습니다.');book=book.replace(second,'').replace(/<definedName\b(?=[^>]*\blocalSheetId="1")[^>]*>[\s\S]*?<\/definedName>/g,'');zip.remove('xl/worksheets/sheet2.xml');zip.remove('xl/worksheets/_rels/sheet2.xml.rels');let rel=await zip.file('xl/_rels/workbook.xml.rels').async('string');rel=rel.replace(new RegExp(`<Relationship\\b(?=[^>]*\\bId="${id}")(?=[^>]*Type="[^\"]*\\/worksheet")[^>]*\\/>`),'');zip.file('xl/_rels/workbook.xml.rels',rel);}
 book=book.replace(/<calcPr\b[^>]*\/>/,'<calcPr calcMode="auto" fullCalcOnLoad="1" forceFullCalc="1"/>');zip.file('xl/workbook.xml',book);zip.remove('xl/calcChain.xml');let relations=await zip.file('xl/_rels/workbook.xml.rels').async('string');relations=relations.replace(/<Relationship\b(?=[^>]*Type="[^"]*\/calcChain")[^>]*\/>/g,'');zip.file('xl/_rels/workbook.xml.rels',relations);
 // 불필요해진 기존 고객의 문자열을 양식 파일 내부에서도 제거합니다.
 const shared=zip.file('xl/sharedStrings.xml');if(shared){let content=await shared.async('string');const entries=[...content.matchAll(/<si(?:\s[^>]*)?>[\s\S]*?<\/si>/g)].map(m=>m[0]);const files=['xl/worksheets/sheet1.xml',...(data.people.length===2?['xl/worksheets/sheet2.xml']:[]),'xl/worksheets/sheet3.xml'];const used=new Set();for(const f of files){const xml=await zip.file(f).async('string');for(const m of xml.matchAll(/<c\b(?=[^>]*\bt="s")[^>]*>[\s\S]*?<v>(\d+)<\/v>[\s\S]*?<\/c>/g))used.add(+m[1]);}const indexes=[...used].sort((a,b)=>a-b),map=new Map(indexes.map((x,i)=>[x,i]));for(const f of files){let xml=await zip.file(f).async('string');xml=xml.replace(/(<c\b(?=[^>]*\bt="s")[^>]*>[\s\S]*?<v>)(\d+)(<\/v>[\s\S]*?<\/c>)/g,(m,a,n,b)=>a+map.get(+n)+b);zip.file(f,xml);}zip.file('xl/sharedStrings.xml',`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${indexes.length}" uniqueCount="${indexes.length}">${indexes.map(i=>entries[i]).join('')}</sst>`);}
 return zip.generateAsync({type:'nodebuffer',compression:'DEFLATE'});
}
const templates={
 'SOS (CHICAGO)':{file:'1.SOS(CHICAGO)_ ISF.XLSX',city:'CHICAGO'},
 'SOS (ATLANTA)':{file:'1. SOS(ATLANTA)_ISF.xlsx',city:'ATLANTA'},
 'SOS (SAVANNAH)':{file:'1.SOS(SAVANNAH)_ISF.xlsx',city:'SAVANNAH'},
 'SOS (DALLAS)':{file:'1. SOS(DALLAS)_ISF.XLSX',city:'DALLAS'}
};
module.exports=async(req,res)=>{try{const selected=templates[req.body?.partner];if(!selected)return res.status(400).json({error:'SOS 지역을 선택해 주세요.'});const template=await fs.readFile(path.join(process.cwd(),'templates',selected.file));const output=await build(req.body,template,selected.city);res.set('Cache-Control','no-store');res.set('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');res.set('Content-Disposition','attachment; filename="ISF.xlsx"');res.send(output);}catch(e){console.error('[ISF SOS]',e.message);res.status(e.code==='ENOENT'?500:400).json({error:e.code==='ENOENT'?'선택한 SOS 엑셀 양식 파일을 찾을 수 없습니다.':e.message});}};
module.exports.build=build;
