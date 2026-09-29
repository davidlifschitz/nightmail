(()=>{'use strict';
const E=window.NightmailEngine,$=id=>document.getElementById(id),KEY='obg.nightmail.v1';
let S=null,cfg=null,memories=[],sel={card:null,target:null,guess:null},busy=false,revealed=true,peekQueue=[];

// ---------- setup ----------
E.ROLES.forEach(r=>{
  const d=document.createElement('div');d.className='role-row';
  d.innerHTML=`<span class="ic">${r.icon}</span><span><b>${r.name}</b> — ${r.text}</span><span class="rv">×${r.count} · ${r.rank}</span>`;
  $('roleList').appendChild(d);
});
$('startBtn').addEventListener('click',startMatch);
$('playBtn').addEventListener('click',doHumanPlay);
$('cancelBtn').addEventListener('click',()=>{resetSel();render();});
$('privacyBtn').addEventListener('click',()=>{$('privacyOverlay').classList.add('hidden');revealed=true;render();});
$('peekBtn').addEventListener('click',()=>{$('peekOverlay').classList.add('hidden');drainPeekQueue();});
$('endPrimary').addEventListener('click',endPrimary);
$('endSecondary').addEventListener('click',()=>{$('endOverlay').classList.add('hidden');$('gameRoot').classList.add('hidden');$('setupPanel').classList.remove('hidden');S=null;try{localStorage.removeItem(KEY);}catch(_e){}});

function startMatch(){
  const m=$('mode').value;
  const players=m.endsWith('2')?2:m.endsWith('3')?3:4;
  const mode=m.startsWith('bots')?'bots':'local';
  const t=$('target').value;
  cfg={mode,players,difficulty:$('difficulty').value,target:t==='auto'?null:Number(t),bots:[]};
  if(mode==='bots')for(let p=1;p<players;p++)cfg.bots.push(p);
  S=E.createGame({players,target:cfg.target||undefined});
  memories=[];for(let p=0;p<players;p++)memories.push(E.createMemory(players));
  resetSel();busy=false;peekQueue=[];
  $('setupPanel').classList.add('hidden');
  $('gameRoot').classList.remove('hidden');
  save();beginTurn();
}
function isBot(p){return cfg.bots.includes(p);}
function humanSeats(){const h=[];for(let p=0;p<cfg.players;p++)if(!isBot(p))h.push(p);return h;}
function resetSel(){sel={card:null,target:null,guess:null};}

// ---------- persistence ----------
function save(){try{localStorage.setItem(KEY,JSON.stringify({S,cfg}));}catch(_e){}}
function restore(){
  try{
    const x=JSON.parse(localStorage.getItem(KEY));
    if(!x||!x.S||!x.cfg||x.S.players<2)return false;
    S=x.S;cfg=x.cfg;S._rng=E.mulberry32(Math.floor(Math.random()*0xffffffff));
    memories=[];for(let p=0;p<cfg.players;p++)memories.push(E.createMemory(cfg.players));
    resetSel();busy=false;peekQueue=[];
    $('setupPanel').classList.add('hidden');$('gameRoot').classList.remove('hidden');
    return true;
  }catch(_e){return false;}
}

// ---------- turn flow ----------
function beginTurn(){
  if(!S)return;
  if(S.phase!=='play'){showEnd();return;}
  const p=S.turn;
  if(!S.alive[p]){beginTurn();return;} // engine skips, but stay safe
  if(isBot(p)){
    revealed=false;render();
    busy=true;setStatus(`${seatName(p)} is thinking…`);
    setTimeout(()=>{
      if(!S||S.phase!=='play'){busy=false;return;}
      try{
        const mv=E.botMove(S,p,cfg.difficulty,Math.random,memories[p])||{handIndex:0};
        const{state,events}=E.playMove(S,mv);S=state;
        events.forEach(e=>{if(e.type==='peeked'&&e.privateTo===p)E.noteSeen(memories[p],e.target,e.card);});
      }catch(_e){}
      busy=false;save();render();beginTurn();
    },650+Math.random()*500);
    return;
  }
  // human turn
  if(cfg.mode==='local'){
    revealed=false;
    $('privacyTitle').textContent=`${seatName(p)} — your turn`;
    $('privacyOverlay').classList.remove('hidden');
  }else revealed=true;
  resetSel();render();
  const moves=E.legalMoves(S);
  if(moves.length===1&&moves[0].card==='stoker')setStatus('The Stoker must be discarded — it rides with dangerous company.');
  else setStatus('Drawn. Play one card.');
}

function seatName(p){
  if(cfg.mode==='bots')return p===0?'You':`Bot ${p}`;
  return`Courier ${p+1}`;
}

// ---------- human play ----------
function currentMoves(){return S&&S.phase==='play'?E.legalMoves(S):[];}
function moveFor(handIndex){return currentMoves().find(m=>m.handIndex===handIndex);}

function onCardClick(i){
  if(busy||!S||S.phase!=='play'||isBot(S.turn))return;
  const m=moveFor(i);if(!m)return;
  sel={card:i,target:null,guess:null};
  if(m.card==='inspector'&&m.targets.length===1&&m.targets[0]===S.turn){sel.target=S.turn;}
  render();
}
function onSeatClick(p){
  if(busy||!S||sel.card==null)return;
  const m=moveFor(sel.card);if(!m||!m.needsTarget)return;
  const ok=m.card==='inspector'?(p===S.turn||m.targets.includes(p)):m.targets.includes(p);
  if(!ok)return;
  sel.target=p;render();
}
function onGuessClick(g){sel.guess=g;render();}

function selectionComplete(){
  if(sel.card==null)return false;
  const m=moveFor(sel.card);if(!m)return false;
  if(needsTargetPick(m)&&sel.target==null)return false;
  if(m.needsGuess&&m.targets.length>0&&!sel.guess)return false;
  return true;
}
// Does this move still need the human to pick a target? A card with no legal
// targets (everyone lantern-lit) may be played for no effect.
function needsTargetPick(m){
  if(!m.needsTarget)return false;
  if(m.card==='inspector'&&m.targets.length===1&&m.targets[0]===S.turn)return false; // self only, pre-picked
  return m.targets.length>0;
}

function doHumanPlay(){
  if(!selectionComplete()||busy)return;
  const m=moveFor(sel.card);
  try{
    const{state,events}=E.playMove(S,{handIndex:sel.card,target:sel.target??null,guess:sel.guess||null});
    S=state;
    events.forEach(e=>{
      if(e.type==='peeked'&&!isBot(e.privateTo))peekQueue.push(e);
    });
    resetSel();save();render();
    drainPeekQueue();
  }catch(_e){setStatus('That play is not legal.');}
}

function drainPeekQueue(){
  if(!peekQueue.length){beginTurn();return;}
  const e=peekQueue.shift();
  const r=E.ROLE_BY_KEY[e.card];
  $('peekIcon').textContent=r.icon;
  $('peekText').textContent=`${seatName(e.target)} holds the ${r.name} (rank ${r.rank}).`;
  $('peekOverlay').classList.remove('hidden');
}

// ---------- rendering ----------
function setStatus(t){$('statusLine').innerHTML=t;}

function render(){
  if(!S||!cfg)return;
  renderSeats();renderTable();renderHand();renderActionBar();
}
function renderSeats(){
  const el=$('seats');let html='';
  for(let p=0;p<S.players;p++){
    const alive=S.alive[p],prot=E.isProtected(S,p),active=S.phase==='play'&&S.turn===p&&alive;
    const m=sel.card!=null?moveFor(sel.card):null;
    let targetable=false;
    if(m&&m.needsTarget&&alive&&!isBot(S.turn)){
      targetable=m.card==='inspector'?(p===S.turn||m.targets.includes(p)):m.targets.includes(p);
    }
    const backs=S.hands[p].map(()=>'<span class="cardback">✉</span>').join('');
    html+=`<div class="seat${active?' active':''}${targetable?' targetable':''}${alive?'':' eliminated'}" data-seat="${p}">`
      +`<div class="nm"><span>${seatName(p)}${p===S.turn&&cfg.mode==='local'?' · to play':''}</span><span class="tokens">◈ ${S.tokens[p]}</span></div>`
      +`<div class="hand">${alive?backs:''}</div>`
      +`${prot?'<span class="badge prot">lantern lit</span>':''}`
      +`${alive?'':'<span class="badge out">eliminated</span>'}`
      +`${cfg.mode==='bots'&&p===0?'<span class="badge you">you</span>':''}`
      +`</div>`;
  }
  el.innerHTML=html;
  el.querySelectorAll('.seat').forEach(s=>s.addEventListener('click',()=>onSeatClick(Number(s.dataset.seat))));
}
function renderTable(){
  $('roundNum').textContent=S.round;
  $('deckCount').textContent=S.deck.length;
  $('setAsideInfo').textContent=S.players===2?'1 hidden + 3 face-up':'1 hidden';
  const counts={};E.ROLES.forEach(r=>counts[r.key]=0);S.discard.forEach(k=>counts[k]++);
  $('discardPool').innerHTML=E.ROLES.map(r=>
    `<div class="discard-cell"><span class="ic">${r.icon}</span><b>${counts[r.key]}</b>/${r.count}<br>${r.name}</div>`).join('');
  const lg=$('log');
  lg.innerHTML=S.log.slice(-25).map(e=>`<div>${e.msg}</div>`).join('');
  lg.scrollTop=lg.scrollHeight;
}
function cardHTML(key,idx,selectable,selected){
  const r=E.ROLE_BY_KEY[key];
  return`<button class="pcard${selected?' selected':''}" data-card="${idx}" ${selectable?'':'disabled'}>`
    +`<span class="rank">${r.rank}</span><span class="icon">${r.icon}</span>`
    +`<span class="rname">${r.name}</span><span class="rtext">${r.text}</span>`
    +`<span class="rval">RANK ${r.rank} · ×${r.count} IN DECK</span></button>`;
}
function renderHand(){
  const hz=$('hand');const p=S.turn;
  const humanTurn=S.phase==='play'&&!isBot(p)&&S.alive[p];
  if(!humanTurn||!revealed){hz.innerHTML='';return;}
  const moves=currentMoves();
  hz.innerHTML=S.hands[p].map((k,i)=>{
    const m=moves.find(x=>x.handIndex===i);
    return cardHTML(k,i,!!m&&!busy,sel.card===i);
  }).join('');
  hz.querySelectorAll('.pcard').forEach(b=>b.addEventListener('click',()=>onCardClick(Number(b.dataset.card))));
  const tt=$('turnTitle'),th=$('turnHint');
  if(S.phase==='play'){
    tt.textContent=cfg.mode==='bots'?'Your turn':`${seatName(p)} — your turn`;
    th.textContent='Drawn. Play one card.';
  }
}
function renderActionBar(){
  const m=sel.card!=null?moveFor(sel.card):null;
  const gg=$('guessGrid');
  if(m&&m.needsGuess){
    gg.classList.remove('hidden');
    gg.innerHTML=m.guesses.map(g=>{const r=E.ROLE_BY_KEY[g];
      return`<button data-guess="${g}" class="${sel.guess===g?'sel':''}">${r.icon} ${r.name} <span class="small">${r.rank}</span></button>`;}).join('');
    gg.querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>onGuessClick(b.dataset.guess)));
  }else{gg.classList.add('hidden');gg.innerHTML='';}
  $('playBtn').disabled=!selectionComplete()||busy;
  $('cancelBtn').disabled=sel.card==null||busy;
  if(m&&needsTargetPick(m)&&sel.target==null)setStatus('Choose a target courier — tap a glowing seat.');
  else if(m&&m.needsGuess&&m.targets.length>0&&!sel.guess)setStatus('Name the role you suspect they hold.');
  else if(m&&m.card==='inspector'&&sel.target===S.turn)setStatus('Inspecting yourself: you will discard and draw fresh.');
  else if(m&&m.needsTarget&&!needsTargetPick(m))setStatus('No courier can be targeted — the card fizzles, but you may still play it.');
}

