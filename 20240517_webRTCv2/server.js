const express = require('express');
const app = express();
const https = require('https');
const fs = require('fs');
const socketio = require('socket.io');
app.use(express.static(__dirname));

const serverUrl = 'https://192.168.43.181:4200/';

//
// hay que instalar mkcert de forma global
// npm install -g mkcert
// en caso de que no funcione el comando mkcert create-cert en la terminal de vscode...
// usar la terminal de windows y ejecutar:
// bash: powershell -ExecutionPolicy Bypass -Command "mkcert create-ca"
// bash: powershell -ExecutionPolicy Bypass -Command "mkcert create-cert"
// bash: Set-ExecutionPolicy Restricted -Scope Process
// 20240515

const key = fs.readFileSync('./keys/cert.key');
const cert = fs.readFileSync('./keys/cert.crt');

const expressServer = https.createServer({ key, cert }, app);
const io = socketio(expressServer);

expressServer.listen(4200, () => {
    console.log('....Server running on port 4200....');
    console.log('\n', serverUrl);
});

//offers will contain {}
const offers = [
    // {
    // offererUsername
    // offer
    // offerIceCandidates
    // answererUsername
    // answer
    // answerIceCandidates
    // }
];

const connectedSockets = [
    //userName, socketId
];


io.on('connection', socket => {
    const userName = socket.handshake.auth.userName;
    const password = socket.handshake.auth.password;

    if(password !== 'x'){
        socket.disconnect();
        return;
    }
    connectedSockets.push({
        userName,
        socketId: socket.id
    });

    //a new client has joined. If there are any offer available,
    //emit them out
    if(offers.length > 0){
        socket.emit('availableOffers', offers);
    }
    socket.on('newOffer', newOffer => {
        console.log('Received new offer');
        offers.push({
            offererUserName: userName,
            offer: newOffer,
            offerIceCandidates: [],
            answererUserName: null,
            answer: null,
            answerIceCandidates: []
        });
        // console.log(newOffer.sdp.slice(50));
        //send out to all connected sockets except the caller
        socket.broadcast.emit('newOfferAwaiting', offers.slice(-1));
    });

    socket.on('newAnswer', (offerObj, ackFunction) => {
        console.log('-- Server has received new answer: --> note that the answer is a description of the REMOTE session, including the remote media streams, codec, and options for the local peer to connect to');
        // console.log(offerObj); //this object contains offererUserName, offer, and answer. not yet offerIceCandidates and answerIceCandidates and answererUserName
        //emit this answer to the offerer(client1)
        //in order to do that, we need to find the offerer(client1's socketId) in the offers array
        const socketToAnswer = connectedSockets.find(socket => socket.userName === offerObj.offererUserName);
        if(!socketToAnswer){
            console.error('ERROR: Socket to answer not found :(');
            return;
        }
        //we found the matching socket, so we can emit to it
        const socketIdToAnswer = socketToAnswer.socketId;
        //we find the offer to update so we can emit it
        const offerToUpdate = offers.find(offer => offer.offererUserName === offerObj.offererUserName);
        if(!offerToUpdate){
            console.error('ERROR: Offer to update not found :(');
            return;
        }
        //send back to the answerer all the iceCandidates we have already collected
        ackFunction(offerToUpdate.offerIceCandidates);
        offerToUpdate.answer = offerObj.answer;
        offerToUpdate.answererUserName = userName;
        //socket has a .to() which allows emiting to a "room"
        //every socket has it's own room
        socket.to(socketIdToAnswer).emit('answerResponse', offerToUpdate);

    });

    socket.on('sendIceCandidateToSignalingServer', iceCandidateObj => {
        const { didIOffer, iceUserName, iceCandidate } = iceCandidateObj;
        console.log('Received new ICE candidate');
        // console.log(iceCandidate);
        if(didIOffer){
            //this ice is comming from the offerer. send to the answerer
            const offerInOffers = offers.find(offer => offer.offererUserName === iceUserName);
            if(offerInOffers){
                offerInOffers.offerIceCandidates.push(iceCandidate);
                //1. When the answerer answers, all exsisting ice candidates are sent
                //2. Any candidates that come in after the offer has been answered, will be passed through
                if(offerInOffers.answererUserName){
                    //pass it trough to the other socket
                    const socketToSendTo = connectedSockets.find(socket => socket.userName === offerInOffers.answererUserName);
                    if(socketToSendTo){
                        socket.to(socketToSendTo.socketId).emit('receivedIceCandidateFromServer', iceCandidate);
                    }else{
                        console.error('ERROR: Ice candidate found but could not find answerer :(');
                    }
                }
            }
        }else{
            //this ice is comming from the answerer. send to the offerer
            //pass it trough to the other socket
            const offerInOffers = offers.find(offer => offer.answererUserName === iceUserName);
            const socketToSendTo = connectedSockets.find(socket => socket.userName === offerInOffers.offererUserName);
            if(socketToSendTo){
                socket.to(socketToSendTo.socketId).emit('receivedIceCandidateFromServer', iceCandidate);
            }else{
                console.error('ERROR: Ice candidate found but could not find offerer :(');
            }
        }
        // console.log(offers);
    });
});