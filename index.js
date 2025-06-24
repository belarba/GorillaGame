let state = {};

const canvas = document.getElementById('game');

const angle1DOM = document.querySelector("#info-left .angle");
const velocity1DOM = document.querySelector("#info-left .velocity");

const angle2DOM = document.querySelector("#info-right .angle");
const velocity2DOM = document.querySelector("#info-right .velocity");

const bombGrabAreaDom = document.getElementById('bomb-grab-area');

const congratulationsDOM = document.getElementById('congratulations');
const winnerDOM = document.getElementById('winner');
const newGameButtonDOM = document.getElementById('new-game');

const blastHoleRadius = 18;

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

const ctx = canvas.getContext('2d');

let isDragging = false;
let dragStartX = undefined;
let dragStartY = undefined;

let simulationMode = false;
let simulationImpact = {};

let numberOfPlayers = 1;

newGame();

newGameButtonDOM.addEventListener('click', newGame);

window.addEventListener('resize', () => {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  calculateScale();
  initializeBombPosition();
  draw();
});

bombGrabAreaDom.addEventListener('mousedown', function (e) {
  if (state.phase === 'aiming') {
    isDragging = true;
    dragStartX = e.clientX;
    dragStartY = e.clientY;

    document.body.style.cursor = 'grabbing';
  }
});

window.addEventListener('mousemove', function (e) {
  if (isDragging) {
    let deltaX = e.clientX - dragStartX;
    let deltaY = e.clientY - dragStartY;

    state.bomb.velocity.x = -deltaX;
    state.bomb.velocity.y = deltaY;
    setInfo(deltaX, deltaY);

    draw();
  }
});

window.addEventListener('mouseup', function () {
  if (isDragging) {
    isDragging = false;
    document.body.style.cursor = 'default';

    throwBomb();
  }
});

function setInfo(deltaX, deltaY) {
  const hypotenuse = Math.sqrt(deltaX ** 2 + deltaY ** 2);
  const angleInRadians = Math.asin(deltaY / hypotenuse);
  const angleInDegrees = (angleInRadians / Math.PI) * 180;

  if (state.currentPlayer === 1) {
    angle1DOM.innerText = Math.round(angleInDegrees);
    velocity1DOM.innerText = Math.round(hypotenuse);
  } else {
    angle2DOM.innerText = Math.round(angleInDegrees);
    velocity2DOM.innerText = Math.round(hypotenuse);
  }
}

function newGame() {
  state = {
    phase: 'aiming', // 'aiming', 'in flight', 'celebrating'
    currentPlayer: 1,
    round: 1,
    bomb: {
      x: undefined,
      y: undefined,
      rotation: 0,
      velocity: {x: 0, y: 0},
    },

    backgroundBuildings: [],
    buildings: [],
    blastHoles: [],

    scale: 1,
  };

  //generate background buildings
  for (let i = 0; i < 11; i++) {
    generateBackgroundBuilding(i);
  }

  //generate buildings
  for (let i = 0; i < 8; i++) {
    generateBuilding(i);
  }

  calculateScale();

  initializeBombPosition();

  //reset html
  congratulationsDOM.style.visibility = 'hidden';
  angle1DOM.innerText = '0';
  velocity1DOM.innerText = '0';
  angle2DOM.innerText = '0';
  velocity2DOM.innerText = '0';

  draw();

  if (numberOfPlayers === 0) computerThrow();
}

function draw() {
  ctx.save();

  ctx.translate(0, window.innerHeight);
  ctx.scale(1, -1);
  ctx.scale(state.scale, state.scale);

  drawBackground();
  drawBackgroundBuildings();
  drawBuildingsWithBlastHoles();
  drawGorilla(1);
  drawGorilla(2);
  drawBomb();

  ctx.restore();
}

function throwBomb() {
  if (simulationMode) {
    previousAnimateTimestamp = 0;
    animate(16);
  } else {
    state.phase = 'in flight';
    previousAnimateTimestamp = undefined;
    requestAnimationFrame(animate);
  }
}

