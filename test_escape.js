// 转义层级测试：搞清楚模板字符串里反斜杠数量 → 浏览器正则的实际匹配
// 2反斜杠版
const e2 = `var m='offerId=683255797158'.match(/offerId=(\\d+)/); return m?m[1]:null;`;
// 4反斜杠版
const e4 = `var m='offerId=683255797158'.match(/offerId=(\\\\d+)/); return m?m[1]:null;`;
// 8反斜杠版
const e8 = `var m='offerId=683255797158'.match(/offerId=(\\\\\\\\d+)/); return m?m[1]:null;`;
console.log('e2 字符串内容:', JSON.stringify(e2));
console.log('e4 字符串内容:', JSON.stringify(e4));
console.log('e8 字符串内容:', JSON.stringify(e8));
console.log('e2 匹配:', eval(e2));
console.log('e4 匹配:', eval(e4));
console.log('e8 匹配:', eval(e8));
