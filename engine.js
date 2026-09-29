(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.NightmailEngine=api;})(typeof self!=='undefined'?self:this,function(){
'use strict';

// ---------------------------------------------------------------------------
// Nightmail — an original Love-Letter-style micro card game.
//
// Couriers race to deliver the sealed Night Dispatch to the Night Conductor.
// Each courier holds one card, draws one on their turn, then plays one.
// Last courier standing — or highest rank when the deck runs out — takes the
// round. First to the token target takes the match.
//
// All roles, names, flavor, and artwork are original. The elimination
// skeleton (draw-one-play-one, hidden hands, ranked roles) is inspired by the
// single-card-hand elimination genre.
// ---------------------------------------------------------------------------

const ROLES=[
 {key:'lookout',  name:'Lookout',        rank:1, count:5, icon:'◎', text:'Name a role other than Lookout. If another courier holds it, they are eliminated.'},
 {key:'signalman',name:'Signalman',      rank:2, count:2, icon:'⚑', text:'Look at another courier\u2019s hand.'},
 {key:'brakeman', name:'Brakeman',       rank:3, count:2, icon:'⚙', text:'Choose a courier. Compare hands in secret \u2014 the lower rank is eliminated. A tie eliminates no one.'},
 {key:'lantern',  name:'Lantern Bearer', rank:4, count:2, icon:'✦', text:'You are protected from every other courier\u2019s card effects until your next turn.'},
 {key:'inspector',name:'Inspector',      rank:5, count:2, icon:'⌕', text:'Choose a courier, yourself allowed. They discard their hand and draw a new card. Discarding the Night Dispatch eliminates them.'},
 {key:'switchman',name:'Switchman',      rank:6, count:1, icon:'⇄', text:'Trade hands with another courier.'},
 {key:'stoker',   name:'Stoker',         rank:7, count:1, icon:'♨', text:'If you ever hold this together with the Switchman or the Night Dispatch, you must discard the Stoker.'},
 {key:'dispatch', name:'Night Dispatch', rank:8, count:1, icon:'✉', text:'If you discard this for any reason, you are eliminated.'},
];
const ROLE_BY_KEY={};ROLES.forEach(r=>ROLE_BY_KEY[r.key]=r);
const FULL_DECK=[];ROLES.forEach(r=>{for(let i=0;i<r.count;i++)FULL_DECK.push(r.key);}); // 16 cards

function mulberry32(seed){let a=seed>>>0;return function(){a|=0;a=(a+0x6D2B79F5)|0;let t=Math.imul(a^(a>>>15),1|a);t=(t+Math.imul(t^(t>>>7),61|t))^t;return((t^(t>>>14))>>>0)/4294967296;};}

function shuffle(deck,rng){const d=deck.slice();for(let i=d.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));const t=d[i];d[i]=d[j];d[j]=t;}return d;}

function defaultTarget(players){return players===2?7:players===3?5:4;}

function createGame(options){
  options=options||{};
  const players=Math.max(2,Math.min(4,Number(options.players)||2));
  const target=Number(options.target)||defaultTarget(players);
  const rng=mulberry32(options.seed==null?Math.floor(Math.random()*0xffffffff):Number(options.seed));
  const s={players,target,tokens:Array(players).fill(0),round:0,phase:'play',
    deck:[],hands:[],alive:[],discard:[],faceUpRemoved:[],setAside:null,
    protectedUntil:Array(players).fill(-1),turn:0,turnCount:0,
    roundWinner:null,matchWinner:null,log:[]};
  startRound(s,rng);
  s._rng=rng;
  return s;
}

function startRound(s,rng){
  rng=rng||s._rng||mulberry32(Math.floor(Math.random()*0xffffffff));
  s.round++;s.phase='play';s.roundWinner=null;
  s.deck=shuffle(FULL_DECK,rng);
  s.setAside=s.deck.pop(); // one card removed face-down, unseen
  s.faceUpRemoved=[];
  if(s.players===2){for(let i=0;i<3&&s.deck.length;i++)s.faceUpRemoved.push(s.deck.pop());}
  s.hands=[];s.alive=[];s.discard=[];
  for(let p=0;p<s.players;p++){s.hands.push([s.deck.pop()]);s.alive.push(true);}
  s.protectedUntil=Array(s.players).fill(-1);
  s.turn=0;s.turnCount=0;
  log(s,`Round ${s.round} begins. ${s.players===2?'Three cards were set aside face-up. ':''}One card was set aside face-down.`);
  drawForTurn(s); // first player draws before acting
}

