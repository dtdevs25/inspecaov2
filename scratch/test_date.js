
const dateInBrt = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
console.log('Date string:', new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
console.log('Parsed Date:', dateInBrt.toString());
console.log('Day:', dateInBrt.getDay());
console.log('Hours:', dateInBrt.getHours());
console.log('Minutes:', dateInBrt.getMinutes());
