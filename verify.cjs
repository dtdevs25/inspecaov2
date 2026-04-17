const http = require('http');

http.get('http://localhost:3000/api/files/foto-planodeacao/1774285172478_semfoto.jpg', (res) => {
  console.log('Status Code:', res.statusCode);
  console.log('Headers:', res.headers);
  
  let data = [];
  res.on('data', chunk => data.push(chunk));
  res.on('end', () => {
    const buffer = Buffer.concat(data);
    console.log('Received bytes:', buffer.length);
    if (res.statusCode !== 200) {
      console.log('Response body:', buffer.toString());
    }
  });
}).on('error', err => {
  console.error('Error fetching:', err.message);
});