function clone(s){
  return{players:s.players,target:s.target,tokens:s.tokens.slice(),round:s.round,phase:s.phase,
    deck:s.deck.slice(),hands:s.hands.map(h=>h.slice()),alive:s.alive.slice(),discard:s.discard.slice(),
    faceUpRemoved:s.faceUpRemoved.slice(),setAside:s.setAside,protectedUntil:s.protectedUntil.slice(),
    turn:s.turn,turnCount:s.turnCount,roundWinner:s.roundWinner,matchWinner:s.matchWinner,
    log:s.log.slice(),_rng:s._rng};
}

function log(s,msg){s.log.push({round:s.round,turn:s.turnCount,msg});}
function rankOf(key){return ROLE_BY_KEY[key].rank;}
function handRank(s,p){const h=s.hands[p];return h.length?rankOf(h[0]):0;}
function aliveCount(s){return s.alive.filter(Boolean).length;}
function isProtected(s,p){return s.alive[p]&&s.protectedUntil[p]>s.turnCount;}

// Opponents the current player's effects may legally target with `card`.
// Protected couriers cannot be named by anyone but themselves.
function validTargets(s,player,card){
  const out=[];
  for(let p=0;p<s.players;p++){
    if(!s.alive[p]||p===player)continue;
    if(isProtected(s,p))continue;
    out.push(p);
  }
  return out;
}

function mustDiscardStoker(s,player){
  const h=s.hands[player];
  return h.includes('stoker')&&(h.includes('switchman')||h.includes('dispatch'));
}

// All legal moves for the player whose turn it is. The player always holds 2
// cards at decision time (they drew at turn start).
function legalMoves(s){
  const p=s.turn;
  if(s.phase!=='play'||!s.alive[p])return[];
  const h=s.hands[p];
  const moves=[];
  const forced=mustDiscardStoker(s,p);
  for(let i=0;i<h.length;i++){
    const card=h[i];
    if(forced&&card!=='stoker')continue;
    const m={handIndex:i,card,needsTarget:false,needsGuess:false,targets:[],guesses:[]};
    if(card==='lookout'||card==='signalman'||card==='brakeman'||card==='switchman'){
      m.needsTarget=true;m.targets=validTargets(s,p,card);
      if(card==='lookout')m.needsGuess=true,m.guesses=ROLES.filter(r=>r.key!=='lookout').map(r=>r.key);
    }else if(card==='inspector'){
      m.needsTarget=true;
      m.targets=[p].concat(validTargets(s,p,card)); // may target self
    }
    moves.push(m);
  }
  return moves;
}

function eliminate(s,p,reason){
  if(!s.alive[p])return null;
  s.alive[p]=false;
  const held=s.hands[p].slice();
  s.hands[p]=[];
  held.forEach(k=>s.discard.push(k));
  s.protectedUntil[p]=-1;
  const ev={type:'eliminated',player:p,reason,revealed:held};
  log(s,`${name(p)} is eliminated (${reason})${held.length?` \u2014 revealed ${held.map(k=>ROLE_BY_KEY[k].name).join(', ')}`:''}.`);
  return ev;
}
function name(p){return`Courier ${p+1}`;}

function drawForTurn(s){
  const p=s.turn;
  if(s.deck.length===0){endRoundShowdown(s);return;}
  const c=s.deck.pop();
  s.hands[p].push(c);
  log(s,`${name(p)} draws. ${s.deck.length} card${s.deck.length===1?'':'s'} left in the deck.`);
}