function animate(timestamp) {
  if (previousAnimateTimestamp === undefined) {
    previousAnimateTimestamp = timestamp;
    requestAnimationFrame(animate);
    return;
  } 

  const elapsedTime = timestamp - previousAnimateTimestamp;

  const hitDetectionPrecision = 10;
  for (let i = 0; i < hitDetectionPrecision; i++) {
    moveBomb(elapsedTime / hitDetectionPrecision);

    //Hit detection
    const miss = checkFrameHit() || checkBuildingHit();
    const hit = checkGorillaHit();

    if (simulationMode && (hit || miss)) {
      simulationImpact = {x: state.bomb.x, y: state.bomb.y};
      return;
    }

    //handle hit building or bomb falling off the screen
    if (miss) {
      state.currentPlayer = state.currentPlayer === 1 ? 2 : 1;
      if (state.currentPlayer === 1) state.round++;
      state.phase = 'aiming';
      initializeBombPosition();

      draw();

      const computerThrowNext = numberOfPlayers === 0 || (numberOfPlayers === 1 && state.currentPlayer === 2);

      if (computerThrowNext) setTimeout(computerThrow, 50);

      return;
    }

    //handle hit enemy
    if (hit) {
      state.phase = 'celebrating';
      announceWinner();
      draw();
      return; 
    }
  }

  if (!simulationMode) draw();

  previousAnimateTimestamp = timestamp;
  if (simulationMode) {
    animate(timestamp + 16)
  } else {
    requestAnimationFrame(animate);
  }
}

function announceWinner() {
  winnerDOM.innerText = `Player ${state.currentPlayer}`;
  congratulationsDOM.style.visibility = 'visible';
}

function checkFrameHit() {
  if (
    state.bomb.x < 0 ||
    state.bomb.y < 0 ||
    state.bomb.x > window.innerWidth / state.scale
  ) {
    return true; // Bomb is out of bounds
  }
}

function checkBuildingHit() {
  for (let i = 0; i < state.buildings.length; i++) {
    const building = state.buildings[i];

    if (
      state.bomb.x + 4 > building.x &&
      state.bomb.x - 4 < building.x + building.width &&
      state.bomb.y - 4 < building.height
    ) {
      //check blast holes
      for (let j = 0; j < state.blastHoles.length; j++) {
        const hole = state.blastHoles[j];
        
        const horizontalDistance = state.bomb.x - hole.x;
        const verticalDistance = state.bomb.y - hole.y;
        const distance = Math.sqrt(horizontalDistance ** 2 + verticalDistance ** 2);
        if (distance < blastHoleRadius) {
          return false; // Bomb hit an existing blast hole
        }
      }

      // Bomb hit the building
      if (!simulationMode) {
        state.blastHoles.push({x: state.bomb.x, y: state.bomb.y});
      };
      return true;
    }
  }
}

function checkGorillaHit() {
  const enemyPlayer = state.currentPlayer === 1 ? 2 : 1;
  const enemyBuilding = enemyPlayer === 1 ? state.buildings.at(1) : state.buildings.at(-2);

  ctx.save();

  ctx.translate(enemyBuilding.x + enemyBuilding.width / 2, enemyBuilding.height);

  //is point in path checks the last path drawn
  drawGorillaBody();
  let hit = ctx.isPointInPath(state.bomb.x, state.bomb.y);

  drawGorillaLeftArm(enemyPlayer);
  hit = hit || ctx.isPointInPath(state.bomb.x, state.bomb.y);

  drawGorillaRightArm(enemyPlayer);
  hit = hit || ctx.isPointInPath(state.bomb.x, state.bomb.y);

  ctx.restore();
  return hit;
}

function moveBomb(elapsedTime) {
  const multiplier = elapsedTime / 300; // Convert milliseconds to seconds

  state.bomb.velocity.y -= 20 * multiplier; // Gravity effect

  state.bomb.x += state.bomb.velocity.x * multiplier;
  state.bomb.y += state.bomb.velocity.y * multiplier;

  const direction = state.currentPlayer === 1 ? -1 : 1;
  state.bomb.rotation += direction * 5 * multiplier;
}

