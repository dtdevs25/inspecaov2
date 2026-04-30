const fs = require('fs');
const path = 'server/cron.ts';
let content = fs.readFileSync(path, 'utf8');

// The broken part starts at "const emailHtml = `" and ends at "const emailHtml = `"
// We want to keep the SECOND one.

const searchStr = 'const emailHtml = `';
const firstIndex = content.indexOf(searchStr, content.indexOf('for (const [emailAddr, recipientName] of recipients.entries()) {', content.lastIndexOf('// 2) Processar Empresas')));
const secondIndex = content.indexOf(searchStr, firstIndex + 1);

if (firstIndex !== -1 && secondIndex !== -1) {
    const newContent = content.slice(0, firstIndex) + content.slice(secondIndex);
    fs.writeFileSync(path, newContent);
    console.log('Fixed successfully');
} else {
    console.log('Indices not found:', firstIndex, secondIndex);
}