// Play the card at handIndex. move={handIndex,target,guess}.
function playMove(input,move){
  const s=clone(input);
  const events=[];
  const p=s.turn;
  if(s.phase!=='play')throw new Error('Round is not in play');
  if(!s.alive[p])throw new Error('Current player is eliminated');
  const h=s.hands[p];
  const idx=move&&typeof move.handIndex==='number'?move.handIndex:-1;
  if(idx<0||idx>=h.length)throw new Error('Illegal card choice');
  const card=h[idx];
  if(mustDiscardStoker(s,p)&&card!=='stoker')throw new Error('Must discard the Stoker');

  h.splice(idx,1);
  s.discard.push(card);
  events.push({type:'played',player:p,card});
  log(s,`${name(p)} plays ${ROLE_BY_KEY[card].name}.`);

  const target=(move&&typeof move.target==='number')?move.target:null;
  const guess=move&&move.guess;

  const resolveTargeted=(kind)=>{
    if(target==null||!s.alive[target]){events.push({type:'fizzle',player:p,card,why:'no target'});return null;}
    if(kind!=='inspector'&&isProtected(s,target)){events.push({type:'fizzle',player:p,card,target,why:'protected'});log(s,`${name(target)} is protected by lantern light \u2014 no effect.`);return null;}
    return target;
  };

  if(card==='lookout'){
    const t=resolveTargeted('lookout');
    if(t!=null){
      const validGuess=guess&&ROLE_BY_KEY[guess]&&guess!=='lookout';
      const held=s.hands[t][0];
      if(validGuess&&held===guess){
        events.push({type:'guessHit',player:p,target:t,guess});
        log(s,`${name(p)} names ${ROLE_BY_KEY[guess].name} \u2014 correct!`);
        const ev=eliminate(s,t,`the Lookout named their ${ROLE_BY_KEY[held].name}`);
        if(ev)events.push(ev);
      }else{
        events.push({type:'guessMiss',player:p,target:t,guess:validGuess?guess:null});
        log(s,`${name(p)} names ${validGuess?ROLE_BY_KEY[guess].name:'nothing'} \u2014 wrong.`);
      }
    }
  }else if(card==='signalman'){
    const t=resolveTargeted('signalman');
    if(t!=null){
      const seen=s.hands[t][0];
      events.push({type:'peeked',player:p,target:t,card:seen,privateTo:p});
      log(s,`${name(p)} studies ${name(t)}\u2019s hand in secret.`);
    }
  }else if(card==='brakeman'){
    const t=resolveTargeted('brakeman');
    if(t!=null){
      const mine=handRank(s,p),theirs=handRank(s,t);
      events.push({type:'compared',player:p,target:t,mine,theirs});
      log(s,`${name(p)} and ${name(t)} compare in secret.`);
      if(mine>theirs){const ev=eliminate(s,t,'lost the Brakeman comparison');if(ev)events.push(ev);}
      else if(theirs>mine){const ev=eliminate(s,p,'lost the Brakeman comparison');if(ev)events.push(ev);}
      else log(s,'A tie \u2014 no one is eliminated.');
    }
  }else if(card==='lantern'){
    s.protectedUntil[p]=s.turnCount+s.players;
    events.push({type:'protected',player:p});
    log(s,`${name(p)} raises the lantern \u2014 protected until their next turn.`);
  }else if(card==='inspector'){
    let t=target;
    if(t==null||!s.alive[t])t=p; // default to self, always legal
    if(t!==p&&isProtected(s,t)){
      events.push({type:'fizzle',player:p,card,target:t,why:'protected'});
      log(s,`${name(t)} is protected by lantern light \u2014 no effect.`);
    }else{
    const discarded=s.hands[t].splice(0,s.hands[t].length);
    discarded.forEach(k=>s.discard.push(k));
    events.push({type:'forcedDiscard',player:p,target:t,discarded});
    log(s,`${name(t)} is inspected and discards ${discarded.map(k=>ROLE_BY_KEY[k].name).join(', ')||'nothing'}.`);
    if(discarded.includes('dispatch')){
      const ev=eliminate(s,t,'discarded the Night Dispatch under inspection');
      if(ev)events.push(ev);
    }else if(s.alive[t]){
      if(s.deck.length>0){const c=s.deck.pop();s.hands[t].push(c);events.push({type:'forcedDraw',player:t});log(s,`${name(t)} draws a new card.`);}
      else{events.push({type:'forcedDraw',player:t,card:null});log(s,'The deck is empty \u2014 no card to draw.');}
    }
    }
  }else if(card==='switchman'){
    const t=resolveTargeted('switchman');
    if(t!=null){
      const tmp=s.hands[p];s.hands[p]=s.hands[t];s.hands[t]=tmp;
      events.push({type:'swapped',player:p,target:t});
      log(s,`${name(p)} and ${name(t)} trade hands.`);
    }
  }else if(card==='stoker'){
    events.push({type:'noEffect',player:p,card});
    log(s,'The Stoker tends the fire. No effect.');
  }else if(card==='dispatch'){
    const ev=eliminate(s,p,'discarded the Night Dispatch');
    if(ev)events.push(ev);
  }

  // Did the round end?
  if(s.alive[p]&&aliveCount(s)===1){
    const w=s.alive.findIndex(Boolean);
    endRound(s,w,'last courier standing');
  }else if(!s.alive[p]&&aliveCount(s)===1){
    const w=s.alive.findIndex(Boolean);
    endRound(s,w,'last courier standing');
  }else if(aliveCount(s)===0){
    endRound(s,null,'everyone was eliminated');
  }else{
    advanceTurn(s);
  }
  return{state:s,events};
}