function generateBackgroundBuilding(index) {
  const previousBuilding = state.backgroundBuildings[index - 1];

  const x = previousBuilding ? previousBuilding.x + previousBuilding.width + 4 : -30;

  const minWidth = 60;
  const maxWidth = 110;
  const width = minWidth + Math.random() * (maxWidth - minWidth);

  const minHeight = 80;
  const maxHeight = 350;
  const height = minHeight + Math.random() * (maxHeight - minHeight);

  state.backgroundBuildings.push({x, width, height});
}

function generateBuilding(index) {
  const previousBuilding = state.buildings[index - 1];

  const x = previousBuilding ? previousBuilding.x + previousBuilding.width + 4 : 0;

  const minWidth = 80;
  const maxWidth = 130;
  const width = minWidth + Math.random() * (maxWidth - minWidth);

  const platformWithGorilla = index === 1 || index === 6;

  const minHeight = 40;
  const maxHeight = 300;
  const minHeightGorilla = 30;
  const maxHeightGorilla = 150;

  const height = platformWithGorilla
    ? minHeightGorilla + Math.random() * (maxHeightGorilla - minHeightGorilla)
    : minHeight + Math.random() * (maxHeight - minHeight);

  const lightsOn = [];
  for (let i = 0; i < 50; i++) {
    const light = Math.random() <= 0.33 ? true : false;
    lightsOn.push(light);
  }

  state.buildings.push({
    x,
    width,
    height,
    lightsOn,
  });
}

function initializeBombPosition() {
  const building = state.currentPlayer === 1 ? state.buildings.at(1) : state.buildings.at(-2);

  const gorillaX = building.x + building.width / 2;
  const gorillaY = building.height;

  const gorillaHandOffsetX = state.currentPlayer === 1 ? -28 : 28;
  const gorillaHandOffsetY = 107;

  state.bomb.x = gorillaX + gorillaHandOffsetX;
  state.bomb.y = gorillaY + gorillaHandOffsetY;
  state.bomb.velocity.x = 0;
  state.bomb.velocity.y = 0;
  state.bomb.rotation = 0;

  //bomb position in the DOM
  const grabAreaRadius = 15;
  const left = state.bomb.x * state.scale - grabAreaRadius;
  const bottom = state.bomb.y * state.scale - grabAreaRadius;
  bombGrabAreaDom.style.left = `${left}px`;
  bombGrabAreaDom.style.bottom = `${bottom}px`;
}

function drawBackground() {
  const gradient = ctx.createLinearGradient(0, 0, 0, window.innerHeight / state.scale);
  gradient.addColorStop(1, '#F8BA85');
  gradient.addColorStop(0, '#FFC28E');

  //sky
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, window.innerWidth / state.scale , window.innerHeight / state.scale);

  //moon
  ctx.fillStyle = "rgba(255, 255, 255, 0.6)";
  ctx.beginPath();
  ctx.arc(300,350,60,0,2*Math.PI);
  ctx.fill();
}

function drawBackgroundBuildings() {
  state.backgroundBuildings.forEach(building => {
    ctx.fillStyle = '#947285';
    ctx.fillRect(building.x, 0, building.width, building.height);
  });
}

function drawBuildings() {
  state.buildings.forEach(building => {
    ctx.fillStyle = '#4A3C68';
    ctx.fillRect(building.x, 0, building.width, building.height);

    //lights
    const windowWidth = 10;
    const windowHeight = 12;
    const gap = 15;

    const numberOfFloors = Math.ceil((building.height - gap) / (windowHeight + gap));

    const numberOfRoomsPerFloor = Math.floor((building.width - gap) / (windowWidth + gap));

    for (let floor = 0; floor < numberOfFloors; floor++) {
      for (let room = 0; room < numberOfRoomsPerFloor; room++) {
        if (building.lightsOn[floor * numberOfRoomsPerFloor + room]) {
          ctx.save();
          
          ctx.translate(building.x + gap, building.height - gap);
          ctx.scale(1, -1);

          const x = room * (windowWidth + gap);
          const y = floor * (windowHeight + gap);

          ctx.fillStyle = '#EBB6A2';
          ctx.fillRect(x, y, windowWidth, windowHeight);

          ctx.restore();
        }
      }
    }
  });
}

