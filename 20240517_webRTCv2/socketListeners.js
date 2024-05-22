//on connection get all available offers and call createOfferEls
socket.on('availableOffers', offers => {
    console.log(offers);
    createOffersEls(offers);
})

//someone just made a new offer and we are already here - call createOfferEls
socket.on('newOfferAwaiting', offers => {
    createOffersEls(offers);
})

socket.on('answerResponse', offerObj => {
    console.log(offerObj);
    addAnswer(offerObj);
});

socket.on('receivedIceCandidateFromServer', iceCandidate => {
    addNewIceCandidate(iceCandidate);
    console.log(iceCandidate);
});

function createOffersEls(offers){
   const answerEl = document.querySelector('#answer');
   offers.forEach(offer => {
        console.log(offer);
        const newOfferEl = document.createElement('div');
        newOfferEl.innerHTML = `<button class="btn btn-success col-1">Answer ${offer.offererUserName}</button>`;
        newOfferEl.addEventListener('click', () => answerOffer(offer));
        answerEl.appendChild(newOfferEl);
   });
}