function advanceTurn(s){
  let n=s.turn;
  for(let i=0;i<s.players;i++){n=(n+1)%s.players;if(s.alive[n])break;}
  s.turn=n;s.turnCount++;
  drawForTurn(s);
}

function endRound(s,winner,why){
  s.phase='roundOver';s.roundWinner=winner;
  if(winner==null){
    log(s,`Round ${s.round} ends in a tie \u2014 no token awarded.`);
  }else{
    s.tokens[winner]++;
    log(s,`${name(winner)} takes round ${s.round} (${why}) \u2014 token ${s.tokens[winner]}/${s.target}.`);
    if(s.tokens[winner]>=s.target){s.phase='matchOver';s.matchWinner=winner;log(s,`${name(winner)} wins the match!`);}
  }
}

function endRoundShowdown(s){
  s.phase='roundOver';
  const contenders=[];
  for(let p=0;p<s.players;p++)if(s.alive[p])contenders.push(p);
  contenders.sort((a,b)=>handRank(s,b)-handRank(s,a));
  const top=contenders.length?handRank(s,contenders[0]):0;
  const tied=contenders.filter(p=>handRank(s,p)===top);
  log(s,`The deck is empty. ${contenders.map(p=>`${name(p)} holds ${s.hands[p].length?ROLE_BY_KEY[s.hands[p][0]].name:'nothing'}`).join('; ')}.`);
  if(tied.length===1)endRound(s,tied[0],'highest rank at the showdown');
  else endRound(s,null,'tied at the showdown');
}

// Start the next round (or false when the match is over).
function nextRound(input){
  const s=clone(input);
  if(s.phase!=='roundOver')throw new Error('Round is not over');
  startRound(s,s._rng);
  return s;
}

// ---------------------------------------------------------------------------
// Bot brain — probabilistic beliefs over hidden hands.
// memory = createMemory(); noteSeen(memory, viewer, target, key) records
// Signalman peeks (private). The bot also learns from the public discard pile
// and face-up removed cards.
// ---------------------------------------------------------------------------
function createMemory(players){
  const m={players,seen:Array(players).fill(null)};
  return m;
}
function noteSeen(memory,target,key){memory.seen[target]=key;}

// Counts of each role still unaccounted for from `player`'s perspective.
function remainingPool(s,player,memory){
  const pool={};ROLES.forEach(r=>pool[r.key]=r.count);
  const burn=k=>{pool[k]--;};
  s.discard.forEach(burn);s.faceUpRemoved.forEach(burn);
  s.hands[player].forEach(burn);
  if(memory)for(let p=0;p<s.players;p++){if(p!==player&&memory.seen[p])burn(memory.seen[p]);}
  return pool;
}
function poolTotal(pool){return Object.values(pool).reduce((a,b)=>a+b,0);}
// P(opponent o holds role r) under the uniform-unknown approximation.
function probHolds(s,player,o,r,memory){
  if(memory&&memory.seen[o])return memory.seen[o]===r?1:0;
  const pool=remainingPool(s,player,memory);
  const t=poolTotal(pool);
  if(t<=0)return 0;
  return Math.max(0,pool[r])/t;
}
function expectedRank(s,player,o,memory){
  let e=0;ROLES.forEach(r=>{e+=probHolds(s,player,o,r.key,memory)*r.rank;});
  return e;
}

function candidateTargets(s,player,card){
  // inspector may also pick self; handled by caller
  return validTargets(s,player,card);
}

