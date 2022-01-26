
//./yolov5 -d yolov5s.engine ../samples
//pptpsetup --create --server 60.205.224.130 --username vpn002 --password Hnbd@2021 --encrypt --start
//
var ws = require("ws");
const net = require('net');
const ini = require('ini');
const fs = require('fs');
var deviceid;
var serveraddr;
var serviceport='';
var localport=0;
var sock;
let cnlist=[]
let cursendidx=-1;
let pingalive=0;
let sockconnected=0;
var localmap=[];
let cursendlocalidx=-1;
var localsocklist=[];
var listensocklist=[];
var maplist=[]

function createlistenport(localid,portid,mapinfo){
	if( localport==0||localmap[localid].remoteport==0)
		return;
	let idx=listensocklist.findIndex((x)=>(x.device==localmap[localid].remotedeviceid
		&& x.remoteport==localmap[localid].remoteport
		&& x.port==portid+localport))
	if(idx>=0){
		listensocklist[idx].validflag=1;
		return;
	}
	const servsock = net.createServer(socket => {
		let cid=new Date().getTime();
		sock.send('tor:'+cid+','+localid);
		sock.tor='tor:'+cid+','+localid;
		sock.send(Buffer.alloc(0));
		localsocklist.push({sock:socket,cid:cid})
		socket.on('data', data => {
			sock.send('tor:'+cid+','+localid)
			sock.send(data);
		});
	  socket.on('error', _ => {
	    socket.destroy();
			let idx=localsocklist.findIndex((x)=>(x.sock==socket))
			if(idx>=0)
				localsocklist.splice(idx,1)

		  if(sockconnected)
				sock.send("sclose:"+cid)
	  });
	  socket.on('end', _ => {
	    socket.destroy();
			let idx=localsocklist.findIndex((x)=>(x.sock==socket))
			if(idx>=0)
				localsocklist.splice(idx,1)
			if(sockconnected)
				sock.send("sclose:"+cid)

	  });
	});
	mapinfo.str+=(" "+localmap[localid].remotedeviceid
		+':'+localmap[localid].remoteport
		+"->"+(portid+localport))+"\r\n"
	mapinfo.num++;
	servsock.listen(portid+localport, "", _ => {
	});
	listensocklist.push({sock:servsock,device:localmap[localid].remotedeviceid
			,remoteport:localmap[localid].remoteport
			,port:portid+localport,validflag:1})
}
var connectstate=0;
function connectserver(){
	if(connectstate) return;

	connectstate=1;
	for(var k=0;k<cnlist.length;k++){
		cnlist[k].sock.destroy();
	}
	cnlist=[]
	sock = new ws(serveraddr);
	sockconnected=0;
	sock.tor=''
	sock.on("open", function () {
		connectstate=0;
		sockconnected=1;
		pingalive=new Date().getTime();
		sock.send("log:"+deviceid);
		sock.send("port:"+serviceport)
		if(localport){ 
			sock.send("requiremap");
		}
	});
	function createnewsocket(cid,portidx){
		let  tcpsocket = new net.Socket();
		cnlist.push({sock:tcpsocket,cid:cid});
		let port = parseInt(serviceport.split(',')[portidx]);
		let hostname = "127.0.0.1";
		tcpsocket.connect( port,hostname,function(){
		});
		tcpsocket.on( 'data', function ( msg ) {
		  if(sockconnected){
			  sock.send("toc:"+cid)
			  sock.send(msg)
			  sock.tor=''
		  }
		});
		tcpsocket.on( 'error', function ( error ) {
			tcpsocket.destroy();
		  if(sockconnected)
				sock.send("close:"+cid)
		  let idx=cnlist.findIndex((x)=>(x.cid==cid));
		  if(idx>=0) {
			  cnlist.splice(idx,1)
		  }
		  console.log("tcpsocket error." )
		});
		tcpsocket.on('close',function(){
			tcpsocket.destroy();
		  if(sockconnected)
				sock.send("close:"+cid)
		  let idx=cnlist.findIndex((x)=>(x.cid==cid));
		  if(idx>=0) {
			  cnlist.splice(idx,1)
		  } 
		});
		return tcpsocket;
	}
	sock.on("message",function(data,isbin){
		pingalive=new Date().getTime();
		if(!isbin && data.length==7 && data.toString()=='mapinfo'){
			cursendtype=3;
		}else
		if(!isbin && data.length==20 && data.toString().substring(0,7)=='sclose:'){
			let sid=data.toString().substring(7);
			let idx=cnlist.findIndex((x)=>(x.cid==sid));
		  if(idx>=0) {
				cnlist[idx].sock.destroy();
			  cnlist.splice(idx,1)
		  }
		}else
		if(!isbin && data.length==19 && data.toString().substring(0,6)=='close:'){
			let sid=data.toString().substring(6);
			let idx=localsocklist.findIndex((x)=>(x.cid==sid));
			if(idx>=0){
				localsocklist[idx].sock.destroy();
				localsocklist.splice(idx,1);
			}
		}else
		if(!isbin && data.length==17 && data.toString().substring(0,4)=='tot:'){
			cursendtype=1;
			let sid=data.toString().substring(4);
			cursendlocalidx=localsocklist.findIndex(
					(x)=>(x.cid==sid)
				);
		}else
		if(!isbin && data.length==19 && data.toString().substring(0,4)=='tos:'){
			let data2=data.toString().substring(0,4);
			data=data.toString().substring(4);
			let sid=data.substring(0,13)
			let portidx=parseInt(data.substring(14))
			let idx=cnlist.findIndex((x)=>(x.cid==sid));
			if(idx<0){
				createnewsocket(sid,portidx);

				idx=cnlist.length-1
			}
			cursendtype=2;
			cursendidx=idx;
		}else
		if(!isbin && data.toString().substring(0,6)=='error:'){
			console.log(data.toString())
			process.exit(0);
		}else
		{
			if(cursendtype==1){
				if(localsocklist.length
					&& cursendlocalidx>=0 && cursendlocalidx<localsocklist.length)
				localsocklist[cursendlocalidx].sock.write(data)
			}
			if(cursendtype==2){
				if(cnlist.length
					&& cursendidx>=0 && cursendidx<cnlist.length)
				cnlist[cursendidx].sock.write(data)
			}
			if(cursendtype==3){
				let map=JSON.parse(data.toString());
				let eqflag=0;
				if(map.length==localmap.length){
					let eqnum=0;
					for(let k=0;k<map.length;k++){
						if(map[k].localport==localmap.localport
							&& map[k].remoteport==localmap.remoteport
								&& map[k].remotedeviceid==localmap.remotedeviceid
						){
							eqnum++;
						}
					}
					if(eqnum==map.length){
						eqflag=1;
					}
				}
				if(!eqflag){
					for(let k=0;k<listensocklist.length;k++)
					listensocklist[k].validflag=0;

					localmap=map;
					let startport=0;
					let mapinfo={num:0,str:"start mapping:\r\n"}
					if( localport!=0)
					for(let k=0;k<localmap.length;k++){
						if(maplist=='all'
							||typeof maplist!='string' && localmap[k].remoteport!=0
								&& maplist.indexOf(localmap[k].remotedeviceid)>=0){
								createlistenport(k,maplist=='all'?localmap[k].localport:startport
									,mapinfo);
								startport++;
						}
					}
					if(mapinfo.num){
						console.log(mapinfo.str)
					}
					for(let k=0;k<listensocklist.length;k++){
						if(!listensocklist[k].validflag)
						{
							listensocklist[k].sock.close()
							listensocklist.splice(k,1)
							k--;
						}
					}
				}
			}
		}
	})
	sock.on("error", function(err) {
		console.log("error: ", err);
			connectstate=0; 
			setTimeout(function(){ 
				connectserver();
			},1000)
	});
	sock.on("ping",function(){
		pingalive=new Date().getTime();
	})
	sock.on("pong",function(){
		pingalive=new Date().getTime();
	})
	sock.on("close", function() {
		connectstate=0;
		
		setTimeout(function(){ 
			connectserver();
		},1000)

	});
}

const config = ini.parse(fs.readFileSync('config.ini', 'utf-8'));

serveraddr="ws://"+config.MapWeClient.host;
if(config.MapWeClient.host.indexOf(':')<0) serveraddr+="8109";
deviceid=config.MapWeClient.id;
localport=parseInt(config.MapWeClient.localport);
if(isNaN(localport)) localport=0;
serviceport=config.MapWeClient.serviceport;
maplist=config.MapWeClient.mapping;
if(typeof maplist=='undefined'){
	maplist='all'
}
if(maplist!='all'){
	maplist=maplist.split(',')
}
console.log("MapWe Client start...")
connectserver();
setInterval(function(){
	if(pingalive && new Date().getTime()-pingalive>35000){
		pingalive=0;
		connectserver();
	}
	if(sockconnected)
		sock.ping();
},3000)
process.on('SIGINT', function() {
 if(sockconnected){
	 sock.send("logout")
 }
 process.exit();

});
process.on('uncaughtException', function(e){
	console.log(e)
});
