var express = require('express');
var app = express();

app.use('/', express.static(__dirname + '/assets/html'));
app.use('/js', express.static(__dirname + '/assets/js'));
app.use('/css', express.static(__dirname + '/assets/css'));
app.use('/img', express.static(__dirname + '/assets/img'));

app.listen(54487);
console.log('Desmos server listening on 54487.');