// Choose a full move {handIndex,target,guess} for `player`.
function botMove(input,player,difficulty,rng,memory){
  const s=input; // read-only use
  rng=rng||Math.random;
  difficulty=difficulty||'medium';
  const moves=legalMoves(s);
  if(!moves.length)return null;
  const pick=a=>a[Math.floor(rng()*a.length)];

  if(difficulty==='easy'){
    const m=pick(moves);
    const out={handIndex:m.handIndex,card:m.card};
    if(m.needsTarget){
      const ts=m.card==='inspector'?[player].concat(m.targets):m.targets;
      out.target=ts.length?pick(ts):null;
    }
    if(m.needsGuess)out.guess=pick(m.guesses);
    return out;
  }

  // ---- medium / hard: score every (move,target,guess) candidate ----
  const myOtherRank=m=>{const h=s.hands[player];return rankOf(h[1-m.handIndex]);};
  const scored=[];
  for(const m of moves){
    const otherRank=myOtherRank(m);
    const base={handIndex:m.handIndex,card:m.card};
    const consider=(out,score,note)=>scored.push({out,score,note});
    if(m.card==='lookout'){
      let best=null;
      for(const t of m.targets)for(const g of m.guesses){
        const pr=probHolds(s,player,t,g,memory);
        const val=pr*(2+s.tokens[t]);
        if(!best||val>best.val)best={val,t,g};
      }
      if(best&&best.val>0.30)consider({...base,target:best.t,guess:best.g},best.val,'lookout');
      else consider({...base,target:m.targets[0]??null,guess:m.guesses[0]},0.05,'lookout-fallback');
    }else if(m.card==='signalman'){
      let bt=null,be=-1;
      for(const t of m.targets){const e=expectedRank(s,player,t,memory);if(e>be){be=e;bt=t;}}
      consider({...base,target:bt},0.55,'signalman');
    }else if(m.card==='brakeman'){
      let bt=null,bs=-1;
      for(const t of m.targets){
        let pWin=0;
        ROLES.forEach(r=>{const pr=probHolds(s,player,t,r.key,memory);if(otherRank>r.rank)pWin+=pr;});
        const sc=pWin*2-(1-pWin)*2.5;
        if(sc>bs){bs=sc;bt=t;}
      }
      if(bt!=null)consider({...base,target:bt},bs,'brakeman');
      else consider({...base,target:null},0.02,'brakeman-no-target');
    }else if(m.card==='lantern'){
      consider({...base},0.45+(otherRank>=6?0.9:otherRank>=4?0.3:0),'lantern');
    }else if(m.card==='inspector'){
      // opponent most likely holding the dispatch
      let bt=null,bp=-1;
      for(const t of m.targets){const pr=probHolds(s,player,t,'dispatch',memory);if(pr>bp){bp=pr;bt=t;}}
      if(bt!=null&&bp>0.18)consider({...base,target:bt},bp*3+0.3,'inspector-opp');
      // self-inspect holding a low card to cycle it
      if(otherRank<=3&&s.deck.length>2){
        const pool=remainingPool(s,player,memory);const t=poolTotal(pool);
        let eNew=0;if(t>0)ROLES.forEach(r=>{eNew+=Math.max(0,pool[r.key])/t*r.rank;});
        consider({...base,target:player},Math.max(0,(eNew-otherRank))*0.35+0.15,'inspector-self');
      }
      if(!scored.length||scored[scored.length-1].out.card!=='inspector')
        consider({...base,target:player},0.1,'inspector-fallback');
    }else if(m.card==='switchman'){
      let bt=null,bs=-1;
      for(const t of m.targets){const e=expectedRank(s,player,t,memory);const sc=(e-otherRank)*0.5;if(sc>bs){bs=sc;bt=t;}}
      if(bt!=null&&bs>0.25)consider({...base,target:bt},bs,'switchman');
      else consider({...base,target:m.targets[0]??null},0.05,'switchman-fallback');
    }else if(m.card==='stoker'){
      consider({...base},0.01,'stoker-forced');
    }else if(m.card==='dispatch'){
      consider({...base},-10,'dispatch-never');
    }
  }
  if(difficulty==='hard'){
    // hard = medium scoring plus a safety nudge: never throw away a likely
    // round-winning hold for a low-EV trick.
    for(const c of scored){
      if(c.out.card!=='dispatch'&&c.out.card!=='stoker'){
        const other=c.out.card?myOtherRank(moves.find(m=>m.handIndex===c.out.handIndex)):0;
        if(other>=7)c.score+=0.35; // keeping a near-top card for the showdown
      }
    }
  }
  scored.sort((a,b)=>b.score-a.score);
  const win=scored[0];
  return{handIndex:win.out.handIndex,card:win.out.card,target:win.out.target??null,guess:win.out.guess};
}

return{ROLES,ROLE_BY_KEY,FULL_DECK,createGame,clone,legalMoves,playMove,nextRound,
  mustDiscardStoker,isProtected,handRank,aliveCount,validTargets,
  createMemory,noteSeen,remainingPool,probHolds,expectedRank,botMove,
  mulberry32,defaultTarget};
});
