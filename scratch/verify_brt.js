
function testBrtTime() {
    const now = new Date();
    const brtParts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Sao_Paulo',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
        weekday: 'short',
        day: 'numeric',
        month: 'numeric',
        year: 'numeric'
    }).formatToParts(now);

    const getPart = (type) => brtParts.find(p => p.type === type)?.value;
    
    const weekdayShort = getPart('weekday') || 'Sun';
    const dayMap = { 'Sun': 0, 'Mon': 1, 'Tue': 2, 'Wed': 3, 'Thu': 4, 'Fri': 5, 'Sat': 6 };
    const currentDay = dayMap[weekdayShort] ?? 0;

    const currentTimeStr = `${getPart('hour')}:${getPart('minute')}`;
    
    console.log('Current System Time:', now.toString());
    console.log('BRT Weekday String:', weekdayShort);
    console.log('BRT Day (numeric):', currentDay);
    console.log('BRT Time String:', currentTimeStr);
    console.log('BRT Parts Summary:', brtParts.map(p => `${p.type}: ${p.value}`).join(', '));
}

testBrtTime();
