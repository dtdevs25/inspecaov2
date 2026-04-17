import fs from 'fs';
import path from 'path';

function walk(d) {
    fs.readdirSync(d, { withFileTypes: true }).forEach(f => {
        const p = path.join(d, f.name);
        if (f.isDirectory()) {
            walk(p);
        } else if (f.name.endsWith('.tsx') || f.name.endsWith('.ts')) {
            let c = fs.readFileSync(p, 'utf8');
            let modified = false;
            
            const m = { 
                'ÃƒÂ¡': 'á', 
                'ÃƒÂ§': 'ç', 
                'ÃƒÂµ': 'õ', 
                'ÃƒÂ£': 'ã', 
                'ÃƒÂ³': 'ó', 
                'ÃƒÂª': 'ê', 
                'ÃƒÂ©': 'é', 
                'ÃƒÂ­': 'í', 
                'AÃƒÂ§ÃƒÂ£o': 'Ação',
                'ÃƒÂ§ÃƒÂµes': 'ções', 
                'ÃƒÂ§ÃƒÂ£o': 'ção',
                'pÃƒÂ¡gina': 'página',
                'CriaÃƒÂ§ÃƒÂ£o': 'Criação',
                'MÃƒÂ¡x': 'Máx',
                'UsuÃƒÂ¡rio': 'Usuário',
                'UsuÃƒÂ¡rios': 'Usuários',
                'RelatÃƒÂ³rios': 'Relatórios',
                'AprovaÃƒÂ§ÃƒÂµes': 'Aprovações',
                'GestÃƒÂ£o': 'Gestão',
                'ÃƒÂ rea': 'Área',
                'vÃƒÂ­nculo': 'vínculo',
                'AprovaÃƒÂ§ÃƒÂ£o': 'Aprovação',
                'InspeÃƒÂ§ÃƒÂ£o': 'Inspeção',
                'InspeÃƒÂ§ÃƒÂµes': 'Inspeções',
                'PÃƒÂ¡gina': 'Página',
                'CRIAÃSÃ£O': 'CRIAÇÃO',
                'AÃSÃMES': 'AÇÕES'
            }; 
            
            for (let [k, v] of Object.entries(m)) {
                if (c.includes(k)) {
                    c = c.split(k).join(v);
                    modified = true;
                }
            } 
            
            if (modified) fs.writeFileSync(p, c, 'utf8');
        }
    });
} 
walk('src');
console.log('done');
