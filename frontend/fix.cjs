const fs = require('fs');
const file = '/Users/sibhimanyu/Code/Main Projects (Git)/Abhishri Engine/frontend/src/components/StudentLedgerView.jsx';
let content = fs.readFileSync(file, 'utf8');

// Replace \` with `
content = content.split('\\`').join('`');
// Replace \$ with $
content = content.split('\\$').join('$');

fs.writeFileSync(file, content);
console.log('Fixed file');
