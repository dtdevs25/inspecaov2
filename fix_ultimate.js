import fs from 'fs';
import path from 'path';

function walkDir(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
            walkDir(fullPath);
        } else if (fullPath.endsWith('.tsx') || fullPath.endsWith('.ts')) {
            const content = fs.readFileSync(fullPath, 'utf8');
            const fixed = content.replace(/[\xC2-\xC3][\x80-\xBF]/g, match => {
                return Buffer.from(match, 'latin1').toString('utf8');
            });
            if (content !== fixed) {
                fs.writeFileSync(fullPath, fixed, 'utf8');
                console.log('Fixed', fullPath);
            }
        }
    }
}

walkDir('src');
console.log('Finished ultimate fix');
