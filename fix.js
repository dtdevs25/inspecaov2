import fs from 'fs';
import path from 'path';

function fixFile(filePath) {
    let content = fs.readFileSync(filePath, 'utf8');
    let original = content;

    content = content.replace(/AÃƒÂ§ÃƒÂ£o/g, 'Ação')
                     .replace(/aÃƒÂ§ÃƒÂ£o/g, 'ação')
                     .replace(/AÃƒÂ§ÃƒÂµes/g, 'Ações')
                     .replace(/aÃƒÂ§ÃƒÂµes/g, 'ações')
                     .replace(/demonstraÃƒÂ§ÃƒÂ£o/g, 'demonstração')
                     .replace(/nÃƒÂ£o/g, 'não')
                     .replace(/NÃƒÂ£o/g, 'Não')
                     .replace(/CriaÃƒÂ§ÃƒÂ£o/g, 'Criação')
                     .replace(/criaÃƒÂ§ÃƒÂ£o/g, 'criação')
                     .replace(/VÃƒÂ­nculo/g, 'Vínculo')
                     .replace(/vÃƒÂ­nculo/g, 'vínculo')
                     .replace(/pÃƒÂ¡gina/g, 'página')
                     .replace(/MÃƒÂ¡x/g, 'Máx')
                     .replace(/UsuÃƒÂ¡rio/g, 'Usuário')
                     .replace(/usuÃƒÂ¡rio/g, 'usuário')
                     .replace(/GestÃƒÂ£o/g, 'Gestão')
                     .replace(/ÃƒÂ¡/g, 'á')
                     .replace(/ÃƒÂ§/g, 'ç')
                     .replace(/ÃƒÂ£/g, 'ã')
                     .replace(/ÃƒÂµ/g, 'õ')
                     .replace(/ÃƒÂ³/g, 'ó')
                     .replace(/ÃƒÂ©/g, 'é')
                     .replace(/ÃƒÂª/g, 'ê')
                     .replace(/ÃƒÂ­/g, 'í')
                     .replace(/ÃƒÂ/g, 'à');

    if (content !== original) {
        fs.writeFileSync(filePath, content, 'utf8');
        console.log('Fixed', filePath);
    }
}

function walkDir(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
            walkDir(fullPath);
        } else if (fullPath.endsWith('.tsx') || fullPath.endsWith('.ts')) {
            fixFile(fullPath);
        }
    }
}

walkDir('src');
console.log('Done fixing encodings');