// ---------- end of round / match ----------
function showEnd(){
  const w=S.roundWinner;
  if(S.phase==='matchOver'){
    $('endIcon').textContent='🏆';
    $('endTitle').textContent=`${seatName(S.matchWinner)} wins the match!`;
    $('endText').textContent=`Final tokens — ${S.tokens.map((t,i)=>`${seatName(i)}: ${t}`).join(' · ')}. The night line is yours.`;
    $('endPrimary').textContent='Play again';
  }else{
    $('endIcon').textContent='🏁';
    $('endTitle').textContent=w==null?'Round tied — no token':`${seatName(w)} takes the round`;
    $('endText').textContent=`Tokens — ${S.tokens.map((t,i)=>`${seatName(i)}: ${t}`).join(' · ')}. First to ${S.target} takes the match.`;
    $('endPrimary').textContent='Next round';
  }
  $('endOverlay').classList.remove('hidden');
  renderSeats();renderTable();
}
function endPrimary(){
  $('endOverlay').classList.add('hidden');
  if(S.phase==='matchOver'){
    const keep=cfg;S=E.createGame({players:keep.players,target:keep.target||undefined});
    memories=[];for(let p=0;p<keep.players;p++)memories.push(E.createMemory(keep.players));
  }else{
    try{S=E.nextRound(S);}catch(_e){return;}
  }
  resetSel();busy=false;peekQueue=[];save();render();beginTurn();
}

// ---------- boot ----------
if(!restore()){
  // fresh: stay on setup
}
})();