function drawBuildingsWithBlastHoles() {
  ctx.save();

  state.blastHoles.forEach((hole) => {
    ctx.beginPath();

    //outer shape
    ctx.rect(
      0,
      0,
      window.innerWidth / state.scale,
      window.innerHeight / state.scale
    )

    //inner shape - counterclockwise
    ctx.arc(hole.x, hole.y, blastHoleRadius, 0, Math.PI * 2, true);

    ctx.clip();
  });

  drawBuildings();
  ctx.restore();
}

function drawGorilla(player) {
  ctx.save();

  const building = player === 1 ? state.buildings.at(1) : state.buildings.at(-2);

  ctx.translate(building.x + building.width / 2, building.height);

  drawGorillaBody();
  drawGorillaLeftArm(player);
  drawGorillaRightArm(player);
  drawGorillaFace(player);
  drawGorillaThoughtBubbles(player);

  ctx.restore();
}

function drawGorillaLeftArm(player) {
  ctx.strokeStyle = 'black';
  ctx.lineWidth = 18;

  ctx.beginPath();
  ctx.moveTo(-14, 50);

  if (state.phase === 'aiming' && state.currentPlayer === 1 && player === 1) {
    ctx.quadraticCurveTo(
      -44,
      63,
      -28 - state.bomb.velocity.x / 6.25,
      107 - state.bomb.velocity.y / 6.25
    );
  } else if (state.phase === 'celebrating' && state.currentPlayer === player) {
    ctx.quadraticCurveTo(
      -44,
      63,
      -28,
      107
    );
  } else {
    ctx.quadraticCurveTo(-44, 45, -28, 12);
  }

  ctx.stroke();
}

function drawGorillaRightArm(player) {
  ctx.strokeStyle = 'black';
  ctx.lineWidth = 18;

  ctx.beginPath();
  ctx.moveTo(14, 50);

  if (state.phase === 'aiming' && state.currentPlayer === 2 && player === 2) {
    ctx.quadraticCurveTo(
      44,
      63,
      28 - state.bomb.velocity.x / 6.25,
      107 - state.bomb.velocity.y / 6.25
    );
  } else if (state.phase === 'celebrating' && state.currentPlayer === player) {
    ctx.quadraticCurveTo(
      44,
      63,
      28,
      107
    );
  } else {
    ctx.quadraticCurveTo(
      44,
      45,
      28,
      12
    );
  }

  ctx.stroke();
}

function drawGorillaBody() {
  ctx.fillStyle = 'black';

  ctx.beginPath();
  ctx.moveTo(0, 15);
  ctx.lineTo(-7,0);
  ctx.lineTo(-20, 0);
  ctx.lineTo(-17, 18);
  ctx.lineTo(-20, 44);

  ctx.lineTo(-11,77);
  ctx.lineTo(0, 84);
  ctx.lineTo(11, 77);

  ctx.lineTo(20, 44);
  ctx.lineTo(17, 18);
  ctx.lineTo(20, 0);
  ctx.lineTo(7, 0);

  ctx.fill();
}

