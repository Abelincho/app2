const userName = 'Jhon Doe' + Math.floor(Math.random() * 1000000);
const password = 'x';
document.querySelector('#user-name').innerHTML = userName;

const socket = io.connect('https://localhost:4200/',{
    auth: {
        userName,password
    }
});

const localVideoEl = document.querySelector('#local-video');
const remoteVideoEl = document.querySelector('#remote-video');

let localStream; // Will hold the local stream object to be used by the connection
let remoteStream; // Will hold the remote stream object to be used by the connection
let peerConnection; // Will hold the peer connection object
let didIOffer = false; // Will be used to determine if the user is the caller

let peerConfiguration = {
    iceServers: [
        {
            urls:[
                'stun:stun.l.google.com:19302',
                'stun:stun1.l.google.com:19302'
            ]
        }
    ]
}

//when a client initiates a call
const call = async () => {
    await fetchUserMedia();

    //peerConnection is all set with our STUN servers sent over
    await createPeerConnection();

    //createOffer time!
    try{
        console.log('Creating offer...');
        const offer = await peerConnection.createOffer();
        console.log('Offer created: \n ---> note that the offer is a description of the LOCAL session, including the local media streams, codec, and options for the remote peer to connect to');
        console.log(offer);
        peerConnection.setLocalDescription(offer);
        didIOffer = true;
        socket.emit('newOffer', offer);//send the offer to the signaling server
    }catch(err){
        console.error('Error creating offer:', err);
    }
};

const answerOffer = async (offerObj) => {
    console.log('Answering offer...');
    await fetchUserMedia();
    await createPeerConnection(offerObj);
    const answer = await peerConnection.createAnswer({});//empty object because we are not passing any options
    await peerConnection.setLocalDescription(answer);//this is client2, and client2 uses the answer as the local description
    console.log(offerObj);
    console.log('Answer created: \n ---> note that the answer is a description of the REMOTE session, including the remote media streams, codec, and options for the local peer to connect to');
    // console.log(answer);
    // console.log('Should be have-local-offer and is: ',peerConnection.signalingState);//should be 'have-local-offer' because setLocalDescription has been run, then CLIENT2 has set its localDescription to its answer (but it wont be)
    // add the answer to the offerObj so the server knows which offer this is related to
    offerObj.answer = answer;
    // emit the answer to the signaling server, so it can emit to the client1
    // expect a response from the server with the already existing ICE candidates
    console.log('Emitting answer to signaling server!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
    const offerIceCandidates = await socket.emitWithAck('newAnswer', offerObj);
    console.log('Offer ICE candidates:', offerIceCandidates);
    offerIceCandidates.forEach(iceCandidate => {
        peerConnection.addIceCandidate(iceCandidate);
        
    });

};

const addAnswer = async (offerObj) => {
    //addAnswer is called in socketListeners.js when an answerResponse is emitted 
    //at this point, the offer and answer have been exchanged!
    //now CLIENT1 needs to set the remote description to the answer
    await peerConnection.setRemoteDescription(offerObj.answer);
    console.log('Signaling state should be have-remote-prancer and is: ',peerConnection.signalingState);//this part is explained at the end of the part 35
};

const fetchUserMedia = () => {
    return new Promise(async(resolve, reject) => {
        try{
            const stream = await navigator.mediaDevices.getUserMedia({ 
                video: true, 
                // audio: true 
            });
            localVideoEl.srcObject = stream;
            localStream = stream;
            resolve();
        }catch(err){
            console.error('Error fetching user media:', err);
            reject();
        }
    });
};

//create a peer connection when a call is initiated
const createPeerConnection = async (offerObj) => {
    return new Promise(async(resolve, reject) => {
        //RTCPeerConnection creates the connection
        //we can pass a config object, and that config object can contain stun servers
        //which will fetch us ICE candidates
        peerConnection = await new RTCPeerConnection(peerConfiguration);
        remoteStream = new MediaStream();
        remoteVideoEl.srcObject = remoteStream;


        localStream.getTracks().forEach(track => {
            //add localTracjs so that they can be sent once the connection is established
            peerConnection.addTrack(track, localStream);
        });

        peerConnection.addEventListener('signalingstatechange',(e) => {
            console.log(e);
            console.log('Signaling state change:', peerConnection.signalingState);
        });

        peerConnection.addEventListener('icecandidate', e => {
            console.log('..........Ice candidate found!..........');
            console.log(e);
            if(e.candidate){
                socket.emit('sendIceCandidateToSignalingServer', {
                    iceCandidate: e.candidate,
                    iceUserName: userName,
                    didIOffer
                });
            }
        });

        peerConnection.addEventListener('track', e => {
            console.log('..........Track found!..........');
            // console.log(e);
            e.streams[0].getTracks().forEach(track => {
                remoteStream.addTrack(track, remoteStream);
            });
        });

        if(offerObj){
            //this wont be set when called from the call function
            //will be set when called from the answerOffer function
            // console.log('before setting remote description, the signalingstate is:', peerConnection.signalingState);//should be 'stable' becuase no setRemoteDescription has been run yet
            await peerConnection.setRemoteDescription(offerObj.offer);
            // console.log('after setting remote description, the signalingstate is:', peerConnection.signalingState);//should be 'have-remote-offer' because setRemoteDescription has been run
        }
        resolve();
    });
};

const addNewIceCandidate = (iceCandidate) => {
    peerConnection.addIceCandidate(iceCandidate);
    console.log('==================ICE candidate added==================');
};


document.querySelector('#call').addEventListener('click', call);