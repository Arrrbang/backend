'use strict';
const fs = require('fs/promises');
const path = require('path');
const JSZip = require('jszip');
const escapeXml = value => String(value || '').replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g,'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
function setCell(xml, ref, value) {
 const re = new RegExp(`<c\\b(?=[^>]*\\br="${ref}")[^>]*?(?:\\/>|>[\\s\\S]*?<\\/c>)`);
 const match=xml.match(re); if(!match) throw Error(`양식에 ${ref} 셀이 없습니다.`);
 const attrs=match[0].match(/^<c\b([^>]*?)(?:\/>|>)/)[1].replace(/\s+t="[^"]*"/g,'');
 return xml.replace(re,`<c${attrs} t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`);
}
async function build(data, template) {
 if (!data || !({'주성':'JSSY','람세스':'RLCL'}[data.forwarder]) || !Array.isArray(data.people) || ![1,2].includes(data.people.length)) throw Error('포워딩과 1~2건의 HBL을 확인해 주세요.');
 const str=v=>typeof v==='string'?v.trim().slice(0,500):'';
 const common=['mbl','etd','vessel','voyage']; if(common.some(x=>!str(data[x])))throw Error('MBL, ETD, 선명, 항차를 입력해 주세요.');
 if(data.people.some(p=>['hbl','name','origin1','destination','passport','birth','quantity','weight'].some(k=>!str(p[k]))))throw Error('각 HBL의 필수 항목을 확인해 주세요.');
 const z=await JSZip.loadAsync(template);const names=['NAME1','NAME2'];
 for(let i=0;i<data.people.length;i++){
  const p=data.people[i];const file=`xl/worksheets/sheet${i+1}.xml`;let xml=await z.file(file).async('string');
  const values={A6:`AMS SCAC CODE # ${({'주성':'JSSY','람세스':'RLCL'}[data.forwarder])} / MASTER B.L#: ${str(data.mbl)}   /HOUSE B.L#: ${({'주성':'JSSY','람세스':'RLCL'}[data.forwarder])} ${str(p.hbl)}`,E6:`Vessel Name: ${str(data.vessel)}     Voyage: ${str(data.voyage)}  Q'TY: ${str(p.quantity)}  Weight: ${str(p.weight)} kg  ETD: ${str(data.etd)}`,A10:str(p.name),A11:str(p.origin1),A12:str(p.origin2),A13:str(p.origin3),A17:str(p.destination),A18:str(p.destination2),A19:str(p.destination3),A29:`여권 번호: ${str(p.passport)} 여권 발행국:REPUBLIC OF KOREA 생년월일: ${str(p.birth)}`};
  // 복사본은 수식 계산기 유무와 관계없이 같은 내용을 바로 표시합니다.
  Object.assign(values, {
   E10: values.A10, E11: values.A11, E12: values.A12, E13: values.A13,
   A16: values.A10, E16: values.A10,
   E17: values.A17, E18: values.A18, E19: values.A19, E29: values.A29
  });
  for(const [ref,value] of Object.entries(values))xml=setCell(xml,ref,value);
  // Clear stale cached formula values; Excel will recalculate the formulas.
  xml=xml.replace(/(<c\b[^>]*>\s*<f[^>]*>[\s\S]*?<\/f>)\s*<v[^>]*>[\s\S]*?<\/v>/g,'$1');
  z.file(file,xml);
 }
 let workbook=await z.file('xl/workbook.xml').async('string');
 if(data.people.length===1){workbook=workbook.replace(/<sheet\b(?=[^>]*\bname="NAME2")[^>]*\/>/,'');z.remove('xl/worksheets/sheet2.xml');z.remove('xl/worksheets/_rels/sheet2.xml.rels');}
 z.remove('xl/calcChain.xml');
 let rels=await z.file('xl/_rels/workbook.xml.rels').async('string');
 rels=rels.replace(/<Relationship\b(?=[^>]*Type="[^"]*\/calcChain")[^>]*\/>/g,'');
 if(data.people.length===1){rels=rels.replace(/<Relationship\b(?=[^>]*Id="rId2")(?=[^>]*Type="[^"]*\/worksheet")[^>]*\/>/g,'');z.remove('xl/printerSettings/printerSettings2.bin');}
 z.file('xl/_rels/workbook.xml.rels',rels);
 workbook=workbook.replace(/<calcPr\b[^>]*\/>/,'<calcPr calcMode="auto" fullCalcOnLoad="1" forceFullCalc="1"/>');z.file('xl/workbook.xml',workbook);
 // Existing shared strings may contain prior customers. Compact them to those still referenced.
 const shared=z.file('xl/sharedStrings.xml');if(shared){let content=await shared.async('string');const entries=[...content.matchAll(/<si(?:\s[^>]*)?>[\s\S]*?<\/si>/g)].map(m=>m[0]);let used=new Set();for(let i=0;i<data.people.length;i++){const f=z.file(`xl/worksheets/sheet${i+1}.xml`);const xml=await f.async('string');for(const m of xml.matchAll(/<c\b(?=[^>]*\bt="s")[^>]*>[\s\S]*?<v>(\d+)<\/v>[\s\S]*?<\/c>/g))used.add(+m[1]);}const sorted=[...used].sort((a,b)=>a-b),map=new Map(sorted.map((x,i)=>[x,i]));for(let i=0;i<data.people.length;i++){const n=`xl/worksheets/sheet${i+1}.xml`;let xml=await z.file(n).async('string');xml=xml.replace(/(<c\b(?=[^>]*\bt="s")[^>]*>[\s\S]*?<v>)(\d+)(<\/v>[\s\S]*?<\/c>)/g,(m,a,num,b)=>a+map.get(+num)+b);z.file(n,xml);}z.file('xl/sharedStrings.xml',`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${sorted.length}" uniqueCount="${sorted.length}">${sorted.map(i=>entries[i]).join('')}</sst>`);}
 return z.generateAsync({type:'nodebuffer',compression:'DEFLATE'});
}
module.exports=async(req,res)=>{try{const template=await fs.readFile(path.join(process.cwd(),'templates','1.HI-TEK_ISF.xlsx'));const output=await build(req.body,template);res.set('Cache-Control','no-store');res.set('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');res.set('Content-Disposition','attachment; filename="ISF.xlsx"');res.send(output);}catch(e){console.error('[ISF]',e.message);res.status(e.code==='ENOENT'?500:400).json({error:e.code==='ENOENT'?'엑셀 양식 파일을 찾을 수 없습니다.':e.message});}};
module.exports.build=build;