function drawGorillaFace(player) {
  //face
  ctx.fillStyle = 'lightgray';
  ctx.beginPath();
  ctx.arc(0, 63, 9, 0, Math.PI * 2);
  ctx.moveTo(-3.5, 70);
  ctx.arc(-3.5, 70, 4, 0, Math.PI * 2);
  ctx.moveTo(3.5, 70);
  ctx.arc(3.5, 70, 4, 0, Math.PI * 2);
  ctx.fill();

  //eyes
  ctx.fillStyle = 'black';
  ctx.beginPath();
  ctx.arc(-3.5, 70, 1.4, 0, Math.PI * 2);
  ctx.moveTo(3.5, 70);
  ctx.arc(3.5, 70, 1.4, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = 'black';
  ctx.lineWidth = 1.4;

  //nose
  ctx.beginPath();
  ctx.moveTo(-3.5, 66.5);
  ctx.lineTo(-1.5, 65);
  ctx.moveTo(3.5, 66.5);
  ctx.lineTo(1.5, 65);
  ctx.stroke();

  //mouth
  ctx.beginPath();
  if (state.phase === 'celebrating' && state.currentPlayer === player) {
    ctx.moveTo(-5, 60);
    ctx.quadraticCurveTo(0, 56, 5, 60);
  } else {
    ctx.moveTo(-5, 56);
    ctx.quadraticCurveTo(0, 60, 5, 56);
  }
  ctx.stroke();
  
}

function drawGorillaThoughtBubbles(player) {
  if (state.phase === 'aiming') {
    const currentPlayerIsComputer = 
      (numberOfPlayers === 0 && state.currentPlayer === 1 && player === 1) ||
      (numberOfPlayers !== 2 && state.currentPlayer === 2 && player === 2);
    
    if (currentPlayerIsComputer) {
      ctx.save();
      ctx.scale(1, -1);

      ctx.font = '20px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('?', 0, -90);

      ctx.font = '10px sans-serif';

      ctx.rotate((5 / 180) * Math.PI);
      ctx.fillText('?', 0, -90);

      ctx.rotate((-10 / 180) * Math.PI);
      ctx.fillText('?', 0, -90);

      ctx.restore();
    }
  }
}

function drawBomb() {
  ctx.save();
  ctx.translate(state.bomb.x, state.bomb.y);

  if (state.phase === 'aiming') {
    ctx.translate(-state.bomb.velocity.x / 6.25, -state.bomb.velocity.y / 6.25);

    ctx.strokeStyle = "rgba(255, 255, 255, 0.7)";
    ctx.setLineDash([3, 8]);
    ctx.lineWidth = 3;

    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(state.bomb.velocity.x, state.bomb.velocity.y);
    ctx.stroke();

    // Draw the bomb body
    ctx.fillStyle = 'white';
    ctx.beginPath();
    ctx.arc(0, 0, 6, 0, Math.PI * 2);
    ctx.fill();
  } else if (state.phase === 'in flight') {
    //rotatin banana
    ctx.fillStyle = 'white';
    ctx.rotate(state.bomb.rotation);
    ctx.beginPath();
    ctx.moveTo(-8, -2);
    ctx.quadraticCurveTo(0, 12, 8, -2);
    ctx.quadraticCurveTo(0, 2, -8, -2);
    ctx.fill();
  } else {
    ctx.fillStyle = 'white';
    ctx.beginPath();
    ctx.arc(0, 0, 6, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

function calculateScale() {
  const lastBuilding = state.buildings.at(-1);
  const totalWidthOfTheCity = lastBuilding.x + lastBuilding.width;

  state.scale = window.innerWidth / totalWidthOfTheCity;
}

function runSimulations(numberOfSimulations) {
  let bestThrow = {velocityX: undefined, velocityY: undefined, distance: Infinity};
  simulationMode = true;

  const enemyBuilding = state.currentPlayer === 1 ? state.buildings.at(-2) : state.buildings.at(1);
  const enemyX = enemyBuilding.x + enemyBuilding.width / 2;
  const enemyY = enemyBuilding.height + 30;

  for (let i = 0; i < numberOfSimulations; i++) {
    const angleInDegrees = Math.random() * 90 + 0;
    const angleInRadians = (angleInDegrees / 180) * Math.PI;
    const velocity = Math.random() * 100 + 40;

    const direction = state.currentPlayer === 1 ? 1 : -1;
    const velocityX = Math.cos(angleInRadians) * velocity * direction;
    const velocityY = Math.sin(angleInRadians) * velocity;

    initializeBombPosition();
    state.bomb.velocity.x = velocityX;
    state.bomb.velocity.y = velocityY;

    throwBomb();

    const distance = Math.sqrt(
      (enemyX - simulationImpact.x) ** 2 + (enemyY - simulationImpact.y) ** 2
    );

    if (distance < bestThrow.distance) {
      bestThrow = {
        velocityX,
        velocityY,
        distance,
      };
    }
  }

  simulationMode = false;
  return bestThrow;
}

function computerThrow() {
  const numberOfSimulations = 2 + state.round * 3;
  const bestThrow = runSimulations(numberOfSimulations);

  initializeBombPosition();
  state.bomb.velocity.x = bestThrow.velocityX;
  state.bomb.velocity.y = bestThrow.velocityY;

  setInfo(bestThrow.velocityX, bestThrow.velocityY);

  draw();
  
  setTimeout(throwBomb, 1000);
}