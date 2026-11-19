'use strict';
// 파트너별 ISF 양식은 이 목록에 추가합니다. 클라이언트가 파일 경로를 지정할 수 없습니다.
const partners = { 'HI-TEK': require('./hi-tek'), 'KEYWORD': require('./keyword'), 'KT (ATLANTA)': require('./kt-atlanta'), 'SOS (CHICAGO)': require('./sos'), 'SOS (ATLANTA)': require('./sos'), 'SOS (SAVANNAH)': require('./sos'), 'SOS (DALLAS)': require('./sos') };
module.exports = (req, res) => {
 const handler = Object.prototype.hasOwnProperty.call(partners, req.body?.partner) && partners[req.body.partner];
 if (!handler) return res.status(400).json({error:'지원되는 파트너를 선택해 주세요.'});
 return handler(req, res);
};
