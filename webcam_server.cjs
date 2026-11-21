'use strict';
// Strict localhost-only static server: secure-context camera API in Edge/Chrome.
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const root=__dirname,allowed=new Set(['webcam.html','webcam_app.js','webcam_core.js','predictive_engine.js']);
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8'};
const server=http.createServer((req,res)=>{
  const part=decodeURIComponent((req.url||'/').split('?')[0]).slice(1)||'webcam.html';
  if(!allowed.has(part)){res.writeHead(404);res.end('Not found');return;}
  const p=path.join(root,part);
  fs.readFile(p,(err,data)=>{
    if(err){res.writeHead(404);res.end('Missing file');return;}
    res.writeHead(200,{'Content-Type':mime[path.extname(part)],'Cache-Control':'no-store',
      'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer',
      'Permissions-Policy':'camera=(self), microphone=()'});res.end(data);
  });
});
server.on('error',e=>{console.error('Local server error:',e.message);process.exitCode=1;});
server.listen(Number(process.env.SIHTI_PORT)||0,'127.0.0.1',()=>{
  const url=`http://127.0.0.1:${server.address().port}/webcam.html`;
  console.log('SAVED RESIDUE / LIVE WEBCAM\nServing only your local PC.\nOpen: '+url+'\nPress Ctrl+C to stop the server.');
  if(process.platform==='win32'&&!process.env.SIHTI_NO_BROWSER){
    cp.exec(`start "" "${url}"`,{windowsHide:true},e=>{if(e)console.log('Open the URL shown above manually:',e.message)});
  }
});
