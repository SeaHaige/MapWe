
var child_process=require('child_process');
var http = require('http');
const net = require('net');
const ini = require('ini');
var fs = require('fs');
 
var websocketlist=[];
var listensessionlist=[];
var saveconfig=null;

var localmap=[];
try{
saveconfig=fs.readFileSync("save.json");
}catch(err){}
if(saveconfig==null) saveconfig={localmap:[]}
else saveconfig=JSON.parse(saveconfig)

const config = ini.parse(fs.readFileSync('config.ini', 'utf-8'));

console.log("MapWeServer start listen port "+config.MapWeServer.port+".");

localmap=saveconfig.localmap;
for(var obj of localmap) obj.remoteport=0;

var devicesession=[]
var WebSocketServer = require('ws').Server,
wss = new WebSocketServer({ port: config.MapWeServer.port });
wss.on('connection', function (ws) {
	ws.deviceid='';
	ws.requiremap=0; 
	ws.live=new Date().getTime();
	ws.logged=false;
	ws.on('ping',function(){
		ws.live=new Date().getTime();
	});
	ws.on('pong',function(){
	});
	ws.on('error',function(){
	});

	function set_port_info(message){
		let serviceport=message;
		let portnum=0;
		if(serviceport!='')
			portnum=serviceport.split(',').length;
		let num=0;
		let saveflag=0;
		for(let k=0;k<localmap.length;k++){
			if(localmap[k].remotedeviceid==ws.deviceid ){
				if(num<portnum){
					let destport=parseInt(serviceport.split(',')[num]);
					if(destport!=localmap[k].remoteport)
						saveflag=1;
					localmap[k].remoteport=destport;
				}
				else{
					saveflag=1;
					localmap[k].remoteport=0;
					//k--;
				}
				num++;
			}
		}
		if(num<portnum){
			saveflag=1;
			for(let k=num;k<portnum;k++){
				let findflag=0;
				for(let i=0;i<localmap.length;i++)
				if(localmap[i].remoteport==0){
					localmap[i].localport=i;
					localmap[i].remotedeviceid=ws.deviceid;
					localmap[i].remoteport=parseInt(serviceport.split(',')[k]);
					findflag=1;
					break;
				}
				if(!findflag)
				localmap.push({localport:localmap.length,
					remotedeviceid:ws.deviceid,
					remoteport:parseInt(serviceport.split(',')[k])
				})
			}
		}
		if(saveflag)
		{
			fs.writeFileSync("save.json",JSON.stringify(saveconfig));
			for (const sock of websocketlist) {
			 if(sock.requiremap){
					sock.send("mapinfo")
					sock.send(JSON.stringify(localmap))
			 }
			}
		}
	}
  ws.on('message', function (message,isbin) {
    if(!isbin) {
		message=message.toString();
		if( message.length==24 && message.substring(0,4)=='log:'){
			ws.deviceid=message.substring(4);
			let findf=0;
			for(const sock of websocketlist){
				if(sock.deviceid==ws.deviceid)
					findf=1;
			}
			if(!findf){
				console.log("device login:"+ws.deviceid+"...")
				websocketlist.push(ws); 
				ws.logged=true; 
			}else{
				ws.send("error:device id already exist!!!")
				ws.close();
				return;
			}
		}
	}
	if(!ws.logged)
	{
		return;
	}
	if(isbin){
		if(ws.sendtype==1){
			let idx=-1;
			for(let k=0;k<devicesession.length;k++)
			if(devicesession[k].cid==ws.sendconnect)
			{
				idx=websocketlist.findIndex((x)=>(x.deviceid==devicesession[k].sourcedevice))
				if(idx>=0){
					websocketlist[idx].send("tot:"+ws.sendconnect)
					websocketlist[idx].send(message)
				}
				break;
			}
		}
		if(ws.sendtype==2){
			for(var k=0;k<websocketlist.length;k++){
				if(websocketlist[k].deviceid==ws.senddevice){
					websocketlist[k].send(message)
					break;
				}
			}
		} 
		return;
	}
	if(  message =='requiremap'){ 
		ws.requiremap=1;
		ws.send("mapinfo")
		ws.send(JSON.stringify(localmap))
	}else
	if( message.substring(0,5) =='port:'){
		set_port_info(message.substring(5));
	}else
	if( message.length==20 && message.substring(0,7)=='sclose:'){
		let cid=message.substring(7);
		let idx=devicesession.findIndex((x)=>(x.cid==cid && x.sourcedevice==ws.deviceid));
		if(idx>=0){ 
			let idx2=websocketlist.findIndex((x)=>(x.deviceid==devicesession[idx].device))
			if(idx2>=0){
			  websocketlist[idx2].send("sclose:"+cid);
			}
			devicesession.splice(idx,1);
		}
	}else
	if( message.length==19 && message.substring(0,6)=='close:'){
		let cid=message.substring(6);
		let idx=devicesession.findIndex((x)=>(x.cid==cid && x.device==ws.deviceid));
		if(idx>=0){
			let idx2=websocketlist.findIndex((x)=>(x.deviceid==devicesession[idx].sourcedevice))
			if(idx2>=0){
			  websocketlist[idx2].send("close:"+cid);
			}
			devicesession.splice(idx,1);
		}
	}else
	if( message.substring(0,4)=='tor:'){
		let cid=message.substring(4,17);
		let localid=message.substring(18);
		let portidx=0;
		for(let i=0;i<localid;i++)
		if(localmap[localid].remotedeviceid==localmap[i].remotedeviceid){
			portidx++;
		}
		for(let k=0;k<websocketlist.length;k++){
			if(websocketlist[k].deviceid==localmap[localid].remotedeviceid){
				websocketlist[k].send('tos:'+cid+','+portidx)
				let idx=-1;
				idx=devicesession.findIndex((x)=>(x.cid==cid))
				if(idx<0)
					devicesession.push({cid:cid,device:websocketlist[k].deviceid,sourcedevice:ws.deviceid})
				ws.senddevice=websocketlist[k].deviceid;
				ws.sendtype=2;
				break;
			}
		}
    }else
    if( message.length==17 && message.substring(0,4)=='toc:'){
		ws.sendconnect=message.substring(4);
		ws.sendtype=1;
    }else
    if( message.length==6 && message=='logout'){
		console.log("device logout:"+ws.deviceid+"!!!")
		ws.close();
		let idx=websocketlist.indexOf(ws);
		if(idx>=0)
		websocketlist.splice(idx,1);
	}
  });
});

setInterval(function(){
	let ct=new Date().getTime();
	for(let k=0;k<websocketlist.length;k++){
		if(ct-websocketlist[k].live>10*1000){ 
			websocketlist[k].close();
			websocketlist.splice(k,1);
			k--;
		}
	}
},5000);
process.on('uncaughtException', function(e){
	console.log(e)
});
